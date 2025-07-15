import ray
import asyncio
from collections import deque
from typing import Deque, Optional, Union

from training_platform.configs.settings import settings
from training_platform.common.task_models import TrainingTask, EvaluationTask
from training_platform.common.rabbitmq_utils import init_rabbitmq, send_status_message
from training_platform.trainer.lerobot_train_actor import TrainerActor
from training_platform.evaluator.lerobot_evaluate_actor import EvaluatorActor
import torch.cuda

@ray.remote
class Scheduler:
    def __init__(self):
        # 获取集群资源
        cluster_resources = ray.cluster_resources()
        self.num_gpus = cluster_resources.get("GPU", 0)
        print(f"[Scheduler] Number of GPUs: {self.num_gpus}")
        
        # 分别维护训练和评估任务队列
        self.training_task_queue: Deque[TrainingTask] = deque()
        self.evaluation_task_queue: Deque[EvaluationTask] = deque()
        
        # 分别维护运行中的任务
        self.running_training_task: Optional[TrainingTask] = None
        self.running_evaluation_task: Optional[EvaluationTask] = None
        
        # 分别维护运行中的 Actor
        self.trainer_actor: Optional["ray.actor.ActorHandle"] = None
        self.evaluator_actor: Optional["ray.actor.ActorHandle"] = None
        
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

    async def add_training_task(self, task_data: dict):
        """添加训练任务到队列"""
        task = TrainingTask(**task_data)
        self.training_task_queue.append(task)
        print(f"[Scheduler] Training task {task.task_id} added to queue.")

    async def add_evaluation_task(self, task_data: dict):
        """添加评估任务到队列"""
        task = EvaluationTask(**task_data)
        self.evaluation_task_queue.append(task)
        print(f"[Scheduler] Evaluation task {task.eval_task_id} added to queue.")

    async def add_task(self, task_data: dict):
        """通用的任务添加方法，根据任务类型分发"""
        task_type = task_data.get("task_type", "training")
        
        if task_type == "evaluation":
            await self.add_evaluation_task(task_data)
        else:
            await self.add_training_task(task_data)

    async def _start_training_task(self):
        """启动训练任务"""
        if self.running_training_task is None and self.training_task_queue:
            self.running_training_task = self.training_task_queue.popleft()
            
            print(f"[Scheduler] Starting training for task: {self.running_training_task.task_id}")
            
            trainer_options = {"num_gpus": self.num_gpus_per_trainer}
            print(f"[Scheduler] Trainer options: {trainer_options}")
            
            self.trainer_actor = TrainerActor.options(**trainer_options).remote(self.running_training_task)
            
            total_steps = self.running_training_task.config.get('steps', 10)
            start_step = self.running_training_task.current_step
            end_step = min(start_step + self.steps_per_timeslice, total_steps)
            
            await send_status_message(task_id=int(self.running_training_task.task_id), status="running")
            
            try:
                final_step = await self.trainer_actor.train.remote(start_step, end_step)
                self.running_training_task.current_step = final_step
                
                if final_step >= total_steps:
                    await send_status_message(task_id=int(self.running_training_task.task_id), status="completed")
                else:
                    self.training_task_queue.append(self.running_training_task)
            except Exception as e:
                print(f"❌ [Scheduler] Training failed for task {self.running_training_task.task_id}: {e}")
                await send_status_message(task_id=int(self.running_training_task.task_id), status="failed")
            finally:
                if self.trainer_actor: 
                    ray.kill(self.trainer_actor)
                self.trainer_actor, self.running_training_task = None, None

    async def _start_evaluation_task(self):
        """启动评估任务"""
        if self.running_evaluation_task is None and self.evaluation_task_queue:
            self.running_evaluation_task = self.evaluation_task_queue.popleft()
            
            print(f"[Scheduler] Starting evaluation for task: {self.running_evaluation_task.eval_task_id}")
            
            # 修复：评估任务也需要GPU来运行模型推理
            evaluator_options = {"num_gpus": 1, "num_cpus": 2}  # 评估任务使用GPU
            print(f"[Scheduler] Evaluator options: {evaluator_options}")
            
            self.evaluator_actor = EvaluatorActor.options(**evaluator_options).remote(self.running_evaluation_task)
            
            await send_status_message(task_id=int(self.running_evaluation_task.eval_task_id), status="running")
            
            try:
                results = await self.evaluator_actor.evaluate.remote()
                print(f"✅ [Scheduler] Evaluation completed for task {self.running_evaluation_task.eval_task_id}")
                await send_status_message(task_id=int(self.running_evaluation_task.eval_task_id), status="completed")
            except Exception as e:
                print(f"❌ [Scheduler] Evaluation failed for task {self.running_evaluation_task.eval_task_id}: {e}")
                await send_status_message(task_id=int(self.running_evaluation_task.eval_task_id), status="failed")
            finally:
                if self.evaluator_actor: 
                    ray.kill(self.evaluator_actor)
                self.evaluator_actor, self.running_evaluation_task = None, None

    async def run(self):
        """主调度循环，同时处理训练和评估任务"""
        print("[Scheduler] Main loop started.")
        while True:
            # 并行启动训练和评估任务
            training_task = asyncio.create_task(self._start_training_task())
            evaluation_task = asyncio.create_task(self._start_evaluation_task())
            
            # 等待两个任务完成（如果它们被启动的话）
            await asyncio.gather(training_task, evaluation_task, return_exceptions=True)
            
            # 短暂休眠避免过度占用 CPU
            await asyncio.sleep(1)


