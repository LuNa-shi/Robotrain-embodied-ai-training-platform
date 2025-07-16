import logging
import os
from pathlib import Path
from pprint import pformat
import time
from typing import Dict, Any

import torch
from torch.amp.grad_scaler import GradScaler
import draccus

# RAY-INTEGRATION: Import Ray Train and related utilities.
# These are essential for distributed training, checkpointing, and reporting.
import ray
import ray.train
from ray.train import Checkpoint
from ray.train.torch import prepare_model, prepare_data_loader

# 导入所有 lerobot 的依赖 (保持不变)
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

# 在模块加载时，确保所有 lerobot 的插件都被注册 (保持不变)
import lerobot.common.envs.factory
import lerobot.common.policies.factory

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('training_dist.log')
    ]
)
# RAY-INTEGRATION: Get a logger specific to the current worker to avoid log spam.
# This ensures that log messages can be easily identified by their worker rank.
logger = logging.getLogger(
    f"worker_{ray.train.get_context().get_world_rank()}" if ray.is_initialized() and ray.train.get_context() else "main"
)


def flatten_dict_for_draccus(d, parent_key='', sep='.'):
    """
    辅助函数：将嵌套字典展平，以便为 draccus 生成命令行参数。
    例如: {"policy": {"lr": 0.001}} -> {"policy.lr": 0.001}
    """
    items = []
    for k, v in d.items():
        new_key = parent_key + sep + k if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict_for_draccus(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)


