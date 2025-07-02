import ray
import asyncio
import os
from uuid import uuid4

from training_platform.configs.settings import settings
from training_platform.common.task_models import TrainingTask
from training_platform.common.rabbitmq_utils import init_rabbitmq, send_log_message
from training_platform.common.minio_utils import get_minio_client, upload_model_to_minio, download_dataset_from_minio

@ray.remote
class TrainerActor:
    def __init__(self, task: TrainingTask):
        self.task = task
        self.run_dir = os.path.join(settings.RUN_DIR_BASE, self.task.task_id)
        os.makedirs(self.run_dir, exist_ok=True)
        
        # Manager 模式确保在 Actor 启动时，异步地准备好连接
        asyncio.create_task(init_rabbitmq())
        
        print(f"[{self.task.task_id}] Trainer Actor initialized.")

    async def train(self, start_epoch: int, end_epoch: int) -> int:
        task_id = int(self.task.task_id)
        print(f"[{task_id}] Starting training slice: epoch {start_epoch} -> {end_epoch}")

        minio_client = await get_minio_client()
        if not minio_client:
            raise ConnectionError("Trainer could not connect to MinIO.")
        
        if start_epoch == 0:
            local_zip_path = os.path.join(self.run_dir, "dataset.zip")
            print(f"[{task_id}] Mock downloading dataset...")
            await download_dataset_from_minio(
                client=minio_client,
                download_local_path=local_zip_path,
                dataset_name=self.task.dataset_uuid
            )
        
        for epoch in range(start_epoch, end_epoch):
            await asyncio.sleep(2)
            await send_log_message(
                task_id=task_id,
                epoch=epoch + 1,
                loss=0.1 * (10 - (epoch + 1)),
                accuracy=0.1 * (epoch + 1),
                log_message=f"Epoch {epoch + 1} completed."
            )
            print(f"[{task_id}] Epoch {epoch + 1}/{end_epoch} finished.")
        
        total_epochs = self.task.config.get('epochs', 10)
        if end_epoch >= total_epochs:
            print(f"[{task_id}] Final epoch reached. Simulating model upload...")
            model_uuid = str(uuid4())
            self.task.model_uuid = model_uuid
            local_model_path = os.path.join(self.run_dir, "model.zip")
            with open(local_model_path, "w") as f:
                f.write("fake model data")
            
            await upload_model_to_minio(
                client=minio_client,
                model_file_local_path=local_model_path,
                filename=f"{model_uuid}.zip"
            )
            print(f"[{task_id}] Mock model {model_uuid} uploaded.")

        return end_epoch