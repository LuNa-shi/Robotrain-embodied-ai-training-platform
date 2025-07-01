from rabbitmq_utils import init_rabbitmq, start_task_queue_consumer
import asyncio

async def main():
    # 初始化 RabbitMQ 连接和通道
    await init_rabbitmq()
    
    # 启动任务队列消费者
    await start_task_queue_consumer()

    # 保持事件循环运行
    while True:
        await asyncio.sleep(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("程序被中断，正在关闭...")
    except Exception as e:
        print(f"发生错误: {e}")
    finally:
        print("程序已退出。")