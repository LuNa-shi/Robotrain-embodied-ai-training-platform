#!/usr/bin/env python
# -*- coding: utf-8 -*-

# Copyright 2024 The HuggingFace Inc. team. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may
# obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import logging
import os
import time
from contextlib import nullcontext
from typing import Any, Dict

import torch
from torch.amp import GradScaler

# Ray and Ray Train/Tune imports
import ray
from ray import train, tune
from ray.train import Checkpoint, ScalingConfig
from ray.train.torch import TorchTrainer
from ray.tune.schedulers import ASHAScheduler

# LeRobot imports (assuming they are in the python path)
from lerobot.common.datasets.factory import make_dataset
from lerobot.common.datasets.utils import cycle
from lerobot.common.envs.factory import make_env
from lerobot.common.optim.factory import make_optimizer_and_scheduler
from lerobot.common.policies.factory import make_policy
from lerobot.common.utils.logging_utils import AverageMeter, MetricsTracker
from lerobot.common.utils.random_utils import set_seed
from lerobot.common.utils.utils import (
    get_safe_torch_device,
    has_method,
    init_logging,
)
from lerobot.configs import get_config
from lerobot.configs.train import TrainPipelineConfig
from lerobot.scripts.eval import eval_policy


def train_step(policy, batch, optimizer, grad_scaler, cfg):
    """
    执行单个训练步骤的逻辑 (从之前的 Trainer 类中提取)。
    """
    policy.train()
    
    # 前向传播
    with torch.autocast(device_type="cuda" if torch.cuda.is_available() else "cpu", enabled=cfg.policy.use_amp):
        loss, output_dict = policy.forward(batch)

    # 反向传播和梯度更新
    grad_scaler.scale(loss).backward()
    grad_scaler.unscale_(optimizer)
    grad_norm = torch.nn.utils.clip_grad_norm_(
        policy.parameters(),
        cfg.optimizer.grad_clip_norm,
        error_if_nonfinite=False,
    )
    grad_scaler.step(optimizer)
    grad_scaler.update()
    optimizer.zero_grad()

    if has_method(policy, "update"):
        policy.update()

    # 返回需要报告的指标
    metrics = {
        "loss": loss.item(),
        "grad_norm": grad_norm.item(),
        "lr": optimizer.param_groups[0]["lr"],
    }
    if output_dict:
        metrics.update(output_dict)
        
    return metrics

def evaluate_policy_on_env(policy, cfg, step, device):
    """
    执行策略评估的逻辑 (从之前的 Trainer 类中提取)。
    """
    if not cfg.env:
        return {}
        
    logging.info(f"在第 {step} 步评估策略...")
    # 注意：评估通常在单个节点（例如rank 0）上完成以避免冗余
    eval_env = make_env(cfg.env, n_envs=cfg.eval.batch_size)

    with torch.no_grad(), torch.autocast(device_type=device.type, enabled=cfg.policy.use_amp):
        eval_info = eval_policy(
            eval_env,
            policy,
            cfg.eval.n_episodes,
            # 视频保存路径可以根据rank来决定是否保存
            videos_dir=None, # 通常只在rank 0保存视频
            max_episodes_rendered=0,
            start_seed=cfg.seed,
        )
    eval_env.close()
    
    # 返回评估结果
    return {
        "avg_sum_reward": eval_info["aggregated"]["avg_sum_reward"],
        "pc_success": eval_info["aggregated"]["pc_success"],
    }


