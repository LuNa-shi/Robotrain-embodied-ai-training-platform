import ray
import asyncio
import signal
import json
import aio_pika
from typing import Optional

from training_platform.configs.settings import settings
from training_platform.common.rabbitmq_utils import init_rabbitmq, close_rabbitmq, start_task_queue_consumer
from training_platform.common.task_models import TrainingTask
from training_platform.scheduler.scheduler_actor import Scheduler

# 全局句柄
scheduler_actor_handle: Optional["ray.actor.ActorHandle"] = None

async def on_task_message(message: aio_pika.IncomingMessage):
    """消费者回调函数，解析消息并交给 Scheduler。"""
    async with message.process():
        global scheduler_actor_handle
        if not scheduler_actor_handle:
            scheduler_actor_handle = ray.get_actor("SchedulerActor")

        try:
            task_data = json.loads(message.body.decode('utf-8'))
            await scheduler_actor_handle.add_task.remote(task_data)
        except Exception as e:
            print(f"❌ [Consumer] Error processing message: {e}")

async def main():
    if not ray.is_initialized(): ray.init()
    print("✅ Ray is initialized.")
    
    global scheduler_actor_handle
    scheduler_actor_handle = Scheduler.options(name="SchedulerActor", lifetime="detached").remote()
    print("✅ Scheduler Actor is starting...")
    scheduler_actor_handle.run.remote()

    await start_task_queue_consumer(on_task_message)
    print("🚀 Training Platform is running. Press Ctrl+C to exit.")

    shutdown_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, shutdown_event.set)
    await shutdown_event.wait()

async def shutdown():
    print("\nShutting down platform...")
    await close_rabbitmq()
    if ray.is_initialized(): ray.shutdown()
    print("👋 Platform has been shut down gracefully.")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        # 在主程序最终退出时，调用我们优雅的 shutdown 函数
        asyncio.run(shutdown())