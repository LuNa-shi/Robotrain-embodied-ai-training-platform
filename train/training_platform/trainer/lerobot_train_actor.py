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
import glob

from training_platform.configs.settings import settings
from training_platform.common.task_models import TrainingTask
from training_platform.common.rabbitmq_utils import init_rabbitmq, send_log_message
from training_platform.common.minio_utils import get_minio_client, upload_ckpt_to_minio, download_ckpt_from_minio, download_dataset_from_minio

# 导入我们的新训练逻辑
# from training_platform.trainer.lerobot_trainer_logic import run_lerobot_training
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
        # self.pending_uploads = set()

        # Manager 模式确保在 Actor 启动时，异步地准备好连接
        asyncio.create_task(init_rabbitmq())
        
        print(f"[{self.task.task_id}] Trainer Actor initialized for real training.")

    # async def _log_callback(self, step: int, metrics: dict):
    #     """异步日志回调，发送消息到 RabbitMQ。"""
    #     # 从 metrics 字典中提取关键信息
    #     loss = metrics.get('loss', 0.0)
    #     # 你可以添加任何你想从 lerobot tracker 中记录的指标
    #     log_msg = f"Step {step}: loss={loss:.4f}, lr={metrics.get('lr', 0.0):.1e}"
    #     await send_log_message(
    #         task_id=self.task.task_id,
    #         epoch=step, # 在我们的平台中，step 等同于 epoch
    #         loss=loss,
    #         accuracy=-1.0, # lerobot 通常不直接报告 accuracy，设为-1
    #         log_message=log_msg
    #     )

    # async def _save_checkpoint_callback(self, step: int, checkpoint_dir: str):
    #     """异步保存回调，将 checkpoint 目录压缩并上传到 MinIO。"""
    #     try:
    #         print(f"[{self.task.task_id}] Compressing checkpoint dir: {checkpoint_dir}")
    #         # 将 checkpoint 目录打包成 zip 文件
    #         zip_base_name = os.path.join(self.run_dir, f"checkpoint_step_{step}")
    #         zip_path = shutil.make_archive(zip_base_name, 'zip', checkpoint_dir)
            
    #         # 上传到 MinIO
    #         minio_client = await get_minio_client()
    #         object_name = f"{self.task.task_id}/checkpoint_step_{step}.zip"
    #         print(f"[{self.task.task_id}] upload checkpoint_object_name: {object_name}")
    #         await upload_ckpt_to_minio(
    #             client=minio_client,
    #             ckpt_file_local_path=zip_path,
    #             filename=object_name,
    #         )
    #         print(f"[{self.task.task_id}] Checkpoint for step {step} uploaded to MinIO.")
    #         # 清理本地的 zip 文件
    #         os.remove(zip_path)

    #     except Exception as e:
    #         print(f"❌ [{self.task.task_id}] Failed to upload checkpoint for step {step}: {e}")
    #     finally:
    #         # 从待处理集合中移除任务
    #         if step in self.pending_uploads:
    #             self.pending_uploads.remove(step)

    async def _upload_checkpoint_to_minio(self, step: int, checkpoint_dir: str):
        """将单个本地 checkpoint 目录压缩并上传到 MinIO"""
        try:
            print(f"[{self.task.task_id}] Compressing and uploading checkpoint dir: {checkpoint_dir}")
            zip_base_name = os.path.join(self.run_dir, f"checkpoint_step_{step}")
            zip_path = shutil.make_archive(zip_base_name, 'zip', checkpoint_dir)
            checkpoint_path = Path(checkpoint_dir)
            minio_client = await get_minio_client()
            object_name = f"{self.task.task_id}/checkpoint_step_{step}.zip"
            print(f"[{self.task.task_id}] Uploading checkpoint object: {object_name}")
            await upload_ckpt_to_minio(client=minio_client, 
                                       ckpt_file_local_path=zip_path, 
                                       filename=object_name)
            print(f"[{self.task.task_id}] Checkpoint for step {step} uploaded to MinIO.")
            
        except Exception as e:
            print(f"❌ [{self.task.task_id}] Failed to upload checkpoint for step {step}: {e}")
        finally:
            # 清理本地的 zip 文件
            if os.path.exists(zip_path):
                os.remove(zip_path)
            if zip_path and checkpoint_path.exists():
                try:
                    shutil.rmtree(checkpoint_path)
                    print(f"🧹 [{self.task.task_id}] Cleaned up local checkpoint directory: {checkpoint_path}")
                except OSError as e:
                    print(f"⚠️ [{self.task.task_id}] Error removing checkpoint directory {checkpoint_path}: {e}")
            
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

        gpu_ids = ray.get_gpu_ids()
        num_gpus = len(gpu_ids)
        if num_gpus == 0:
            raise RuntimeError(f"TrainerActor for task {task_id} was not allocated any GPUs.")
        print(f"[{task_id}] Actor has been allocated {num_gpus} GPU(s): {gpu_ids}")
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

                # print(f"[{task_id}] --- Verifying dataset structure ---")
                # for root, dirs, files in os.walk(local_dataset_dir):
                #     # 只打印两层深度
                #     level = root.replace(local_dataset_dir, '').count(os.sep)
                #     if level < 3:
                #         indent = ' ' * 4 * (level)
                #         print(f'{indent}{os.path.basename(root)}/')
                #         sub_indent = ' ' * 4 * (level + 1)
                #         for f in files[:3]: # 只看几个文件
                #             print(f'{sub_indent}{f}')
                # print(f"[{task_id}] --- End of structure verification ---")

            # 2. 下载上一个 checkpoint 从minio 下载到本地
            checkpoint_extract_dir = None  # 用于存储checkpoint解压目录
            if start_step > 0:
                print(f"[{task_id}] Downloading previous checkpoint to resume training...")

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
                    
                    # HIGHLIGHT: 修复10: 使用与上传MinIO相同的路径确定逻辑
                    # 首先尝试从training_config_info.json读取正确的checkpoint路径
                    config_info_path = Path(self.run_dir) / "training_config_info.json"
                    checkpoint_base_dir = None
                    
                    if config_info_path.exists():
                        try:
                            with open(config_info_path, 'r') as f:
                                config_info = json.load(f)
                            
                            output_dir = config_info.get("output_dir")
                            if output_dir:
                                checkpoint_base_dir = Path(output_dir) / "checkpoints"
                                print(f"[{task_id}] Using checkpoint path from config: {checkpoint_base_dir}")
                            else:
                                print(f"[{task_id}] Warning: 'output_dir' not found in config_info.json")
                        except (json.JSONDecodeError, ValueError) as e:
                            print(f"[{task_id}] Warning: Failed to read config_info.json: {e}")
                    
                    # 如果无法从配置文件获取，则使用默认路径
                    if checkpoint_base_dir is None:
                        checkpoint_base_dir = Path(self.run_dir) / "checkpoints"
                        print(f"[{task_id}] Using default checkpoint path: {checkpoint_base_dir}")
                    
                    # 确保checkpoint目录存在
                    os.makedirs(checkpoint_base_dir, exist_ok=True)
                    
                    # 解压到正确的checkpoint目录
                    checkpoint_extract_dir = checkpoint_base_dir / f"{prev_save_step:06d}"
                    print(f"[{task_id}] Extracting checkpoint to: {checkpoint_extract_dir}")
                    shutil.unpack_archive(checkpoint_zip_path, checkpoint_extract_dir)
                    os.remove(checkpoint_zip_path)
                    
                    # HIGHLIGHT: 修复9: 验证解压后的目录结构
                    checkpoint_path = Path(checkpoint_extract_dir)
                    training_state_path = checkpoint_path / "training_state"
                    pretrained_model_path = checkpoint_path / "pretrained_model"
                    
                    # 验证必需的目录
                    if not training_state_path.exists():
                        print(f"❌ [{task_id}] ERROR: Training state directory not found after extraction: {training_state_path}")
                        raise RuntimeError(f"Invalid checkpoint structure: missing training_state directory")
                    
                    if not pretrained_model_path.exists():
                        print(f"❌ [{task_id}] ERROR: Pretrained model directory not found after extraction: {pretrained_model_path}")
                        raise RuntimeError(f"Invalid checkpoint structure: missing pretrained_model directory")
                    
                    print(f"✅ [{task_id}] Checkpoint extracted successfully with valid structure")

                    # 创建 last symlink
                    last_link = checkpoint_base_dir / "last"
                    if last_link.exists(): last_link.unlink()
                    last_link.symlink_to(f"{prev_save_step:06d}")

            # 确定使用哪个配置和基础配置文件路径
            if start_step > 0 and checkpoint_extract_dir is not None:
                # 从checkpoint恢复训练：使用checkpoint中的train_config.json作为基础配置
                print(f"[{task_id}] Resuming training from checkpoint")
                
                # 从checkpoint获取train_config.json作为基础配置文件
                try:
                    base_config_path = self._get_checkpoint_config_path(str(checkpoint_extract_dir))
                    print(f"[{task_id}] Using checkpoint train_config.json as base config: {base_config_path}")
                except Exception as e:
                    print(f"[{task_id}] Warning: Failed to get train_config.json from checkpoint: {e}")
                    print(f"[{task_id}] Falling back to user config inference")
                    base_config_path = self._determine_base_config_path()
                
                # 创建恢复训练的配置，添加resume=true参数
                training_config = {
                    "resume": True,  # 关键：设置resume=true
                    "steps": self.task.config.get("steps", 100000),  # 保持总步数
                    "save_freq": self.task.config.get("save_freq", 25000),  # 保持保存频率
                    "log_freq": self.task.config.get("log_freq", 100),  # 保持日志频率
                    "batch_size": self.task.config.get("batch_size", 8),  # 保持batch size
                    # HIGHLIGHT: 修复7: 确保恢复训练时传递正确的策略和环境配置
                    "policy": self.task.config.get("policy", {}),
                    "env": self.task.config.get("env", {}),
                }
            else:
                # 初始训练：使用用户提供的配置
                print(f"[{task_id}] Starting initial training with user-provided config")
                training_config = self.task.config
                base_config_path = self._determine_base_config_path()
            
            # # 准备线程安全的回调函数
            # def sync_log_callback(step, metrics):
            #     asyncio.run_coroutine_threadsafe(self._log_callback(step, metrics), self.loop)

            # def sync_save_callback(step, ckpt_dir):
            #     # 将任务添加到待处理集合
            #     self.pending_uploads.add(step)
            #     # 提交异步任务
            #     asyncio.run_coroutine_threadsafe(self._save_checkpoint_callback(step, ckpt_dir), self.loop)

            # 在一个单独的线程中运行同步的训练代码，防止阻塞 Actor
            # final_step = await asyncio.to_thread(
                # run_lerobot_training,
                # base_config_path,
                # training_config,  # 使用确定的配置
                # self.run_dir,
                # self.task.task_id,
                # start_step,
                # end_step,
                # sync_log_callback,
                # sync_save_callback,
            # )
            # final_step = await run_lerobot_training(
            #     base_config_path=base_config_path,
            #     user_override_config=training_config,  # 使用确定的配置
            #     run_dir=self.run_dir,
            #     task_id=self.task.task_id,
            #     start_step=start_step,
            #     end_step=end_step,
            #     log_callback=sync_log_callback,
            #     save_callback=sync_save_callback,
            # )

            logic_script_path = Path(__file__).parent / "lerobot_trainer_logic.py"

            # 准备传递给脚本的参数
            # 将 user_override_config 字典转为 JSON 字符串
            user_override_config_str = json.dumps(training_config)

            cmd = [
                "torchrun",
                f"--nproc_per_node={num_gpus}",
                str(logic_script_path),
                f"--base_config_path={base_config_path}",
                f"--run_dir={self.run_dir}",
                f"--task_id={task_id}",
                f"--start_step={start_step}",
                f"--end_step={end_step}",
                f"--user_override_config={user_override_config_str}"
            ]
            
            print(f"[{task_id}] Executing command: {' '.join(cmd)}")

            # 执行命令并实时打印输出
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            async def log_stream(stream, prefix):
                async for line in stream: print(f"[{task_id}-{prefix}] {line.decode().strip()}")
            
            await asyncio.gather(log_stream(process.stdout, "stdout"), log_stream(process.stderr, "stderr"))
            await process.wait()
            
            if process.returncode != 0:
                raise RuntimeError(f"Training subprocess failed with exit code {process.returncode}")

            # HIGHLIGHT: 4. Read config from the sidecar file and upload checkpoints
            print(f"[{task_id}] Training subprocess finished. Reading config info...")
            
            checkpoint_base_dir = None
            config_info_path = Path(self.run_dir) / "training_config_info.json"

            if not config_info_path.exists():
                print(f"⚠️ [{task_id}] Warning: Could not find '{config_info_path}'.")
                print(f"[{task_id}] Falling back to run_dir for checkpoints. This may not find them.")
                checkpoint_base_dir = Path(self.run_dir) / "checkpoints"
            else:
                try:
                    with open(config_info_path, 'r') as f:
                        config_info = json.load(f)
                    
                    # This is the correct, dynamically determined output directory
                    output_dir = config_info.get("output_dir")
                    if not output_dir:
                        raise ValueError("'output_dir' not found in config_info.json")
                        
                    checkpoint_base_dir = Path(output_dir) / "checkpoints"
                    print(f"[{task_id}] Successfully read config. Checkpoint base dir: {checkpoint_base_dir}")

                except (json.JSONDecodeError, ValueError) as e:
                    print(f"❌ [{task_id}] Failed to read or parse '{config_info_path}': {e}")
                    # In a production system, you might want to raise an exception here.
                    # For now, we'll print an error and stop the upload process for this slice.
                    return end_step # Or raise an exception

            print(f"[{task_id}] Scanning for new checkpoints to upload in '{checkpoint_base_dir}'...")
            
            if checkpoint_base_dir and checkpoint_base_dir.exists():
                # The rest of the logic can remain the same, as it now uses the correct base path.
                all_ckpts = sorted(glob.glob(str(checkpoint_base_dir / "[0-9]*")), key=os.path.getmtime)
                
                # Filter for checkpoints created within the current training slice
                new_ckpts_to_upload = [
                    d for d in all_ckpts if start_step < int(Path(d).name) <= end_step
                ]
                
                # Ensure the final step's checkpoint is included if it was saved
                final_ckpt_dir = checkpoint_base_dir / f"{end_step:06d}"
                if final_ckpt_dir.exists() and str(final_ckpt_dir) not in new_ckpts_to_upload:
                    new_ckpts_to_upload.append(str(final_ckpt_dir))

                if not new_ckpts_to_upload:
                    print(f"[{task_id}] No new checkpoints found in the range ({start_step}, {end_step}].")
                else:
                    print(f"[{task_id}] Found {len(set(new_ckpts_to_upload))} new checkpoint(s) to upload.")
                    for ckpt_dir in set(new_ckpts_to_upload):
                        step = int(Path(ckpt_dir).name)
                        await self._upload_checkpoint_to_minio(step, ckpt_dir)
            else:
                print(f"[{task_id}] Checkpoint directory '{checkpoint_base_dir}' does not exist. No checkpoints to upload.")


            return end_step

        except Exception as e:
            print(f"❌ [{task_id}] Training failed with an exception: {e}")
            # 可以在这里做更详细的错误处理
            raise e