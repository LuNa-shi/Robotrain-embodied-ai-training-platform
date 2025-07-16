# training_platform/trainer/lerobot_trainer_logic.py (模块化版本)

import logging
from pathlib import Path
from pprint import pformat
from typing import Callable, Dict, Any, Tuple

import torch
from torch.amp.grad_scaler import GradScaler
import draccus
import os
from training_platform.configs.settings import settings

# 配置日志
# 创建日志目录
import os
log_dir = os.path.join(os.getcwd(), 'logs')
os.makedirs(log_dir, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(os.path.join(log_dir, 'training.log'))
    ]
)

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
    async_save_checkpoint,
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
    task_id: int, 
    start_step: int,
    end_step: int,
) -> TrainPipelineConfig:
    """
    第一阶段：加载、合并并准备最终的训练配置对象。
    """
    logging.info(f"Loading base config from: {base_config_path}")
    logging.info(f"Applying user override config: {user_override_config}")
    
    # 构建命令行参数列表
    overrides = []
    
    # 添加resume参数（如果从checkpoint恢复）
    if start_step > 0:
        overrides.append("--resume=true")
    
    # 添加config_path参数，直接指向真实存在的配置文件
    overrides.append(f"--config_path={base_config_path}")
    
    # 添加其他用户覆盖的配置
    for key, value in user_override_config.items():
        if key == "resume":  # 跳过resume，因为我们已经处理了
            continue
        if isinstance(value, dict):
            # 对于嵌套字典，我们需要将其展平为点分隔的格式
            for nested_key, nested_value in value.items():
                if isinstance(nested_value, dict):
                    # 处理更深层的嵌套
                    for deep_key, deep_value in nested_value.items():
                        overrides.append(f"--{key}.{nested_key}.{deep_key}={deep_value}")
                else:
                    overrides.append(f"--{key}.{nested_key}={nested_value}")
        else:
            overrides.append(f"--{key}={value}")
    
    # 如果数据集已经下载到本地，则覆盖 repo_id
    local_dataset_unpacked_path = Path(run_dir) / "dataset"
    local_dataset_repo_id = os.path.join(str(task_id), "dataset")
    print(f"Local dataset path: {local_dataset_unpacked_path}")
    if local_dataset_unpacked_path.exists():
        print(f"Local dataset found at: {local_dataset_unpacked_path}")
        overrides.append(f"--dataset.root={local_dataset_unpacked_path}")
        overrides.append(f"--dataset.repo_id={local_dataset_repo_id}")
    
    logging.info(f"Command line overrides: {overrides}")
    
    # 使用draccus解析配置，直接传入命令行参数
    cfg: TrainPipelineConfig = draccus.parse(
        config_class=TrainPipelineConfig,
        args=overrides,
    )
    
    # 手动设置config_path属性，确保validate()方法能正确访问
    if start_step > 0:
        # 当resume=True时，手动设置config_path
        # 我们需要修改validate()方法的逻辑，让它能正确获取config_path
        import sys
        # 临时修改sys.argv，让parser.parse_arg能正确工作
        original_argv = sys.argv.copy()
        sys.argv = [sys.argv[0]] + overrides
        
        try:
            # 现在validate()应该能正确获取config_path
            cfg.validate()
        finally:
            # 恢复原始的sys.argv
            sys.argv = original_argv
    else:
        # 非恢复训练，直接调用validate
        cfg.validate()

    logging.info("Successfully created final training configuration.")
    logging.info(pformat(cfg.to_dict()))
    return cfg

# TODO resume the previous training state, reserve and restore the training state --resume
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
            # 修复：移除不存在的参数
            loaded_step, optimizer, lr_scheduler = load_training_state(
                checkpoint_path, optimizer, lr_scheduler
            )
            logging.info(f"Checkpoint loaded, was at step {loaded_step}. Starting from {start_step}.")
        else:
            logging.warning(f"Expected a checkpoint at {checkpoint_path} for resuming, but not found.")

    return dataset, policy, optimizer, lr_scheduler, grad_scaler


