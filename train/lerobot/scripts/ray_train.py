#!/usr/bin/env python
# -*- coding: utf-8 -*-

# Copyright 2024 The HuggingFace Inc. team. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
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
import tempfile
from contextlib import nullcontext
from itertools import cycle
from pprint import pformat
from typing import Any, Dict

import ray
import torch
from ray import train
from ray.train import Checkpoint, ScalingConfig
from ray.train.torch import TorchTrainer
import ray.data
from termcolor import colored
from torch.amp import GradScaler

from lerobot.common.datasets.factory import make_dataset
from lerobot.common.envs.factory import make_env
from lerobot.common.optim.factory import make_optimizer_and_scheduler
from lerobot.common.policies.factory import make_policy
from lerobot.common.utils.random_utils import set_seed
from lerobot.common.utils.utils import (
    format_big_number,
    get_safe_torch_device,
    has_method,
    init_logging,
)
from lerobot.configs import parser
from lerobot.configs.train import TrainPipelineConfig
from lerobot.scripts.eval import eval_policy
from torch.utils.data.dataloader import default_collate

def train_step(policy, batch, optimizer, grad_scaler, cfg):
    """
    Executes the logic for a single training step.
    """
    policy.train()
    device = next(policy.parameters()).device

    with torch.autocast(device_type=device.type, enabled=cfg.policy.use_amp):
        loss, output_dict = policy.forward(batch)

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
    Executes the policy evaluation logic.
    """
    if not cfg.env:
        return {}

    logging.info(f"Evaluating policy at step {step}...")
    eval_env = make_env(cfg.env, n_envs=cfg.eval.batch_size)

    with torch.no_grad(), torch.autocast(
        device_type=device.type, enabled=cfg.policy.use_amp
    ):
        eval_info = eval_policy(
            eval_env,
            policy,
            cfg.eval.n_episodes,
            videos_dir=None,
            max_episodes_rendered=0,
            start_seed=cfg.seed,
        )
    eval_env.close()

    return {
        "avg_sum_reward": eval_info["aggregated"]["avg_sum_reward"],
        "pc_success": eval_info["aggregated"]["pc_success"],
    }

def collate_fn(batch):
    # Handle the case where batch is already a dictionary (from Ray dataset)
    if isinstance(batch, dict):
        return batch
    
    # Handle the case where batch is a list of dictionaries
    if isinstance(batch, list) and len(batch) > 0:
        # Use default collate for list of dictionaries
        return default_collate(batch)
    
    # Fallback to default collate
    return default_collate(batch)
        

def train_loop_per_worker(config: Dict[str, Any]):
    """
    This function is executed by Ray on each worker.
    It defines the logic for a single training step.
    """
    # 1. Get config and metadata from the driver
    cfg = config["cfg"]
    ds_meta = config["ds_meta"]

    # 2. Distributed setup
    world_rank = train.get_context().get_world_rank()
    world_size = train.get_context().get_world_size()
    device = get_safe_torch_device("cuda")
    if cfg.seed is not None:
        set_seed(cfg.seed + world_rank)

    # 3. Create model and optimizer
    policy = make_policy(cfg=cfg.policy, ds_meta=ds_meta)
    optimizer, lr_scheduler = make_optimizer_and_scheduler(cfg, policy)

    # 4. Prepare for distributed training
    policy = train.torch.prepare_model(policy)
    optimizer = train.torch.prepare_optimizer(optimizer)

    train_dataset_shard = train.get_dataset_shard("train")
    
    

    # 6. Other training components
    grad_scaler = GradScaler("cuda", enabled=cfg.policy.use_amp)
    start_step = 0

    # 7. Resume from checkpoint if available
    checkpoint = train.get_checkpoint()
    if checkpoint:
        with checkpoint.as_directory() as checkpoint_dir:
            checkpoint_dict = torch.load(os.path.join(checkpoint_dir, "model.pt"))
            # Ray automatically loads the model and optimizer state.
            # We only need to load extra state we saved.
            if lr_scheduler and "lr_scheduler" in checkpoint_dict:
                lr_scheduler.load_state_dict(checkpoint_dict["lr_scheduler"])
            start_step = checkpoint_dict.get("step", 0) + 1


    # 8. Manual Training Loop
    step = start_step
    per_worker_batch_size = cfg.batch_size // world_size
    while step < cfg.steps:

        for batch in train_dataset_shard.iter_torch_batches(batch_size=per_worker_batch_size, collate_fn=collate_fn):
            if step >= cfg.steps:
                break


             # Manually move the collated batch to the correct device.
            for key, value in batch.items():
                if isinstance(value, torch.Tensor):
                    batch[key] = value.to(device, non_blocking=True)


            # Perform one training step
            train_metrics = train_step(policy, batch, optimizer, grad_scaler, cfg)


            if lr_scheduler is not None:
                lr_scheduler.step()

            # Check if it's time to evaluate and/or save a checkpoint
            is_eval_step = cfg.eval_freq > 0 and (step + 1) % cfg.eval_freq == 0
            is_save_step = cfg.save_freq > 0 and (step + 1) % cfg.save_freq == 0
            is_last_step = (step + 1) == cfg.steps

            results_to_report = train_metrics
            if is_eval_step or is_last_step:
                if world_rank == 0:
                    eval_metrics = evaluate_policy_on_env(policy.module, cfg, step + 1, device)
                    results_to_report.update(eval_metrics)

            if is_save_step or is_last_step:
                # Manually save checkpoint in a temporary directory
                with tempfile.TemporaryDirectory() as temp_checkpoint_dir:
                    if world_rank == 0:
                        torch.save(
                            {
                                "step": step,
                                "lr_scheduler": lr_scheduler.state_dict() if lr_scheduler else None,
                            },
                            os.path.join(temp_checkpoint_dir, "model.pt"),
                        )
                    # Report metrics and the checkpoint
                    train.report(
                        results_to_report,
                        checkpoint=Checkpoint.from_directory(temp_checkpoint_dir),
                    )
            else:
                # Report only training metrics if not an eval/checkpoint step
                train.report(results_to_report)
            
            step += 1


@parser.wrap()
def main(cfg: TrainPipelineConfig):
    """
    Main function to setup and run the distributed training job.
    """
    cfg.validate()
    init_logging()
    logging.info(pformat(cfg.to_dict()))

    # 1. Setup Ray runtime environment
    runtime_env = {
        "pip": "requirements.txt",
        "working_dir": "."
    }
    if not ray.is_initialized():
        ray.init(logging_level=logging.ERROR, runtime_env=runtime_env)

    # 2. Create the dataset and get its metadata on the driver
    lerobot_dataset = make_dataset(cfg)
    ds_meta = lerobot_dataset.meta

    debug_dataloader = torch.utils.data.DataLoader(lerobot_dataset, batch_size=1)
    for batch in debug_dataloader:
        for key, value in batch.items():
            print(key, value)
        breakpoint()


    # 3. Convert to a Ray Dataset
    ray_dataset = ray.data.from_torch(lerobot_dataset)

    # 4. Log key training parameters
    policy = make_policy(cfg=cfg.policy, ds_meta=ds_meta)
    num_learnable_params = sum(
        p.numel() for p in policy.parameters() if p.requires_grad
    )
    logging.info(colored("Output dir:", "yellow", attrs=["bold"]) + f" {cfg.output_dir}")
    logging.info(f"Steps: {format_big_number(cfg.steps)}")
    logging.info(f"Learnable parameters: {format_big_number(num_learnable_params)}")
    logging.info(f"Dataset frames: {format_big_number(lerobot_dataset.num_frames)}")

    # 5. Define distributed training configuration
    scaling_config = ScalingConfig(num_workers=cfg.num_gpus, use_gpu=True)

    # 6. Create the TorchTrainer (without RunConfig)
    trainer = TorchTrainer(
        train_loop_per_worker=train_loop_per_worker,
        train_loop_config={"cfg": cfg, "ds_meta": ds_meta},
        scaling_config=scaling_config,
        datasets={"train": ray_dataset},
    )

    # 7. Run the training job
    results = trainer.fit()

    # 8. Print the best result
    best_result = results.get_best_result(metric="avg_sum_reward", mode="max")
    if best_result:
        print("=" * 40)
        print("Best trial completed.")
        print(f"Best trial config: {best_result.config}")
        print(
            f"Best trial final evaluation reward: {best_result.metrics.get('avg_sum_reward', 'N/A')}"
        )
        print(f"Best trial checkpoint path: {best_result.checkpoint.path}")
        print("=" * 40)


if __name__ == "__main__":
    main()
