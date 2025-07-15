import ray
import asyncio
import signal
import json
import aio_pika
from typing import Optional

from training_platform.configs.settings import settings
from training_platform.common.rabbitmq_utils import (
    init_rabbitmq, 
    close_rabbitmq, 
    start_task_queue_consumer,
    start_eval_queue_consumer,
    start_eval_status_queue_consumer
)
from training_platform.common.task_models import TrainingTask, EvaluationTask
from training_platform.scheduler.scheduler_actor import Scheduler, TrainingScheduler, EvaluationScheduler
from training_platform.evaluator.lerobot_evaluate_actor import run_evaluation_actor

# 全局句柄
scheduler_actor_handle: Optional["ray.actor.ActorHandle"] = None
training_scheduler_handle: Optional["ray.actor.ActorHandle"] = None
evaluation_scheduler_handle: Optional["ray.actor.ActorHandle"] = None

# 全局任务句柄用于清理
train_consumer_task: Optional[asyncio.Task] = None
eval_consumer_task: Optional[asyncio.Task] = None 
eval_status_consumer_task: Optional[asyncio.Task] = None

async def on_task_message(message: aio_pika.IncomingMessage):
    """处理训练任务消息的回调函数"""
    async with message.process():
        global training_scheduler_handle
        
        try:
            task_data = json.loads(message.body.decode('utf-8'))
            
            print(f"🔍 [Training Consumer] Processing training task: {task_data}")  
            
            # 使用训练调度器处理
            if training_scheduler_handle:
                await training_scheduler_handle.add_task.remote(task_data)
                print(f"✅ [Training Consumer] Training task sent to scheduler: {task_data.get('task_id')}")
            else:
                print("❌ [Training Consumer] Training scheduler not available")
                    
        except Exception as e:
            print(f"❌ [Training Consumer] Error processing training message: {e}")

async def on_eval_message(message: aio_pika.IncomingMessage):
    """处理评估任务消息的回调函数"""
    async with message.process():
        global evaluation_scheduler_handle
        
        try:
            task_data = json.loads(message.body.decode('utf-8'))
            
            print(f"🔍 [Eval Consumer] Processing evaluation task: {task_data}")
            
            # 使用评估调度器处理
            if evaluation_scheduler_handle:
                await evaluation_scheduler_handle.add_task.remote(task_data)
                print(f"✅ [Eval Consumer] Evaluation task sent to scheduler: {task_data.get('task_id')}")
            else:
                print("❌ [Eval Consumer] Evaluation scheduler not available")
                    
        except Exception as e:
            print(f"❌ [Eval Consumer] Error processing evaluation message: {e}")

async def on_eval_status_message(message: aio_pika.IncomingMessage):
    """处理评估状态队列消息的回调函数"""
    async with message.process():
        try:
            status_data = json.loads(message.body.decode('utf-8'))
            print(f"📊 [Eval Status Consumer] Received status update: {status_data}")
            
            # 这里可以添加状态处理逻辑
            # 例如：更新数据库、发送WebSocket通知等
            
        except Exception as e:
            print(f"❌ [Eval Status Consumer] Error processing status message: {e}")

async def start_unified_scheduler():
    """启动统一调度器（同时处理训练和评估）"""
    global scheduler_actor_handle
    scheduler_actor_handle = Scheduler.options(name="SchedulerActor", lifetime="detached").remote()
    print("✅ Unified Scheduler Actor is starting...")
    scheduler_actor_handle.run.remote()

async def start_separate_schedulers():
    """启动分离的调度器（训练和评估分别处理）"""
    global training_scheduler_handle, evaluation_scheduler_handle
    
    # 启动训练调度器
    training_scheduler_handle = TrainingScheduler.options(name="TrainingScheduler", lifetime="detached").remote()
    print("✅ Training Scheduler Actor is starting...")
    training_scheduler_handle.run.remote()
    
    # 启动评估调度器
    evaluation_scheduler_handle = EvaluationScheduler.options(name="EvaluationScheduler", lifetime="detached").remote()
    print("✅ Evaluation Scheduler Actor is starting...")
    evaluation_scheduler_handle.run.remote()