@ray.remote
class TrainingScheduler:
    """专门用于训练任务的调度器"""
    
    def __init__(self):
        # 获取集群资源
        cluster_resources = ray.cluster_resources()
        self.num_gpus = cluster_resources.get("GPU", 0)
        print(f"[TrainingScheduler] Number of GPUs: {self.num_gpus}")
        
        self.task_queue: Deque[TrainingTask] = deque()
        self.running_task: Optional[TrainingTask] = None
        self.trainer_actor: Optional["ray.actor.ActorHandle"] = None
        
        self.steps_per_timeslice = settings.SCHEDULER_STEPS_PER_TIMESLICE
        self.num_gpus_per_trainer = settings.SCHEDULER_GPUS_PER_TRAINER
        
        # Actor 启动时，调用一次 init_rabbitmq 来确保连接
        asyncio.create_task(init_rabbitmq())
        
        print("[TrainingScheduler] Actor initialized.")

    async def add_task(self, task_data: dict):
        task = TrainingTask(**task_data)
        self.task_queue.append(task)
        print(f"[TrainingScheduler] Task {task.task_id} added to queue.")

    async def run(self):
        print("[TrainingScheduler] Main loop started.")
        while True:
            if self.running_task is None and self.task_queue:
                self.running_task = self.task_queue.popleft()
                
                print(f"[TrainingScheduler] Starting training for task: {self.running_task.task_id}")
                
                trainer_options = {"num_gpus": self.num_gpus_per_trainer}
                print(f"[TrainingScheduler] Trainer options: {trainer_options}")
                
                self.trainer_actor = TrainerActor.options(**trainer_options).remote(self.running_task)
                
                total_steps = self.running_task.config.get('steps', 10)
                start_step = self.running_task.current_step
                end_step = min(start_step + self.steps_per_timeslice, total_steps)
                
                await send_status_message(task_id=int(self.running_task.task_id), status="running")
                
                try:
                    final_step = await self.trainer_actor.train.remote(start_step, end_step)
                    self.running_task.current_step = final_step
                    
                    if final_step >= total_steps:
                        await send_status_message(task_id=int(self.running_task.task_id), status="completed")
                    else:
                        self.task_queue.append(self.running_task)
                except Exception as e:
                    print(f"❌ [TrainingScheduler] Training failed for task {self.running_task.task_id}: {e}")
                    await send_status_message(task_id=int(self.running_task.task_id), status="failed")
                finally:
                    if self.trainer_actor: ray.kill(self.trainer_actor)
                    self.trainer_actor, self.running_task = None, None
            
            await asyncio.sleep(1)


@ray.remote
class EvaluationScheduler:
    """专门用于评估任务的调度器"""
    
    def __init__(self):
        print(f"[EvaluationScheduler] Initializing evaluation scheduler...")
        
        self.task_queue: Deque[EvaluationTask] = deque()
        self.running_task: Optional[EvaluationTask] = None
        self.evaluator_actor: Optional["ray.actor.ActorHandle"] = None
        
        # Actor 启动时，调用一次 init_rabbitmq 来确保连接
        asyncio.create_task(init_rabbitmq())
        
        print("[EvaluationScheduler] Actor initialized.")

    async def add_task(self, task_data: dict):
        task = EvaluationTask(**task_data)
        self.task_queue.append(task)
        print(f"[EvaluationScheduler] Task {task.eval_task_id} added to queue.")

    async def run(self):
        print("[EvaluationScheduler] Main loop started.")
        while True:
            if self.running_task is None and self.task_queue:
                self.running_task = self.task_queue.popleft()
                
                print(f"[EvaluationScheduler] Starting evaluation for task: {self.running_task.eval_task_id}")
                
                evaluator_options = {"num_gpus": 1}
                print(f"[EvaluationScheduler] Evaluator options: {evaluator_options}")
                
                self.evaluator_actor = EvaluatorActor.options(**evaluator_options).remote(self.running_task)
                
                await send_status_message(task_id=int(self.running_task.eval_task_id), status="running")
                
                try:
                    results = await self.evaluator_actor.evaluate.remote()
                    print(f"✅ [EvaluationScheduler] Evaluation completed for task {self.running_task.eval_task_id}")
                    await send_status_message(task_id=int(self.running_task.eval_task_id), status="completed")
                except Exception as e:
                    print(f"❌ [EvaluationScheduler] Evaluation failed for task {self.running_task.eval_task_id}: {e}")
                    await send_status_message(task_id=int(self.running_task.eval_task_id), status="failed")
                finally:
                    if self.evaluator_actor: 
                        ray.kill(self.evaluator_actor)
                    self.evaluator_actor, self.running_task = None, None
            
            await asyncio.sleep(1)