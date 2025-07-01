# Core training loop extracted from original scripts 

# trainer/train_loop.py
import time
import torch
from torch.amp import GradScaler

# 导入原始脚本中的依赖
from lerobot.common.datasets.utils import cycle
from lerobot.common.utils.logging_utils import AverageMeter, MetricsTracker
# ... 其他 update_policy 所需的依赖

# update_policy 函数可以原样复制过来

def training_loop(cfg, device, policy, dataset, optimizer, lr_scheduler, start_step, end_step, log_callback, save_callback):
    # Dataloader & Sampler
    # ... (从原脚本复制 dataloader 创建逻辑)
    # 兼容性注意：如果 Ray Train 不适用，这种在 Actor 内部创建 DataLoader 的方式是可行的。
    # 如果要用 Ray Train，DataLoader 的创建需要放在 Ray Train 的训练函数内。
    dataloader = torch.utils.data.DataLoader(...)
    dl_iter = cycle(dataloader)
    
    # 恢复 dataloader 迭代器到正确位置 (如果需要精确恢复)
    # for _ in range(start_step):
    #     next(dl_iter)

    grad_scaler = GradScaler(device.type, enabled=cfg.policy.use_amp)
    
    train_metrics = { ... } # 从原脚本复制
    train_tracker = MetricsTracker(..., initial_step=start_step)
    
    policy.train()
    
    for step in range(start_step, end_step):
        # ... (原脚本的 for 循环内部逻辑)
        start_time = time.perf_counter()
        batch = next(dl_iter)
        train_tracker.dataloading_s = time.perf_counter() - start_time
        
        # ... batch to device ...
        
        train_tracker, output_dict = update_policy(...)

        # 注意：原脚本的 step 是从0开始然后+1，这里我们直接用循环变量 step
        current_step = step + 1
        train_tracker.step()
        
        is_log_step = cfg.log_freq > 0 and current_step % cfg.log_freq == 0
        is_saving_step = current_step % cfg.save_freq == 0 or current_step == cfg.steps

        if is_log_step:
            log_callback(current_step, train_tracker.to_dict())
            train_tracker.reset_averages()

        if cfg.save_checkpoint and is_saving_step:
            save_callback(current_step)
            
    return end_step