async def main():
    global train_consumer_task, eval_consumer_task, eval_status_consumer_task
    
    if not ray.is_initialized(): ray.init()
    print("✅ Ray is initialized.")
    
    # 使用分离的调度器模式
    scheduler_mode = "separate"  # 使用分离的调度器
    
    if scheduler_mode == "unified":
        await start_unified_scheduler()
    else:
        await start_separate_schedulers()

    # 启动训练队列消费者
    train_consumer_task = asyncio.create_task(
        start_task_queue_consumer(on_task_message)
    )
    
    # 启动评估队列消费者
    eval_consumer_task = asyncio.create_task(
        start_eval_queue_consumer(on_eval_message)
    )
    
    # 启动评估状态队列消费者
    eval_status_consumer_task = asyncio.create_task(
        start_eval_status_queue_consumer(on_eval_status_message)
    )
    
    print("🚀 Training Platform is running with separate schedulers.")
    print("   - Training tasks → TrainingScheduler")
    print("   - Evaluation tasks → EvaluationScheduler")
    print("   Press Ctrl+C to exit.")

    shutdown_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, shutdown_event.set)
    await shutdown_event.wait()

async def shutdown():
    """优雅地关闭平台，确保所有ray资源被正确释放"""
    global scheduler_actor_handle, training_scheduler_handle, evaluation_scheduler_handle
    global train_consumer_task, eval_consumer_task, eval_status_consumer_task
    
    print("\nShutting down platform...")
    
    try:
        # 1. 首先取消所有消费者任务
        print("📋 Cancelling consumer tasks...")
        tasks_to_cancel = [task for task in [train_consumer_task, eval_consumer_task, eval_status_consumer_task] if task and not task.done()]
        if tasks_to_cancel:
            for task in tasks_to_cancel:
                task.cancel()
            try:
                await asyncio.wait_for(asyncio.gather(*tasks_to_cancel, return_exceptions=True), timeout=5.0)
                print("✅ Consumer tasks cancelled successfully")
            except asyncio.TimeoutError:
                print("⚠️  Consumer tasks cancellation timed out")
        
        # 2. 清理Ray scheduler actors
        print("🔄 Cleaning up Ray scheduler actors...")
        
        # 首先调用优雅关闭方法
        shutdown_tasks = []
        if scheduler_actor_handle:
            shutdown_tasks.append(("UnifiedScheduler", scheduler_actor_handle.shutdown.remote()))
        if training_scheduler_handle:
            shutdown_tasks.append(("TrainingScheduler", training_scheduler_handle.shutdown.remote()))
        if evaluation_scheduler_handle:
            shutdown_tasks.append(("EvaluationScheduler", evaluation_scheduler_handle.shutdown.remote()))
        
        if shutdown_tasks:
            try:
                # 等待所有调度器完成优雅关闭，最多等待5秒
                for actor_name, shutdown_task in shutdown_tasks:
                    try:
                        await asyncio.wait_for(shutdown_task, timeout=3.0)
                        print(f"✅ {actor_name} shutdown gracefully")
                    except asyncio.TimeoutError:
                        print(f"⚠️  {actor_name} shutdown timed out")
                    except Exception as e:
                        print(f"⚠️  {actor_name} shutdown failed: {e}")
            except Exception as e:
                print(f"⚠️  Error during graceful shutdown: {e}")
        
        # 然后强制杀死所有actors
        actors_to_kill = []
        if scheduler_actor_handle:
            actors_to_kill.append(("UnifiedScheduler", scheduler_actor_handle))
        if training_scheduler_handle:
            actors_to_kill.append(("TrainingScheduler", training_scheduler_handle))
        if evaluation_scheduler_handle:
            actors_to_kill.append(("EvaluationScheduler", evaluation_scheduler_handle))
        
        if actors_to_kill:
            for actor_name, actor_handle in actors_to_kill:
                try:
                    ray.kill(actor_handle)
                    print(f"✅ Killed {actor_name} actor")
                except Exception as e:
                    print(f"⚠️  Failed to kill {actor_name} actor: {e}")
        
        # 3. 关闭RabbitMQ连接
        print("🐰 Closing RabbitMQ connections...")
        await close_rabbitmq()
        
        # 4. 关闭Ray
        print("🔄 Shutting down Ray...")
        if ray.is_initialized(): 
            ray.shutdown()
            print("✅ Ray shutdown completed")
        
        print("👋 Platform has been shut down gracefully.")
        
    except Exception as e:
        print(f"❌ Error during shutdown: {e}")
        # 强制关闭Ray以确保资源释放
        if ray.is_initialized():
            try:
                ray.shutdown()
                print("🔄 Force shutdown Ray completed")
            except Exception as ray_e:
                print(f"❌ Error during force Ray shutdown: {ray_e}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        # 在主程序最终退出时，调用我们优雅的 shutdown 函数
        asyncio.run(shutdown())