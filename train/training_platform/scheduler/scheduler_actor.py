import ray
import asyncio
from collections import deque
from typing import Deque, Optional

from training_platform.configs.settings import settings
from training_platform.common.task_models import TrainingTask
from training_platform.common.rabbitmq_utils import init_rabbitmq, send_status_message
from training_platform.trainer.lerobot_train_actor import TrainerActor
import torch.cuda

@ray.remote
class Scheduler:
    def __init__(self):
        # 获取集群资源
        cluster_resources = ray.cluster_resources()
        self.num_gpus = cluster_resources.get("GPU", 0)
        print(f"[Scheduler] Number of GPUs: {self.num_gpus}")
        
        self.task_queue: Deque[TrainingTask] = deque()
        self.running_task: Optional[TrainingTask] = None
        self.trainer_actor: Optional["ray.actor.ActorHandle"] = None
        
        self.steps_per_timeslice = settings.SCHEDULER_STEPS_PER_TIMESLICE
        self.num_gpus_per_trainer = settings.SCHEDULER_GPUS_PER_TRAINER
        
        # Actor 启动时，调用一次 init_rabbitmq 来确保连接
        # Manager 模式会处理重复调用的问题
        asyncio.create_task(init_rabbitmq())
        
        print("[Scheduler] Actor initialized.")
        
        # # Test CUDA
        # if torch.cuda.is_available():
        #     print(f"✅ CUDA OK: {torch.cuda.device_count()} GPUs available")
        # else:
        #     print("❌ CUDA not available")

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
                print(f"[Scheduler] Trainer options: {trainer_options}")
                
                self.trainer_actor = TrainerActor.options(**trainer_options).remote(self.running_task) #constructor
                # self.trainer_actor = TrainerActor(self.running_task)
                
                total_steps = self.running_task.config.get('steps', 10)
                start_step = self.running_task.current_step
                end_step = min(start_step + self.steps_per_timeslice, total_steps)
                
                await send_status_message(task_id=int(self.running_task.task_id), status="running")
                
                try:
                    final_step = await self.trainer_actor.train.remote(start_step, end_step) #method
                    # final_step = await self.trainer_actor.train(start_step, end_step)
                    self.running_task.current_step = final_step
                    
                    if final_step >= total_steps:
                        await send_status_message(task_id=int(self.running_task.task_id), status="completed")
                    else:
                        self.task_queue.append(self.running_task)
                        # await send_status_message(task_id=int(self.running_task.task_id), status="paused", uuid=self.running_task.uuid)
                except Exception as e:
                    print(f"❌ [Scheduler] Training failed for task {self.running_task.task_id}: {e}")
                    await send_status_message(task_id=int(self.running_task.task_id), status="failed")
                finally:
                    if self.trainer_actor: ray.kill(self.trainer_actor)
                    self.trainer_actor, self.running_task = None, None
            
            await asyncio.sleep(1)