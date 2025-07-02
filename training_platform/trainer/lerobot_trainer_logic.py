# training_platform/trainer/lerobot_trainer_logic.py (模块化版本)

import logging
from pathlib import Path
from pprint import pformat
from typing import Callable, Dict, Any, Tuple

import torch
from torch.amp import GradScaler
import draccus

# 导入所有 lerobot 的依赖
from lerobot.common.datasets.factory import make_dataset
from lerobot.common.datasets.sampler import EpisodeAwareSampler
from lerobot.common.datasets.utils import cycle
from lerobot.common.policies.factory import make_policy
from lerobot.common.optim.factory import make_optimizer_and_scheduler
from lerobot.common.utils.logging_utils import AverageMeter, MetricsTracker
from lerobot.common.utils.train_utils import (
    get_step_checkpoint_dir,
    load_training_state,
    save_checkpoint,
    update_last_checkpoint,
)
from lerobot.common.utils.utils import get_safe_torch_device
from lerobot.scripts.train import update_policy
from lerobot.configs.train import TrainPipelineConfig

# 在模块加载时，确保所有 lerobot 的插件都被注册
import lerobot.common.envs.factory
import lerobot.common.policies.factory


def prepare_config(
    base_config_path: str,
    user_override_config: Dict[str, Any],
    run_dir: str,
    start_step: int,
    end_step: int,
) -> TrainPipelineConfig:
    """
    第一阶段：加载、合并并准备最终的训练配置对象。
    """
    logging.info(f"Loading base config from: {base_config_path}")
    logging.info(f"Applying user override config: {user_override_config}")
    
    # 将用户覆盖字典转换为 draccus 能理解的命令行参数列表
    overrides = []
    for key, value in user_override_config.items():
        if isinstance(value, dict):
            for inner_key, inner_value in value.items():
                overrides.append(f"--{key}.{inner_key}={inner_value}")
        else:
            overrides.append(f"--{key}={value}")
 
    # 直接调用 draccus.parse 来加载和合并
    cfg: TrainPipelineConfig = draccus.parse(
        config_class=TrainPipelineConfig,
        config_path=base_config_path,
        args=overrides
    )
    
    # 强制覆盖平台管理的参数
    cfg.resume = start_step > 0
    cfg.steps = user_override_config.get('steps', cfg.steps) # 任务总步数应来自用户配置
    
    # 如果数据集已经下载到本地，则覆盖 repo_id
    local_dataset_unpacked_path = Path(run_dir) / "dataset"
    if local_dataset_unpacked_path.exists():
        # 我们不再直接用这个路径，而是把它当作 repo_id 传给 lerobot
        # lerobot 的 make_dataset 会处理这个本地路径
        cfg.dataset.repo_id = str(local_dataset_unpacked_path)
    
    # 手动触发 lerobot 的核心配置后处理逻辑
    
    cfg.validate()

    logging.info("Successfully created final training configuration.")
    logging.info(pformat(cfg.to_dict()))
    return cfg

# TODO resume the previous training state
def initialize_training_objects(
    cfg: TrainPipelineConfig,
    device: torch.device,
    start_step: int,
) -> Tuple:
    """
    第二阶段：根据配置初始化所有训练所需的对象。
    """
    logging.info("Creating dataset...")
    dataset = make_dataset(cfg)

    logging.info("Creating policy...")
    policy = make_policy(cfg=cfg.policy, ds_meta=dataset.meta)
    policy.to(device)

    logging.info("Creating optimizer and scheduler...")
    optimizer, lr_scheduler = make_optimizer_and_scheduler(cfg, policy)
    grad_scaler = GradScaler(device.type, enabled=cfg.policy.use_amp)

    # 加载 Checkpoint (如果断点续练)
    if start_step > 0:
        checkpoint_path = Path(cfg.output_dir) / "checkpoints" / "last"
        if checkpoint_path.is_symlink() or checkpoint_path.exists():
            logging.info(f"Resuming training from checkpoint: {checkpoint_path.resolve()}")
            loaded_step, optimizer, lr_scheduler = load_training_state(
                checkpoint_path, optimizer, lr_scheduler, policy=policy, device=device
            )
            logging.info(f"Checkpoint loaded, was at step {loaded_step}. Starting from {start_step}.")
        else:
            logging.warning(f"Expected a checkpoint at {checkpoint_path} for resuming, but not found.")

    return dataset, policy, optimizer, lr_scheduler, grad_scaler