def train_func(config: Dict[str, Any]):
    """
    此函数是 Ray Train 的核心，由每个分布式工作节点执行。
    它将原始代码的三个阶段（配置、初始化、训练）整合在一起，并适配了分布式环境。

    Args:
        config (Dict[str, Any]): 一个字典，包含了运行训练所需的所有配置，
                                 由 TorchTrainer 传递而来。
    """
    # RAY-INTEGRATION: 获取主工作节点（rank 0）的标志，用于控制日志和保存操作。
    is_master_worker = ray.train.get_context().get_world_rank() == 0

    # =================================================================================
    # 阶段一：加载、合并并准备最终的训练配置对象 (原 prepare_config 逻辑)
    # =================================================================================

    # RAY-INTEGRATION: 从统一的 config 字典中解包所有配置。
    base_config_path = config["base_config_path"]
    user_override_config = config["user_override_config"]
    run_dir = ray.train.get_context().get_trial_dir()
    task_id = config["task_id"]
    local_dataset_path = config.get("local_dataset_path")  # 从 MinIO 下载的数据集路径

    if is_master_worker:
        logger.info(f"[{task_id}] Preparing configuration...")
        logger.info(f"[{task_id}] Base config path: {base_config_path}")
        logger.info(f"[{task_id}] User override config: {pformat(user_override_config)}")

    # RAY-INTEGRATION: 构建 draccus 的命令行参数列表，这是与 lerobot 配置系统交互的稳健方式。
    overrides = []
    overrides.append(f"--config_path={base_config_path}")

    # 将用户覆盖配置转换为 draccus 能理解的 "--key=value" 格式。
    flat_user_config = flatten_dict_for_draccus(user_override_config)
    for key, value in flat_user_config.items():
        # Draccus 对于布尔值需要小写 'true'/'false'
        if isinstance(value, bool):
            overrides.append(f"--{key}={str(value).lower()}")
        else:
            overrides.append(f"--{key}={value}")

    # 将 `output_dir` 指向我们的主运行目录。
    if is_master_worker:
        overrides.append(f"--output_dir={run_dir}")

    is_resuming_from_checkpoint = ray.train.get_checkpoint() is not None
    if is_resuming_from_checkpoint:
        overrides.append("--resume=true") 


    # 如果数据集已在本地准备好，则覆盖配置中的数据集路径。
    if local_dataset_path and Path(local_dataset_path).exists():
        if is_master_worker:
            logger.info(f"[{task_id}] Local dataset found, overriding dataset.root to {local_dataset_path}")
        overrides.append(f"--dataset.root={local_dataset_path}")
        # repo_id 仍然需要，但 root 会优先
        overrides.append(f"--dataset.repo_id={os.path.join(str(task_id), 'dataset')}")

    if is_master_worker:
        logger.info(f"[{task_id}] Final draccus args: {overrides}")

    # 使用 draccus 解析所有配置，生成最终的 TrainPipelineConfig 对象。
    cfg: TrainPipelineConfig = draccus.parse(config_class=TrainPipelineConfig, args=overrides)
    
    cfg.policy.device = "cpu"
    if not cfg.job_name:
        if cfg.env is None:
            cfg.job_name = f"{cfg.policy.type}"
        else:
            cfg.job_name = f"{cfg.env.type}_{cfg.policy.type}"

    # Replicate the optimizer/scheduler preset logic.
    if cfg.use_policy_training_preset and (cfg.optimizer is None or cfg.scheduler is None):
        if is_master_worker:
            logger.info("Using policy training presets for optimizer and scheduler.")
        cfg.optimizer = cfg.policy.get_optimizer_preset()
        cfg.scheduler = cfg.policy.get_scheduler_preset()
    elif not cfg.use_policy_training_preset and (cfg.optimizer is None or cfg.scheduler is None):
        # This check is still valid and important.
        raise ValueError("Optimizer and Scheduler must be set when the policy presets are not used.")

    
    cfg.output_dir = Path(run_dir)  # 确保是 Path 对象
    

    if is_master_worker:
        
        logger.info(f"[{task_id}] Successfully created final training configuration.")
        logger.info(pformat(cfg.to_dict()))

    # =================================================================================
    # 阶段二：初始化所有训练所需的对象 (原 initialize_training_objects 逻辑)
    # =================================================================================
    if is_master_worker:
        logger.info(f"[{task_id}] Initializing training objects...")

    # 设置设备
    device = torch.device("cpu")
    torch.backends.cudnn.benchmark = True
    torch.backends.cuda.matmul.allow_tf32 = True
    
    # 启用torch.compile相关的优化
    if hasattr(cfg.policy, 'use_compile') and cfg.policy.use_compile:
        # 设置torch.compile相关的环境变量和优化
        torch.backends.cuda.enable_flash_sdp(True)
        torch.backends.cuda.enable_mem_efficient_sdp(True)
        torch.backends.cuda.enable_math_sdp(True)
        # 启用标量输出捕获，避免.item()导致的图断点
        torch._dynamo.config.capture_scalar_outputs = True
        if is_master_worker:
            logger.info("已启用torch.compile相关的CUDA优化和标量输出捕获")

    from copy import deepcopy
    init_cfg = deepcopy(cfg)
    
    # 2. Force the device to CPU in this temporary config.
    if is_master_worker:
        logger.info(f"Forcing device to 'cpu' in temporary config for initialization.")
    init_cfg.policy.device = "cpu"

    # 3. Use this temporary, CPU-only config to create the objects.
    # `make_policy` will now read "cpu" from `init_cfg.policy.device` and
    # the final `.to(cfg.device)` call inside it will move the model to the CPU.
    dataset = make_dataset(init_cfg)
    policy = make_policy(cfg=init_cfg.policy, ds_meta=dataset.meta)
    
    # 初始化 lerobot 对象
    dataset = make_dataset(cfg)
    policy = make_policy(cfg=cfg.policy, ds_meta=dataset.meta)
    optimizer, lr_scheduler = make_optimizer_and_scheduler(cfg, policy)
    grad_scaler = GradScaler(device.type, enabled=cfg.policy.use_amp)
    
    start_step = 0

    # RAY-INTEGRATION: 使用 `ray.train.get_checkpoint()` 来处理断点续练。
    # 这是 Ray Train 推荐的、统一的恢复方式。
    checkpoint = ray.train.get_checkpoint()
    if checkpoint:
        if is_master_worker:
            logger.info(f"[{task_id}] Resuming training from a Ray Train Checkpoint...")
        with checkpoint.as_directory() as checkpoint_dir:
            # lerobot 使用 `last` 符号链接指向最新的检查点。
            last_checkpoint_path = Path(checkpoint_dir) / "last"
            if last_checkpoint_path.is_symlink():
                if is_master_worker:
                    logger.info(f"[{task_id}] Found 'last' symlink, loading state from: {last_checkpoint_path.resolve()}")

                # 使用 lerobot 的工具函数加载模型、优化器和调度器状态。
                # 它会就地修改对象，并返回起始步数。
                loaded_step, _, _ = load_training_state(
                    last_checkpoint_path, policy, optimizer, lr_scheduler, device=device
                )
                start_step = loaded_step
                if is_master_worker:
                    logger.info(f"[{task_id}] Successfully resumed. Starting training from step {start_step}.")
            else:
                if is_master_worker:
                    logger.warning(f"[{task_id}] Ray Checkpoint loaded, but 'last' symlink not found in {checkpoint_dir}. Starting from step 0.")

    # RAY-INTEGRATION: 使用 `prepare_model` 包装模型以进行分布式数据并行（DDP）。
    # 重要提示：此操作必须在从检查点加载状态之后进行。
    policy = prepare_model(policy)
    device = next(policy.parameters()).device

    if is_master_worker:
        logger.info(f"Model prepared and moved to correct device: {device}")
    # Dataloader 和分布式准备
    # RAY-INTEGRATION: DDP 推荐使用 `shuffle=True`，而 `prepare_data_loader` 会自动添加 `DistributedSampler`。
    # 这取代了之前对 `EpisodeAwareSampler` 的需求。
    dataloader = torch.utils.data.DataLoader(
        dataset,
        num_workers=cfg.num_workers,
        batch_size=cfg.batch_size,
        shuffle=True,  # DDP 推荐
        pin_memory=device.type != "cpu",
        drop_last=True,  # 在分布式训练中通常建议使用
    )
    # RAY-INTEGRATION: 使用 `prepare_data_loader` 为数据加载器添加分布式采样器。
    dataloader = prepare_data_loader(dataloader)
    dl_iter = cycle(dataloader)

    # 注意：我们不再需要手动快进 dataloader。`start_step` 变量会确保训练循环从正确的迭代开始。

    # =================================================================================
    # 阶段三：执行核心的训练循环 (原 execute_training_loop 逻辑)
    # =================================================================================
    policy.train()

    train_metrics = {
        "loss": AverageMeter("loss", ":.3f"), "grad_norm": AverageMeter("grdn", ":.3f"), "lr": AverageMeter("lr", ":0.1e"),
        "update_s": AverageMeter("updt_s", ":.3f"), "dataloading_s": AverageMeter("data_s", ":.3f"),
    }
    
    # RAY-INTEGRATION: 有效的批次大小是单个工作节点的批次大小乘以工作节点的数量。
    effective_batch_size = cfg.batch_size * ray.train.get_context().get_world_size()
    
    train_tracker = MetricsTracker(
        effective_batch_size, dataset.num_frames, dataset.num_episodes, train_metrics, initial_step=start_step
    )

    if is_master_worker:
        logger.info(f"[{task_id}] Entering training loop from step {start_step} to {cfg.steps}...")
        logger.info(f"[{task_id}] Per-worker batch size: {cfg.batch_size}, Num workers: {ray.train.get_context().get_world_size()}, Effective batch size: {effective_batch_size}")


    for step in range(start_step, cfg.steps):
        batch = next(dl_iter)

        for key in batch:
            if isinstance(batch[key], torch.Tensor):
                batch[key] = batch[key].to(device, non_blocking=True)

        # RAY-INTEGRATION: 当模型被 DDP 包装后，需要通过 `.module` 访问原始模型。
        actual_policy = policy.module if hasattr(policy, "module") else policy

        train_tracker, _ = update_policy(
            train_tracker,
            actual_policy,
            batch,
            optimizer,
            cfg.optimizer.grad_clip_norm,
            grad_scaler=grad_scaler,
            lr_scheduler=lr_scheduler,
            use_amp=cfg.policy.use_amp,
        )
        current_step = step + 1

        is_log_step = cfg.log_freq > 0 and current_step % cfg.log_freq == 0
        is_save_step = cfg.save_checkpoint and current_step % cfg.save_freq == 0

        # RAY-INTEGRATION: 使用 `ray.train.report` 进行统一的指标汇报和检查点保存。
        # 这种方式取代了旧的回调函数，并且是分布式安全的。
        if is_log_step or is_save_step:
            metrics_to_report = {}
            ray_checkpoint = None

            # 1. 如果是日志记录步骤，准备要汇报的指标。
            if is_log_step:
                metrics_to_report = train_tracker.to_dict()
                metrics_to_report['step'] = current_step  # 添加步数以便调试
                if is_master_worker:
                    logger.info(f"Step {current_step}/{cfg.steps} -> Metrics: {pformat(metrics_to_report)}")
                train_tracker.reset_averages()

            # 2. 如果是保存步骤，保存检查点。
            if is_save_step:
                # 检查点目录对所有工作节点都可见，但只有主节点写入。
                checkpoint_dir = get_step_checkpoint_dir(cfg.output_dir, cfg.steps, current_step)

                # 只有主工作节点（rank 0）执行实际的保存操作，以避免文件写入冲突。
                if is_master_worker:
                    logger.info(f"[{task_id}] Saving checkpoint at step {current_step} to {checkpoint_dir}")
                    save_checkpoint(checkpoint_dir, current_step, cfg, actual_policy, optimizer, lr_scheduler)
                    update_last_checkpoint(checkpoint_dir)
                
                # 所有工作节点都必须调用 `Checkpoint.from_directory`。
                # Ray Train 会确保此调用起到同步屏障的作用，等待 rank 0 完成写入。
                ray_checkpoint = Checkpoint.from_directory(checkpoint_dir)
                metrics_to_report["checkpoint_step"] = current_step

            # 3. 使用一个统一的 `report` 调用来发送指标和/或检查点。
            # 这种方式稳健地处理了三种情况：仅日志、仅保存、日志和保存。
            ray.train.report(metrics_to_report, checkpoint=ray_checkpoint)

    if is_master_worker:
        logger.info(f"[{task_id}] Training finished at step {cfg.steps}.")