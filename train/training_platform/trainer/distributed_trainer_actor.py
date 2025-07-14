# training_platform/trainer/distributed_trainer_actor.py

import logging
import ray
import asyncio
import os
import shutil
from pathlib import Path

from ray.train.torch import TorchTrainer
from ray.train import RunConfig, ScalingConfig, CheckpointConfig, Checkpoint
# New import for the callback
from ray.train.callbacks import TrainingCallback

from training_platform.configs.settings import settings
from training_platform.common.task_models import TrainingTask
from training_platform.common.rabbitmq_utils import init_rabbitmq, send_log_message
from training_platform.common.minio_utils import get_minio_client, upload_ckpt_to_minio, download_ckpt_from_minio, download_dataset_from_minio

# Import our new distributed training logic function
from training_platform.trainer.distributed_train_logic import train_func

@ray.remote(num_cpus=1) # This actor itself is lightweight
class DistributedTrainerActor:
    def __init__(self, task: TrainingTask, num_workers: int, use_gpu: bool = True):
        self.task = task
        self.num_workers = num_workers
        self.use_gpu = use_gpu
        self.run_dir = os.path.join(settings.RUN_DIR_BASE, str(self.task.task_id))
        os.makedirs(self.run_dir, exist_ok=True)
        
        # This will get the event loop of the thread the actor is running in.
        self.loop = asyncio.get_event_loop()
        self.pending_uploads = set()
        
        # Initialize RabbitMQ connection for this actor.
        asyncio.create_task(init_rabbitmq())
        
        print(f"[{self.task.task_id}] DistributedTrainerActor initialized for task. Will use {num_workers} workers.")

    async def _log_callback(self, step: int, metrics: dict):
        """Asynchronously send log metrics to RabbitMQ."""
        loss = metrics.get('loss', 0.0)
        log_msg = f"Step {step}: loss={loss:.4f}, lr={metrics.get('lr', 0.0):.1e}"
        await send_log_message(
            task_id=self.task.task_id,
            epoch=step, # Step is equivalent to epoch in our platform
            loss=loss,
            accuracy=-1.0, # lerobot doesn't report accuracy
            log_message=log_msg
        )

    async def _save_checkpoint_callback(self, step: int, checkpoint_dir: Path):
        """Compress and upload the checkpoint directory from rank 0 to MinIO."""
        try:
            print(f"[{self.task.task_id}] Compressing checkpoint dir for step {step}: {checkpoint_dir}")
            zip_base_name = Path(self.run_dir) / f"checkpoint_step_{step}"
            zip_path = shutil.make_archive(str(zip_base_name), 'zip', str(checkpoint_dir))
            
            minio_client = await get_minio_client()
            object_name = f"{self.task.task_id}/checkpoint_step_{step}.zip"
            print(f"[{self.task.task_id}] Uploading checkpoint object: {object_name}")
            
            await upload_ckpt_to_minio(
                client=minio_client,
                ckpt_file_local_path=zip_path,
                filename=object_name,
            )
            print(f"[{self.task.task_id}] Checkpoint for step {step} uploaded to MinIO.")
            os.remove(zip_path)

        except Exception as e:
            print(f"❌ [{self.task.task_id}] Failed to upload checkpoint for step {step}: {e}")
        finally:
            self.pending_uploads.discard(step)

    def _determine_base_config_path(self) -> str:
        """Determines the path to the base JSON configuration file."""
        policy_type = self.task.config.get("policy", {}).get("type")
        env_type = self.task.config.get("env", {}).get("type")

        if not policy_type or not env_type:
            raise ValueError("User config must specify both 'policy.type' and 'env.type'")

        config_filename = f"{policy_type}_{env_type}_config.json"
        project_root = Path(__file__).resolve().parent.parent.parent
        config_file_path = project_root / "config" / config_filename

        if not config_file_path.exists():
            raise FileNotFoundError(f"Base config file not found at '{config_file_path}'")
        return str(config_file_path)

    async def train(self) -> int:
        task_id = self.task.task_id
        print(f"[{task_id}] Preparing for distributed training.")

        try:
            # All setup logic is fine
            minio_client = await get_minio_client()
            local_dataset_dir = os.path.join(self.run_dir, "dataset")
            if not os.path.exists(local_dataset_dir):
                print(f"[{task_id}] Downloading dataset...")
                dataset_zip_path = os.path.join(self.run_dir, "dataset.zip")
                dataset_object_name = f"{self.task.dataset_uuid}.zip"
                success, _ = await download_dataset_from_minio(client=minio_client, download_local_path=dataset_zip_path, dataset_name=dataset_object_name)
                if not success: raise RuntimeError("Failed to download dataset.")
                shutil.unpack_archive(dataset_zip_path, local_dataset_dir)
                os.remove(dataset_zip_path)
                print(f"[{task_id}] Dataset downloaded and unpacked.")

            resume_from_checkpoint = None
            if self.task.current_step > 0:
                print(f"[{task_id}] Attempting to resume from step {self.task.current_step}")
                prev_save_step = (self.task.current_step // self.task.config.get("save_freq", 1000)) * self.task.config.get("save_freq", 1000)
                if prev_save_step > 0:
                    ckpt_obj_name = f"{task_id}/checkpoint_step_{prev_save_step}.zip"
                    local_zip = os.path.join(self.run_dir, f"resume_ckpt_{prev_save_step}.zip")
                    success, _ = await download_ckpt_from_minio(minio_client, local_zip, ckpt_obj_name)
                    if success:
                        resume_ckpt_dir = Path(self.run_dir) / "resume_checkpoint"
                        if resume_ckpt_dir.exists(): shutil.rmtree(resume_ckpt_dir)
                        shutil.unpack_archive(local_zip, resume_ckpt_dir)
                        os.remove(local_zip)
                        resume_from_checkpoint = Checkpoint.from_directory(resume_ckpt_dir)
                        print(f"[{task_id}] Will resume from checkpoint: {resume_ckpt_dir}")
                    else:
                        print(f"[{task_id}] WARNING: Failed to download checkpoint for step {prev_save_step}. Starting from scratch.")
            
            base_config_path = self._determine_base_config_path()

            train_config = {
                "base_config_path": base_config_path,
                "user_override_config": self.task.config,
                "run_dir": self.run_dir,
                "task_id": task_id,
            }

            # CORRECTION 1: Create a custom callback class to hook into Ray Train's lifecycle.
            class CustomCallback(TrainingCallback):
                def __init__(self, actor_handle):
                    self.actor = actor_handle

                def handle_result(self, results: list[dict], **kwargs):
                    # This function is called in a separate thread by Ray Train.
                    # We use thread-safe calls to the actor's event loop.
                    result = results[0] # Results is a list, one per worker. We only need one.
                    current_step = result["training_iteration"]
                    
                    if "loss" in result:
                        asyncio.run_coroutine_threadsafe(self.actor._log_callback.remote(current_step, result), self.actor.loop)

                    if "checkpoint_step" in result and result.get("checkpoint"):
                        step = result["checkpoint_step"]
                        # The path is a string, needs to be converted to Path
                        checkpoint_dir = Path(result["checkpoint"].path) 
                        self.actor.pending_uploads.add(step)
                        asyncio.run_coroutine_threadsafe(self.actor._save_checkpoint_callback.remote(step, checkpoint_dir), self.actor.loop)
            
            trainer = TorchTrainer(
                train_loop_per_worker=train_func,
                train_loop_config=train_config,
                scaling_config=ScalingConfig(num_workers=self.num_workers, use_gpu=self.use_gpu),
                run_config=RunConfig(
                    name=str(task_id),
                    storage_path=self.run_dir,
                    # CORRECTION 2: Pass the custom callback to the RunConfig.
                    callbacks=[CustomCallback(self)],
                    checkpoint_config=CheckpointConfig(num_to_keep=1),
                    log_to_file="training.log",
                ),
                resume_from_checkpoint=resume_from_checkpoint,
            )
            
            # CORRECTION 3: Run the blocking `fit()` call in a separate thread.
            # This prevents it from blocking the actor's asyncio event loop,
            # allowing the callbacks to be processed as they are triggered.
            result = await asyncio.to_thread(trainer.fit)

            print(f"[{task_id}] Training finished. Waiting for {len(self.pending_uploads)} pending uploads...")
            while self.pending_uploads:
                await asyncio.sleep(0.5)
            print(f"[{task_id}] All uploads completed.")
            
            final_step = result.metrics.get("training_iteration", self.task.config.get('steps', 0))
            return final_step or 0

        except Exception as e:
            logging.error(f"❌ [{task_id}] Distributed training failed: {e}", exc_info=True)
            raise e