def train_loop(config: Dict[str, Any]):
    """
    这个函数会被Ray在每个工作节点上执行。
    'config' 字典包含了来自Ray Tune的超参数。
    """
    # 1. 合并配置: 将Tune的超参数合并到基础配置中
    # `config` 字典包含了 'base_cfg_path' 和 Tune 提供的超参数
    base_cfg = get_config(config["base_cfg_path"])
    # 用Tune的参数覆盖基础配置
    base_cfg.optimizer.lr = config["lr"]
    base_cfg.batch_size = config["batch_size"]
    # 任何其他想调整的参数都可以用同样的方式覆盖
    cfg = base_cfg
    
    # 设置随机种子以保证可复现性
    if cfg.seed is not None:
        set_seed(cfg.seed)

    # 2. Ray Train 分布式设置
    # 获取工作节点的rank和world_size
    world_rank = train.get_context().get_world_rank()
    world_size = train.get_context().get_world_size()
    
    # 每个worker上的批大小
    per_worker_batch_size = cfg.batch_size // world_size
    
    # 3. 创建数据集和模型
    dataset = make_dataset(cfg)
    model = make_policy(cfg=cfg.policy, ds_meta=dataset.meta)
    optimizer, lr_scheduler = make_optimizer_and_scheduler(cfg, model)
    
    # 4. 使用Ray Train准备模型和优化器
    # 这是关键步骤，它会自动处理DDP的设置
    model = train.torch.prepare_model(model)
    optimizer = train.torch.prepare_optimizer(optimizer)
    
    # 5. 数据加载
    # Ray Train 会自动为每个worker分配数据分片
    train_dataset_shard = train.get_dataset_shard("train")
    
    # 在每个worker上创建Dataloader
    dataloader = torch.utils.data.DataLoader(
        train_dataset_shard,
        batch_size=per_worker_batch_size,
        num_workers=cfg.num_workers,
    )
    dl_iter = cycle(dataloader)
    
    # 其他训练组件
    grad_scaler = GradScaler("cuda", enabled=cfg.policy.use_amp)
    device = get_safe_torch_device("cuda") # Ray Train worker默认使用GPU

    # 6. 从检查点恢复（如果可用）
    start_step = 0
    checkpoint = train.get_checkpoint()
    if checkpoint:
        with checkpoint.as_directory() as checkpoint_dir:
            checkpoint_dict = torch.load(os.path.join(checkpoint_dir, "model.pt"))
            model.load_state_dict(checkpoint_dict["policy"])
            optimizer.load_state_dict(checkpoint_dict["optimizer"])
            start_step = checkpoint_dict["step"] + 1

    # 7. 训练循环
    for step in range(start_step, cfg.steps):
        batch = next(dl_iter)
        # 将数据移动到设备
        for key in batch:
            if isinstance(batch[key], torch.Tensor):
                batch[key] = batch[key].to(device, non_blocking=True)
                
        # 执行训练步骤
        train_metrics = train_step(model, batch, optimizer, grad_scaler, cfg)
        
        # 调整学习率
        if lr_scheduler is not None:
            lr_scheduler.step()
        
        # 定期评估和报告
        results_to_report = train_metrics
        if cfg.eval_freq > 0 and step % cfg.eval_freq == 0:
            # 只在rank 0节点上执行评估，避免冗余
            if world_rank == 0:
                # 注意：评估时需要传递未被DDP包装的模型
                eval_metrics = evaluate_policy_on_env(model.module, cfg, step, device)
                results_to_report.update(eval_metrics)

            # 8. 向Ray Train/Tune报告指标和检查点
            # Ray会自动处理检查点的保存
            with tempfile.TemporaryDirectory() as temp_checkpoint_dir:
                # 保存一个更完整的状态字典
                torch.save(
                    {
                        "step": step,
                        "policy": model.module.state_dict(),
                        "optimizer": optimizer.state_dict(),
                        "lr_scheduler": lr_scheduler.state_dict() if lr_scheduler else None,
                        "grad_scaler": grad_scaler.state_dict(),
                        "torch_rng_state": torch.get_rng_state(),
                        "cuda_rng_state": torch.cuda.get_rng_state(),
                    },
                    os.path.join(temp_checkpoint_dir, "model.pt"),
                )
                train.report(
                    results_to_report,
                    checkpoint=Checkpoint.from_directory(temp_checkpoint_dir),
                )


if __name__ == "__main__":
    init_logging()
    
    # 初始化Ray
    if not ray.is_initialized():
        ray.init(logging_level=logging.INFO)

    # 假设您的基础配置文件路径
    #todo --CONFIG
    BASE_CONFIG_PATH = "lerobot/configs/train/diffusion.yaml" 

    # 1. 定义超参数搜索空间 (Ray Tune)
    param_space = {
        # 我们将基础配置文件路径也放进config，以便在train_loop中加载
        "base_cfg_path": BASE_CONFIG_PATH,
        # 定义要搜索的超参数
        "lr": tune.loguniform(1e-5, 1e-3),
        "batch_size": tune.choice([32, 64, 128]),
        # 还可以添加更多，例如:
        # "optimizer.weight_decay": tune.uniform(0.0, 0.1),
    }

    # 2. 定义分布式训练的规模
    # 例如，使用4个GPU进行训练
    scaling_config = ScalingConfig(num_workers=4, use_gpu=True)

    # # 3. 配置Ray Tune的调度器 (可选，但推荐)
    # # ASHAScheduler可以在早期停止效果不好的试验
    # scheduler = ASHAScheduler(
    #     metric="avg_sum_reward",  # 优化的目标指标
    #     mode="max",               # 我们希望最大化这个指标
    #     max_t=100000,             # 最大训练步数
    #     grace_period=10000,       # 至少训练这么多步再考虑停止
    #     reduction_factor=2,
    # )

    # 4. 创建 TorchTrainer
    # TorchTrainer是连接Ray Train和你的训练逻辑的桥梁
    trainer = TorchTrainer(
        train_loop_per_worker=train_loop,
        scaling_config=scaling_config,
        # 将数据集传递给Ray Train，它会进行分发
        datasets={"train": make_dataset(get_config(BASE_CONFIG_PATH))},
    )

    # # 5. 创建并运行 Tuner
    # tuner = tune.Tuner(
    #     trainer,
    #     param_space=param_space,
    #     tune_config=tune.TuneConfig(
    #         num_samples=10,  # 总共尝试10组不同的超参数组合
    #         scheduler=scheduler,
    #     ),
    #     run_config=train.RunConfig(
    #         name="lerobot_finetuning_experiment",
    #         storage_path="/tmp/ray_results", # 实验结果保存路径
    #     ),
    # )

    # 启动调优过程
    results = trainer.fit()

    # 6. 获取并打印最佳结果
    best_result = results.get_best_result(metric="avg_sum_reward", mode="max")
    print("="*40)
    print("最佳试验完成。")
    print(f"最佳试验的配置: {best_result.config}")
    print(f"最佳试验的最终评估奖励: {best_result.metrics.get('avg_sum_reward', 'N/A')}")
    print(f"最佳试验的检查点保存在: {best_result.checkpoint.path}")
    print("="*40)