def execute_training_loop(
    cfg: TrainPipelineConfig,
    device: torch.device,
    start_step: int,
    end_step: int,
    training_objects: Tuple,
    log_callback: Callable,
    save_callback: Callable,
):
    """
    第三阶段：执行核心的训练循环。
    """
    dataset, policy, optimizer, lr_scheduler, grad_scaler = training_objects
    
    # Dataloader 和训练准备
    if hasattr(cfg.policy, "drop_n_last_frames"):
        sampler = EpisodeAwareSampler(
            dataset.episode_data_index, drop_n_last_frames=cfg.policy.drop_n_last_frames, shuffle=True
        )
        shuffle = False
    else:
        sampler = None
        shuffle = True
        
    dataloader = torch.utils.data.DataLoader(
        dataset, 
        num_workers=cfg.num_workers,
        batch_size=cfg.batch_size, 
        shuffle=shuffle, 
        sampler=sampler, 
        pin_memory=device.type != "cpu", 
        drop_last=False
    )
    dl_iter = cycle(dataloader)
    
    if start_step > 0:
        logging.info(f"Fast-forwarding dataloader by {start_step} steps...")
        for _ in range(start_step):
            next(dl_iter)

    policy.train()

    train_metrics = {
        "loss": AverageMeter("loss", ":.3f"), "grad_norm": AverageMeter("grdn", ":.3f"), "lr": AverageMeter("lr", ":0.1e"),
        "update_s": AverageMeter("updt_s", ":.3f"), "dataloading_s": AverageMeter("data_s", ":.3f"),
    }
    train_tracker = MetricsTracker(
        cfg.batch_size, dataset.num_frames, dataset.num_episodes, train_metrics, initial_step=start_step
    )

    logging.info(f"Entering training loop from step {start_step} to {end_step}...")
    for step in range(start_step, end_step):
        batch = next(dl_iter)

        for key in batch:
            if isinstance(batch[key], torch.Tensor):
                batch[key] = batch[key].to(device, non_blocking=True)

        train_tracker, output_dict = update_policy(
            train_tracker,
            policy,
            batch,
            optimizer,
            cfg.optimizer.grad_clip_norm,
            grad_scaler=grad_scaler,
            lr_scheduler=lr_scheduler,
            use_amp=cfg.policy.use_amp,
        )
        current_step = step + 1

        is_log_step = cfg.log_freq > 0 and current_step % cfg.log_freq == 0
        is_saving_step = current_step % cfg.save_freq == 0 or current_step == cfg.steps

        if is_log_step:
            log_callback(current_step, train_tracker.to_dict())
            train_tracker.reset_averages() 

        if cfg.save_checkpoint and is_saving_step:
            logging.info(f"Saving checkpoint at step {current_step}")
            checkpoint_dir = get_step_checkpoint_dir(cfg.output_dir, cfg.steps, current_step)
            logging.info(f"Saving checkpoint to: {checkpoint_dir}")
            save_checkpoint(checkpoint_dir, current_step, cfg, policy, optimizer, lr_scheduler)
            update_last_checkpoint(checkpoint_dir)
            
            save_callback(current_step, str(checkpoint_dir))
    
    logging.info(f"Finished training slice. Final step for this slice: {end_step}")
    return end_step


def run_lerobot_training(
    base_config_path: str,
    user_override_config: Dict[str, Any],
    run_dir: str,
    start_step: int,
    end_step: int,
    log_callback: Callable,
    save_callback: Callable,
):
    """
    主入口函数，编排整个训练流程。
    """
    # 阶段一：准备配置
    cfg = prepare_config(base_config_path, user_override_config, run_dir, start_step, end_step)

    # 设置设备
    device = get_safe_torch_device(cfg.policy.device, log=True)
    torch.backends.cudnn.benchmark = True
    torch.backends.cuda.matmul.allow_tf32 = True

    # 阶段二：初始化所有对象
    training_objects = initialize_training_objects(cfg, device, start_step)
    
    # 阶段三：执行训练循环
    final_step = execute_training_loop(
        cfg, device, start_step, end_step,
        training_objects, log_callback, save_callback
    )

    return final_step           
