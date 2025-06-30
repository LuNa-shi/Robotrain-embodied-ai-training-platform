import time
import asyncio
async def fake_train():
    from rabbitmq_utils import send_status_message
    # 先睡个5秒，模拟排队等待训练
    await asyncio.sleep(5)
    # 加入训练任务，rabbitmq发送消息
    send_status_message("Training started")
    # 模拟训练过程,训练10秒，每隔一秒发送一次状态消息
    for i in range(10):
        await asyncio.sleep(1)
        # 发送训练状态消息
        send_status_message(f"Training in progress: {i + 1} seconds")
    # 训练完成
    send_status_message("Training completed")
    print("Training completed successfully.")
    