async def execute_training_loop(
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
        is_periodic_saving_step = current_step % cfg.save_freq == 0

        if is_log_step:
            log_callback(current_step, train_tracker.to_dict())
            train_tracker.reset_averages() 

        try:
            if cfg.save_checkpoint and is_periodic_saving_step:
                logging.info(f"Saving checkpoint at step {current_step}")
                checkpoint_dir = get_step_checkpoint_dir(cfg.output_dir, cfg.steps, current_step)
                logging.info(f"Saving checkpoint to: {checkpoint_dir}")
                await async_save_checkpoint(checkpoint_dir, current_step, cfg, policy, optimizer, lr_scheduler)
                update_last_checkpoint(checkpoint_dir)
                
                save_callback(current_step, str(checkpoint_dir))
        except Exception as e:
            logging.error(f"CRITICAL: `save_checkpoint` failed at step {current_step} with error: {e}", exc_info=True)
            raise e
    
    # ----- 循环结束后，强制保存当前分片的最终状态 -----
    logging.info(f"Finished training slice loop at step {end_step}. Performing final save for this slice.")
    
    # 检查这一步是否已经在循环的最后一次迭代中保存过了
    last_step_already_saved = (end_step % cfg.save_freq == 0)

    try:
        if cfg.save_checkpoint and not last_step_already_saved:
            logging.info(f"Saving final state of the slice at step {end_step}")
            checkpoint_dir = get_step_checkpoint_dir(cfg.output_dir, cfg.steps, end_step)
            logging.info(f"Saving final checkpoint to: {checkpoint_dir}")
            await save_checkpoint(checkpoint_dir, end_step, cfg, policy, optimizer, lr_scheduler)
            update_last_checkpoint(checkpoint_dir)
            save_callback(end_step, str(checkpoint_dir))
        elif last_step_already_saved:
            logging.info(f"Step {end_step} was already saved as a periodic checkpoint. Skipping duplicate save.")
    except Exception as e:
        logging.error(f"CRITICAL: `save_checkpoint` failed at step {end_step} with error: {e}", exc_info=True)
        raise e

    logging.info(f"Finished training slice. Final step for this slice: {end_step}")
    return end_step


async def run_lerobot_training(
    base_config_path: str,
    user_override_config: Dict[str, Any],
    run_dir: str,
    task_id: int,
    start_step: int,
    end_step: int,
    log_callback: Callable,
    save_callback: Callable,
):
    """
    主入口函数，编排整个训练流程。
    """
    # 阶段一：准备配置
    
    cfg = prepare_config(base_config_path, user_override_config, run_dir, task_id, start_step, end_step)

    print(f"base_config_path: {base_config_path}")
    print(f"user_override_config: {user_override_config}")
    # print(f"cfg: {cfg}")
    print(f"run_dir: {run_dir}")
    # 设置设备
    device = get_safe_torch_device(cfg.policy.device, log=True)
    torch.backends.cudnn.benchmark = True
    torch.backends.cuda.matmul.allow_tf32 = True

        # 添加GPU监控代码
    print(f"🔍 GPU监控信息:")
    print(f"   - 实际使用的设备: {device}")
    print(f"   - CUDA可用: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"   - GPU数量: {torch.cuda.device_count()}")
        print(f"   - 当前GPU: {torch.cuda.current_device()}")
        print(f"   - GPU名称: {torch.cuda.get_device_name()}")
        print(f"   - GPU内存: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
    

    # 阶段二：初始化所有对象
    training_objects = initialize_training_objects(cfg, device, start_step)
    
    # 阶段三：执行训练循环
    final_step = await execute_training_loop(
        cfg, device, start_step, end_step,
        training_objects, log_callback, save_callback
    )

    return final_step           
