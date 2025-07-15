# training_platform/scheduler/distributed_scheduler.py

import asyncio
from collections import deque
from typing import Deque, List, Tuple, Optional
import ray

from training_platform.configs.settings import settings
from training_platform.common.task_models import TrainingTask
from training_platform.common.rabbitmq_utils import init_rabbitmq, send_status_message

from training_platform.trainer.distributed_trainer_actor import DistributedTrainerActor


@ray.remote
class DistributedScheduler:
    def __init__(self):
        cluster_resources = ray.cluster_resources()
        self.total_gpus = int(cluster_resources.get("GPU", 0))
        print(f"[Scheduler] Found {self.total_gpus} total GPUs in the cluster.")

        self.task_queue: Deque[TrainingTask] = deque()
        self.running_jobs: List[Tuple[TrainingTask, ray.actor.ActorHandle]] = []
        
        self.gpus_per_task = settings.SCHEDULER_GPUS_PER_TRAINER
        
        # 添加关闭标志
        self._shutdown_flag = False
        
        asyncio.create_task(init_rabbitmq())
        
        print("[Scheduler] DistributedScheduler Actor initialized.")

    async def shutdown(self):
        """优雅地关闭分布式调度器，清理所有正在运行的任务"""
        print("[DistributedScheduler] Shutdown requested...")
        self._shutdown_flag = True
        
        # 清理所有正在运行的任务
        if self.running_jobs:
            print(f"[DistributedScheduler] Cleaning up {len(self.running_jobs)} running jobs...")
            for task, actor in self.running_jobs:
                try:
                    ray.kill(actor)
                    print(f"[DistributedScheduler] Killed actor for task {task.task_id}")
                except Exception as e:
                    print(f"[DistributedScheduler] Error killing actor for task {task.task_id}: {e}")
            
            self.running_jobs.clear()
        
        print("[DistributedScheduler] Shutdown completed")

    async def add_task(self, task_data: dict):
        task = TrainingTask(**task_data)
        self.task_queue.append(task)
        print(f"[Scheduler] Task {task.task_id} added to queue. Queue length: {len(self.task_queue)}")
        await send_status_message(task_id=task.task_id, status="queued")

    def _get_available_gpus(self) -> int:
        gpus_in_use = sum(self.gpus_per_task for _, _ in self.running_jobs)
        return self.total_gpus - gpus_in_use

    async def _launch_tasks(self):
        available_gpus = self._get_available_gpus()
        
        while available_gpus >= self.gpus_per_task and self.task_queue:
            task_to_run = self.task_queue.popleft()
            task_id = task_to_run.task_id
            
            print(f"[Scheduler] Launching task {task_id} with {self.gpus_per_task} GPUs.")
            
            # CORRECTION: The actor itself is lightweight and does not need GPUs.
            # The GPUs are requested by the TorchTrainer it launches internally via
            # its ScalingConfig. Removing `num_gpus` from the actor options
            # ensures the actor can be placed on any node (e.g., the head node)
            # and the training workers will be placed on nodes with GPUs.
            trainer_actor = DistributedTrainerActor.remote(
                task=task_to_run,
                num_workers=self.gpus_per_task,
                use_gpu=True
            )
            
            self.running_jobs.append((task_to_run, trainer_actor))
            
            train_future = trainer_actor.train.remote()
            asyncio.create_task(self._handle_task_completion(task_to_run, trainer_actor, train_future))
            
            await send_status_message(task_id=task_id, status="running")
            available_gpus -= self.gpus_per_task

    async def _handle_task_completion(self, task: TrainingTask, actor: ray.actor.ActorHandle, future: ray.ObjectRef):
        task_id = task.task_id
        try:
            final_step = await future
            print(f"✅ [Scheduler] Task {task_id} completed successfully at step {final_step}.")
            await send_status_message(task_id=task_id, status="completed")
        except Exception as e:
            print(f"❌ [Scheduler] Task {task_id} failed with error: {e}")
            await send_status_message(task_id=task_id, status="failed")
        finally:
            self.running_jobs = [(t, a) for t, a in self.running_jobs if a != actor]
            ray.kill(actor)
            print(f"[Scheduler] Cleaned up resources for task {task_id}. Available GPUs: {self._get_available_gpus()}")

    async def run(self):
        print("[Scheduler] Main loop started.")
        while not self._shutdown_flag:
            try:
                if self.task_queue:
                    await self._launch_tasks()
                await asyncio.sleep(5)
            except Exception as e:
                if not self._shutdown_flag:
                    print(f"[DistributedScheduler] Error in main loop: {e}")
                    await asyncio.sleep(5)
        
        print("[DistributedScheduler] Main loop ended")