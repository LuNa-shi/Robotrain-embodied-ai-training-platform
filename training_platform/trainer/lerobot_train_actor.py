# training_platform/trainer/trainer_actor.py

import logging
import ray
import asyncio
import os
import shutil
import functools
from pathlib import Path
import subprocess

from training_platform.configs.settings import settings
from training_platform.common.task_models import TrainingTask
from training_platform.common.rabbitmq_utils import init_rabbitmq, send_log_message
from training_platform.common.minio_utils import get_minio_client, upload_file_to_minio, download_file_from_minio

# 导入我们的新训练逻辑
from training_platform.trainer.lerobot_trainer_logic import run_lerobot_training

@ray.remote
class TrainerActor:
    def __init__(self, task: TrainingTask):
        self.task = task
        self.run_dir = os.path.join(settings.RUN_DIR_BASE, self.task.uuid)
        os.makedirs(self.run_dir, exist_ok=True)
        
        # 获取当前actor的事件循环，用于线程安全的回调
        self.loop = asyncio.get_running_loop()

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
            object_name = f"checkpoints/{self.task.uuid}/checkpoint_step_{step}.zip"
            
            await upload_file_to_minio(
                client=minio_client,
                upload_file_local_path=zip_path,
                filename=object_name, # 使用完整的 object name
                bucket_name=settings.MINIO_CHECKPOINT_BUCKET,
            )
            print(f"[{self.task.task_id}] Checkpoint for step {step} uploaded to MinIO.")
            # 清理本地的 zip 文件
            os.remove(zip_path)

        except Exception as e:
            print(f"❌ [{self.task.task_id}] Failed to upload checkpoint for step {step}: {e}")
    
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


    async def train(self, start_step: int, end_step: int) -> int:
        task_id = self.task.task_id
        print(f"[{task_id}] Starting REAL training slice: step {start_step} -> {end_step}")

        try:
            minio_client = await get_minio_client()
            
            # 准备：下载数据集（如果第一次运行）和 checkpoint (如果断点续练)
            # 1. 下载数据集, minIO 存在哪里？ 先自己上传到minio，再下载下来。
            # 最大的问题是 下载到哪，repo id local 可能有冲突 /tmp/uuid/....
            # 不知道要不要convert to v21
            local_dataset_dir = os.path.join(self.run_dir, "dataset")
            if not os.path.exists(local_dataset_dir) and start_step == 0:
                print(f"[{task_id}] Downloading dataset...")
                dataset_zip_path = os.path.join(self.run_dir, "dataset.zip")
                
                # 从嵌套的 config 中获取 repo_id
                dataset_conf = self.task.config.get("dataset", {})
                repo_id = dataset_conf.get("repo_id")
                print(f"[{task_id}] repo_id: {repo_id}")
                if not repo_id:
                    raise ValueError("dataset.repo_id not found in task config.")
                
                # 在 MinIO 中，路径通常不带组织名，例如 'aloha_sim_insertion_human.zip'
                minio_object_name = f"{repo_id.split('/')[-1]}.zip"
                dataset_object_name = f"datasets/{minio_object_name}"
                
                success, _ = await download_file_from_minio(
                    client=minio_client,
                    bucket_name=settings.MINIO_DATASET_BUCKET,
                    object_name=dataset_object_name,
                    local_file_path=dataset_zip_path,
                )
                if not success: raise RuntimeError("Failed to download dataset.")
                
                print(f"[{task_id}] Unpacking dataset...")
                shutil.unpack_archive(dataset_zip_path, local_dataset_dir)
                os.remove(dataset_zip_path)

                # -------------new part: convert to v21
                # --- 添加调试代码 ---
                print(f"[{task_id}] --- Verifying dataset structure ---")
                for root, dirs, files in os.walk(local_dataset_dir):
                    # 只打印两层深度
                    level = root.replace(local_dataset_dir, '').count(os.sep)
                    if level < 2:
                        indent = ' ' * 4 * (level)
                        print(f'{indent}{os.path.basename(root)}/')
                        sub_indent = ' ' * 4 * (level + 1)
                        for f in files[:3]: # 只看几个文件
                            print(f'{sub_indent}{f}')
                print(f"[{task_id}] --- End of structure verification ---")

                print(f"[{task_id}] Converting dataset format if needed...")
                # 找到转换脚本的路径
                project_root = Path(__file__).resolve().parent.parent.parent
                conversion_script_path = project_root / "lerobot/common/datasets/v21/convert_dataset_v20_to_v21.py"
                
                if not conversion_script_path.exists():
                    print(f"WARNING: Conversion script not found at {conversion_script_path}, skipping conversion.")
                else:
                    # 使用 subprocess 调用脚本
                    # 我们将 repo_id 指向解压后的数据集目录
                    cmd = [
                        "python", 
                        str(conversion_script_path), 
                        f"--repo-id={local_dataset_dir}"
                    ]
                    print(f"Running command: {' '.join(cmd)}")
                    # 在一个单独的线程中运行这个阻塞的命令
                    process = await asyncio.to_thread(
                        subprocess.run, cmd, capture_output=True, text=True
                    )   
                    
                    if process.returncode != 0:
                        print(f"ERROR: Dataset conversion failed.")
                        print(f"STDOUT: {process.stdout}")
                        print(f"STDERR: {process.stderr}")
                        raise RuntimeError("Dataset format conversion script failed.")
                    else:
                        print(f"Dataset conversion successful.")
                        print(process.stdout)

            # 2. 下载上一个 checkpoint 从minio 下载到本地
            if start_step > 0:
                print(f"[{task_id}] Downloading previous checkpoint to resume training...")
                # 假设 Scheduler 知道上一个 checkpoint 的 step
                # 我们需要找到上一个保存的 checkpoint step
                prev_save_step = (start_step // self.task.config.get("save_freq", 1000)) * self.task.config.get("save_freq", 1000)
                if prev_save_step > 0:
                    checkpoint_zip_path = os.path.join(self.run_dir, f"checkpoint_step_{prev_save_step}.zip")
                    checkpoint_object_name = f"checkpoints/{self.task.uuid}/checkpoint_step_{prev_save_step}.zip"
                    
                    success, _ = await download_file_from_minio(
                        client=minio_client,
                        bucket_name=settings.MINIO_CHECKPOINT_BUCKET,
                        object_name=checkpoint_object_name,
                        local_file_path=checkpoint_zip_path
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

            base_config_path = self._determine_base_config_path()

            # 准备线程安全的回调函数
            # lerobot 的训练循环是同步的，所以它不能 `await` 我们的异步回调。
            # 我们使用 `run_coroutine_threadsafe` 将异步任务提交到 Ray Actor 的事件循环中。
            def sync_log_callback(step, metrics):
                asyncio.run_coroutine_threadsafe(self._log_callback(step, metrics), self.loop)

            def sync_save_callback(step, ckpt_dir):
                asyncio.run_coroutine_threadsafe(self._save_checkpoint_callback(step, ckpt_dir), self.loop)

            # 在一个单独的线程中运行同步的训练代码，防止阻塞 Actor
            final_step = await asyncio.to_thread(
                run_lerobot_training,
                base_config_path,
                self.task.config,
                self.run_dir,
                start_step,
                end_step,
                sync_log_callback,
                sync_save_callback,
            )

            # 检查是否训练完成，并上传最终模型
            total_steps = self.task.config.get('steps', 100000) # 从配置中获取总步数
            if final_step >= total_steps:
                 print(f"[{task_id}] Final step reached. Uploading final model.")
                 # final model 通常就是最后一个 checkpoint
                 await self._save_checkpoint_callback(final_step, 
                    os.path.join(self.run_dir, "checkpoints", f"{final_step:06d}"))

            return final_step

        except Exception as e:
            print(f"❌ [{task_id}] Training failed with an exception: {e}")
            # 可以在这里做更详细的错误处理
            raise e