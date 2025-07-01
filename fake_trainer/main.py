from rabbitmq_utils import init_rabbitmq, start_task_queue_consumer
from minio_utils import get_minio_client, connect_minio
import asyncio
import signal
async def main():
    shutdown_event = asyncio.Future()
    await init_rabbitmq()
    await connect_minio()
    print("RabbitMQ 和 MinIO 已初始化。", flush=True)
    
    await start_task_queue_consumer()
    print("消费者已启动。", flush=True)

    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGINT, lambda: shutdown_event.set_result(True))
    loop.add_signal_handler(signal.SIGTERM, lambda: shutdown_event.set_result(True))

    try:
        await shutdown_event
    except asyncio.CancelledError:
        print("任务被取消，正在清理资源...")
    except Exception as e:
        print(f"发生错误: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("程序被中断，正在关闭...")
    except Exception as e:
        print(f"发生错误: {e}")
    finally:
        print("程序已退出。")