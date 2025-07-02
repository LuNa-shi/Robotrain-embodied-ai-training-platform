import ray
import asyncio
from collections import deque
from typing import Deque, Optional

from training_platform.configs.settings import settings
from training_platform.common.task_models import TrainingTask
from training_platform.common.rabbitmq_utils import init_rabbitmq, send_status_message
from training_platform.trainer.trainer_actor import TrainerActor

@ray.remote
class Scheduler:
    def __init__(self):
        self.task_queue: Deque[TrainingTask] = deque()
        self.running_task: Optional[TrainingTask] = None
        self.trainer_actor: Optional["ray.actor.ActorHandle"] = None
        
        self.steps_per_timeslice = settings.SCHEDULER_STEPS_PER_TIMESLICE
        self.num_gpus_per_trainer = settings.SCHEDULER_GPUS_PER_TRAINER
        
        # Actor 启动时，调用一次 init_rabbitmq 来确保连接
        # Manager 模式会处理重复调用的问题
        asyncio.create_task(init_rabbitmq())
        
        print("[Scheduler] Actor initialized.")

    async def add_task(self, task_data: dict):
        task = TrainingTask(**task_data)
        self.task_queue.append(task)
        print(f"[Scheduler] Task {task.task_id} added to queue.")

    async def run(self):
        print("[Scheduler] Main loop started.")
        while True:
            if self.running_task is None and self.task_queue:
                self.running_task = self.task_queue.popleft()
                
                print(f"[Scheduler] Starting training for task: {self.running_task.task_id}")
                
                trainer_options = {"num_gpus": self.num_gpus_per_trainer}
                self.trainer_actor = TrainerActor.options(**trainer_options).remote(self.running_task)
                
                total_epochs = self.running_task.config.get('epochs', 10)
                start_epoch = self.running_task.current_step
                end_epoch = min(start_epoch + self.steps_per_timeslice, total_epochs)
                
                await send_status_message(task_id=self.running_task.task_id, status="running", model_uuid=None)
                
                try:
                    final_epoch = await self.trainer_actor.train.remote(start_epoch, end_epoch)
                    self.running_task.current_step = final_epoch
                    
                    if final_epoch >= total_epochs:
                        await send_status_message(task_id=int(self.running_task.task_id), status="completed", model_uuid=self.running_task.model_uuid)
                    else:
                        self.task_queue.append(self.running_task)
                        # await send_status_message(task_id=int(self.running_task.task_id), status="paused", uuid=self.running_task.uuid)
                except Exception as e:
                    print(f"❌ [Scheduler] Training failed for task {self.running_task.task_id}: {e}")
                    await send_status_message(task_id=int(self.running_task.task_id), status="failed", model_uuid=None)
                finally:
                    if self.trainer_actor: ray.kill(self.trainer_actor)
                    self.trainer_actor, self.running_task = None, None
            
            await asyncio.sleep(1)