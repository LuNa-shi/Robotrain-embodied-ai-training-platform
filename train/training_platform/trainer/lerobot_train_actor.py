# training_platform/trainer/trainer_actor.py

import logging
import ray
import asyncio
import os
import shutil
import functools
from pathlib import Path
import subprocess
import json

from training_platform.configs.settings import settings
from training_platform.common.task_models import TrainingTask
from training_platform.common.rabbitmq_utils import init_rabbitmq, send_log_message
from training_platform.common.minio_utils import get_minio_client, upload_ckpt_to_minio, download_ckpt_from_minio, download_dataset_from_minio

# 导入我们的新训练逻辑
from training_platform.trainer.lerobot_trainer_logic import run_lerobot_training
from lerobot.common.utils.train_utils import TrainPipelineConfig

@ray.remote
class TrainerActor:
    def __init__(self, task: TrainingTask):
        self.task = task
        self.run_dir = os.path.join(settings.RUN_DIR_BASE, str(self.task.task_id))
        os.makedirs(self.run_dir, exist_ok=True)
        
        # 获取当前actor的事件循环，用于线程安全的回调
        self.loop = asyncio.get_running_loop()
        
        # 添加一个集合来跟踪正在进行的异步任务
        self.pending_uploads = set()

        # Manager 模式确保在 Actor 启动时，异步地准备好连接
        asyncio.create_task(init_rabbitmq())
        
        print(f"[{self.task.task_id}] Trainer Actor initialized for real training.")

    async def _log_callback(self, step: int, metrics: dict):
        """异步日志回调，发送消息到 RabbitMQ。"""
        # 从 metrics 字典中提取关键信息
        loss = metrics.get('loss', 0.0)
        # 你可以添加任何你想从 lerobot tracker 中记录的指标
        log_msg = f"Step {step}: loss={loss:.4f}, lr={metrics.get('lr', 0.0):.1e}"
        await send_log_message(
            task_id=self.task.task_id,
            epoch=step, # 在我们的平台中，step 等同于 epoch
            loss=loss,
            accuracy=-1.0, # lerobot 通常不直接报告 accuracy，设为-1
            log_message=log_msg
        )

    async def _save_checkpoint_callback(self, step: int, checkpoint_dir: str):
        """异步保存回调，将 checkpoint 目录压缩并上传到 MinIO。"""
        try:
            print(f"[{self.task.task_id}] Compressing checkpoint dir: {checkpoint_dir}")
            # 将 checkpoint 目录打包成 zip 文件
            zip_base_name = os.path.join(self.run_dir, f"checkpoint_step_{step}")
            zip_path = shutil.make_archive(zip_base_name, 'zip', checkpoint_dir)
            
            # 上传到 MinIO
            minio_client = await get_minio_client()
            object_name = f"{self.task.task_id}/checkpoint_step_{step}.zip"
            print(f"[{self.task.task_id}] upload checkpoint_object_name: {object_name}")
            await upload_ckpt_to_minio(
                client=minio_client,
                ckpt_file_local_path=zip_path,
                filename=object_name,
            )
            print(f"[{self.task.task_id}] Checkpoint for step {step} uploaded to MinIO.")
            # 清理本地的 zip 文件
            os.remove(zip_path)

        except Exception as e:
            print(f"❌ [{self.task.task_id}] Failed to upload checkpoint for step {step}: {e}")
        finally:
            # 从待处理集合中移除任务
            if step in self.pending_uploads:
                self.pending_uploads.remove(step)
    
    def _determine_base_config_path(self) -> str:
        # 这个方法保持不变
        user_conf = self.task.config
        policy_type = user_conf.get("policy", {}).get("type")
        env_type = user_conf.get("env", {}).get("type")

        if not policy_type or not env_type:
            raise ValueError("User config must specify both 'policy.type' and 'env.type'")

        config_filename = f"{policy_type}_{env_type}_config.json"
        
        # 确保路径相对于项目根目录
        # 在生产中，最好使用绝对路径或环境变量来定义 config 目录
        project_root = Path(__file__).resolve().parent.parent.parent
        base_path = project_root / "config"
        config_file_path = base_path / config_filename

        logging.info(f"Determined base config file: {config_file_path}")

        if not config_file_path.exists():
            raise FileNotFoundError(f"Base config file '{config_filename}' not found at '{config_file_path}'")
            
        return str(config_file_path)

    def _load_config_from_checkpoint(self, checkpoint_dir: str) -> dict:
        """从checkpoint的train_config.json加载配置"""
        train_config_path = Path(checkpoint_dir) / "pretrained_model" / "train_config.json"
        
        if not train_config_path.exists():
            raise FileNotFoundError(f"Train config not found in checkpoint: {train_config_path}")
        
        print(f"[{self.task.task_id}] Loading config from checkpoint: {train_config_path}")
        
        with open(train_config_path, 'r') as f:
            checkpoint_config = json.load(f)
        
        print(f"[{self.task.task_id}] Loaded config from checkpoint with {len(checkpoint_config)} keys")
        return checkpoint_config

    def _get_checkpoint_config_path(self, checkpoint_dir: str) -> str:
        """从checkpoint获取train_config.json文件路径作为基础配置文件"""
        train_config_path = Path(checkpoint_dir) / "pretrained_model" / "train_config.json"
        
        if not train_config_path.exists():
            raise FileNotFoundError(f"Train config not found in checkpoint: {train_config_path}")
        
        return str(train_config_path)

    async def train(self, start_step: int, end_step: int) -> int:
        task_id = self.task.task_id
        print(f"[{task_id}] Starting REAL training slice: step {start_step} -> {end_step}")

        try:
            minio_client = await get_minio_client()
            
            # 准备：下载数据集（如果第一次运行）和 checkpoint (如果断点续练)
            # 1. 下载数据集
            local_dataset_dir = os.path.join(self.run_dir, "dataset")
            print(f"[{task_id}] Checking local dataset directory: {local_dataset_dir}")
            if not os.path.exists(local_dataset_dir) and start_step == 0:
                print(f"[{task_id}] Downloading dataset...")
                dataset_zip_path = os.path.join(self.run_dir, "dataset.zip")
                
                # 从嵌套的 config 中获取 repo_id
                dataset_conf = self.task.config.get("dataset", {})
                # repo_id = dataset_conf.get("repo_id")
                # if not repo_id:
                    # raise ValueError("dataset.repo_id not found in task config.")
                
                # 在 MinIO 中，路径通常不带组织名，例如 'aloha_sim_insertion_human.zip'
                # minio_object_name = f"{repo_id.split('/')[-1]}.zip"
                dataset_object_name = f"{self.task.dataset_uuid}.zip"
                
                success, _ = await download_dataset_from_minio(
                    client=minio_client,
                    download_local_path=dataset_zip_path,
                    dataset_name=dataset_object_name,
                )
                if not success: raise RuntimeError("Failed to download dataset.")
                
                print(f"[{task_id}] Unpacking dataset...")
                shutil.unpack_archive(dataset_zip_path, local_dataset_dir)
                os.remove(dataset_zip_path)

                # 添加调试代码
                print(f"[{task_id}] --- Verifying dataset structure ---")
                for root, dirs, files in os.walk(local_dataset_dir):
                    # 只打印两层深度
                    level = root.replace(local_dataset_dir, '').count(os.sep)
                    if level < 3:
                        indent = ' ' * 4 * (level)
                        print(f'{indent}{os.path.basename(root)}/')
                        sub_indent = ' ' * 4 * (level + 1)
                        for f in files[:3]: # 只看几个文件
                            print(f'{sub_indent}{f}')
                print(f"[{task_id}] --- End of structure verification ---")

            # 2. 下载上一个 checkpoint 从minio 下载到本地
            checkpoint_extract_dir = None  # 用于存储checkpoint解压目录
            if start_step > 0:
                print(f"[{task_id}] Downloading previous checkpoint to resume training...")
                # 假设 Scheduler 知道上一个 checkpoint 的 step
                # 我们需要找到上一个保存的 checkpoint step
                prev_save_step = (start_step // self.task.config.get("save_freq", 1000)) * self.task.config.get("save_freq", 1000)
                if prev_save_step > 0:
                    checkpoint_zip_path = os.path.join(self.run_dir, f"checkpoint_step_{prev_save_step}.zip")
                    checkpoint_object_name = f"{self.task.task_id}/checkpoint_step_{prev_save_step}.zip"
                    print(f"[{task_id}] download checkpoint_object_name: {checkpoint_object_name}")
                    
                    success, _ = await download_ckpt_from_minio(
                        client=minio_client,
                        download_local_path=checkpoint_zip_path,
                        ckpt_name=checkpoint_object_name,
                    )
                    if not success: raise RuntimeError(f"Failed to download checkpoint for step {prev_save_step}.")
                    
                    # 解压到 lerobot 期望的 checkpoints 目录结构
                    checkpoint_extract_dir = os.path.join(self.run_dir, "checkpoints", f"{prev_save_step:06d}")
                    os.makedirs(os.path.dirname(checkpoint_extract_dir), exist_ok=True)
                    shutil.unpack_archive(checkpoint_zip_path, checkpoint_extract_dir)
                    os.remove(checkpoint_zip_path)

                    # 创建 last symlink
                    last_link = Path(self.run_dir) / "checkpoints" / "last"
                    if last_link.exists(): last_link.unlink()
                    last_link.symlink_to(f"{prev_save_step:06d}")

            # 确定使用哪个配置和基础配置文件路径
            if start_step > 0 and checkpoint_extract_dir is not None:
                # 从checkpoint恢复训练：使用checkpoint中的train_config.json作为基础配置
                print(f"[{task_id}] Resuming training from checkpoint")
                
                # 从checkpoint获取train_config.json作为基础配置文件
                try:
                    base_config_path = self._get_checkpoint_config_path(checkpoint_extract_dir)
                    print(f"[{task_id}] Using checkpoint train_config.json as base config: {base_config_path}")
                except Exception as e:
                    print(f"[{task_id}] Warning: Failed to get train_config.json from checkpoint: {e}")
                    print(f"[{task_id}] Falling back to user config inference")
                    base_config_path = self._determine_base_config_path()
                
                # 创建恢复训练的配置，添加resume=true参数
                training_config = {
                    "resume": True,  # 关键：设置resume=true
                    "steps": self.task.config.get("steps", 100000),  # 保持总步数
                    "save_freq": self.task.config.get("save_freq", 1000),  # 保持保存频率
                    "log_freq": self.task.config.get("log_freq", 100),  # 保持日志频率
                    "batch_size": self.task.config.get("batch_size", 8),  # 保持batch size
                }
            else:
                # 初始训练：使用用户提供的配置
                print(f"[{task_id}] Starting initial training with user-provided config")
                training_config = self.task.config
                base_config_path = self._determine_base_config_path()
            
            # 准备线程安全的回调函数
            def sync_log_callback(step, metrics):
                asyncio.run_coroutine_threadsafe(self._log_callback(step, metrics), self.loop)

            def sync_save_callback(step, ckpt_dir):
                # 将任务添加到待处理集合
                self.pending_uploads.add(step)
                # 提交异步任务
                asyncio.run_coroutine_threadsafe(self._save_checkpoint_callback(step, ckpt_dir), self.loop)

            # 在一个单独的线程中运行同步的训练代码，防止阻塞 Actor
            final_step = await asyncio.to_thread(
                run_lerobot_training,
                base_config_path,
                training_config,  # 使用确定的配置
                self.run_dir,
                self.task.task_id,
                start_step,
                end_step,
                sync_log_callback,
                sync_save_callback,
            )

            # 等待所有异步上传任务完成
            print(f"[{task_id}] Training completed. Waiting for {len(self.pending_uploads)} pending uploads...")
            while self.pending_uploads:
                await asyncio.sleep(0.1)  # 短暂等待
            print(f"[{task_id}] All uploads completed.")

            # 检查是否训练完成，并上传最终模型
            total_steps = training_config.get('steps', 100000)  # 使用确定的配置
            if final_step >= total_steps:
                 print(f"[{task_id}] Final step reached. Uploading final model.")
                 await self._save_checkpoint_callback(final_step, 
                    os.path.join(self.run_dir, "checkpoints", f"{final_step:06d}"))

            return final_step

        except Exception as e:
            print(f"❌ [{task_id}] Training failed with an exception: {e}")
            # 可以在这里做更详细的错误处理
            raise e