# training_platform/trainer/distributed_train_logic.py

import logging
import os
from pathlib import Path
from pprint import pformat
import copy
import shutil
import time
import torch
import draccus
import ray.train
from ray.train import Checkpoint
from ray.train.torch import prepare_model, prepare_data_loader
import ray.train.torch


# lerobot imports...
from lerobot.common.datasets.factory import make_dataset
from lerobot.common.datasets.utils import cycle
from lerobot.common.policies.factory import make_policy
from lerobot.common.optim.factory import make_optimizer_and_scheduler
from lerobot.common.utils.logging_utils import AverageMeter, MetricsTracker
from lerobot.common.utils.train_utils import get_step_checkpoint_dir, save_checkpoint, update_last_checkpoint, load_training_state
from lerobot.common.utils.utils import get_safe_torch_device
from lerobot.scripts.train import update_policy
from lerobot.configs.train import TrainPipelineConfig

import lerobot.common.envs.factory
import lerobot.common.policies.factory
from torch.amp.grad_scaler import GradScaler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def flatten_dict_for_draccus(d, parent_key='', sep='.'):
    # (这个辅助函数保持不变，非常有用)
    items = []
    for k, v in d.items():
        new_key = parent_key + sep + k if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict_for_draccus(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)


def train_func(config: dict):
    # -----------------
    # 1. Configuration (The Right Way)
    # -----------------
    base_config_path = config["base_config_path"]
    user_override_config = config["user_override_config"]
    run_dir = config["run_dir"]  # Our custom concept of a run directory
    real_dataset_path = config.get("real_dataset_path")
    # --- 使用 draccus 处理所有配置 ---
    args = [f"--config_path={base_config_path}"]

    # 将用户覆盖配置转换为命令行参数
    flat_user_config = flatten_dict_for_draccus(user_override_config)
    for key, value in flat_user_config.items():
        args.append(f"--{key}={value}")

    # **关键**: `run_dir` 包含了数据集的符号链接。
    # 我们告诉 lerobot，数据集的根目录就是 `run_dir/dataset`。
    # 这与测试脚本中创建的符号链接路径完全匹配。
    dataset_root = real_dataset_path
    args.append(f"--dataset.root={dataset_root}")
    
    # 我们也告诉 lerobot 输出目录就是 run_dir。
    args.append(f"--output_dir={run_dir}")

    # 使用 draccus 解析所有配置
    cfg: TrainPipelineConfig = draccus.parse(config_class=TrainPipelineConfig, args=args)

    # 将 output_dir 转换为 Path 对象以进行后续操作
    if isinstance(cfg.output_dir, str):
        cfg.output_dir = Path(cfg.output_dir)
    cfg.validate()
    
    # 2. validate() 执行后，cfg.optimizer 等字段已经被正确填充。
    #    同时，cfg.output_dir 目录也已经被创建。
    # -----------------
    # 2. Initialization
    # -----------------
    device = get_safe_torch_device(cfg.policy.device, log=ray.train.get_context().get_world_rank() == 0)
    torch.backends.cudnn.benchmark = True
    torch.backends.cuda.matmul.allow_tf32 = True

    # `make_dataset` 现在会使用正确的 `cfg.dataset.root`
    dataset = make_dataset(cfg)
    policy = make_policy(cfg=cfg.policy, ds_meta=dataset.meta)
    
    # 修复：`load_training_state` 需要 policy 对象
    optimizer, lr_scheduler = make_optimizer_and_scheduler(cfg, policy)
    grad_scaler = torch.cuda.amp.GradScaler(enabled=cfg.policy.use_amp)
    
    start_step = 0

    # ---------------------------------------------------
    # 3. Prepare for Distributed Training with Ray Train
    # ---------------------------------------------------
    checkpoint = ray.train.get_checkpoint()
    if checkpoint:
        with checkpoint.as_directory() as checkpoint_dir:
            logger.info(f"Loading checkpoint from: {checkpoint_dir}")
            last_checkpoint_path = Path(checkpoint_dir) / "last"
            if last_checkpoint_path.is_symlink():
                start_step, optimizer, lr_scheduler = load_training_state(
                    last_checkpoint_path, policy, optimizer, lr_scheduler # 传入 policy
                )
                logger.info(f"Resumed from checkpoint. Starting at step {start_step}.")
            else:
                logger.warning(f"Ray Train Checkpoint loaded, but 'last' symlink not found in {checkpoint_dir}. Starting from step 0.")

    policy = prepare_model(policy)
    

    dataloader = torch.utils.data.DataLoader(
        dataset,
        num_workers=cfg.num_workers,
        batch_size=cfg.batch_size,
        shuffle=True, # Recommended for DDP when not using a custom sampler
        sampler=None,
        pin_memory=device.type != "cpu",
        drop_last=True,
    )
    dataloader = prepare_data_loader(dataloader)
    dl_iter = cycle(dataloader)

    # CORRECTION 2: Remove inefficient dataloader fast-forwarding.
    # The training loop already starts from `start_step`, so the optimizer,
    # learning rate, and model weights are correct. Skipping dataloader
    # batches is slow and unnecessary. The `DistributedSampler` (used by
    # `prepare_data_loader`) will ensure data is shuffled differently
    # each epoch anyway.

    policy.train()

    # --------------------
    # 4. Training Loop
    # --------------------
    train_metrics = {
        "loss": AverageMeter("loss", ":.3f"), 
        "grad_norm": AverageMeter("grdn", ":.3f"), 
        "lr": AverageMeter("lr", ":0.1e"),
        # 添加下面这两行，与非 Ray 版本保持一致
        "update_s": AverageMeter("updt_s", ":.3f"), 
        "dataloading_s": AverageMeter("data_s", ":.3f"),
    }
    train_tracker = MetricsTracker(
        cfg.batch_size * ray.train.get_context().get_world_size(),
        dataset.num_frames, 
        dataset.num_episodes, 
        train_metrics, 
        initial_step=start_step
    )

    logger.info(f"Entering training loop from step {start_step} to {cfg.steps}...")
    # The loop correctly starts from the resumed step.
    for step in range(start_step, cfg.steps):
        dataloading_start_time = time.perf_counter()
        batch = next(dl_iter)
        dataloading_end_time = time.perf_counter()
        dataloading_time = dataloading_end_time - dataloading_start_time
        train_metrics["dataloading_s"].update(dataloading_time)
        
        for key in batch:
            if isinstance(batch[key], torch.Tensor):
                batch[key] = batch[key].to(device, non_blocking=True)

        actual_policy = policy.module if isinstance(policy, torch.nn.parallel.DistributedDataParallel) else policy
        
        train_tracker, output_dict = update_policy(
            train_tracker, actual_policy, batch, optimizer,
            cfg.optimizer.grad_clip_norm, grad_scaler=grad_scaler,
            lr_scheduler=lr_scheduler, use_amp=cfg.policy.use_amp,
        )
        current_step = step + 1

        # ------------------------------------
        # 5. Reporting and Checkpointing
        # ------------------------------------
        metrics_to_report = {}
        if cfg.log_freq > 0 and current_step % cfg.log_freq == 0:
            metrics_to_report = train_tracker.to_dict()
            if ray.train.get_context().get_world_rank() == 0:
                 logger.info(f"Step {current_step}: {metrics_to_report}")
            train_tracker.reset_averages()

        if cfg.save_checkpoint and current_step % cfg.save_freq == 0:
            checkpoint_dir = get_step_checkpoint_dir(cfg.output_dir, cfg.steps, current_step)
            # Only rank 0 needs to save the full state (optimizer, etc.)
            # and create the symlink. All workers save the model state.
            # Ray Train only persists the checkpoint from rank 0 anyway.
            if ray.train.get_context().get_world_rank() == 0:
                save_checkpoint(checkpoint_dir, current_step, cfg, actual_policy, optimizer, lr_scheduler)
                update_last_checkpoint(checkpoint_dir)
            
            # All workers must call this to stay in sync

            ray_checkpoint = Checkpoint.from_directory(checkpoint_dir.parent)
            metrics_to_report["checkpoint_step"] = current_step
            ray.train.report(metrics_to_report, checkpoint=ray_checkpoint)
        elif metrics_to_report:
            ray.train.report(metrics_to_report)
            
    logger.info(f"Training finished at step {cfg.steps}.")