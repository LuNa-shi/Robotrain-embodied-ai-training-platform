import asyncio
import json
import aio_pika
import pika # 我们需要一个同步的 pika 来发送初始任务
import pytest

from training_platform.configs.settings import settings
from training_platform.tests.minio_data_prepare import setup_minio


# --- 全局测试变量 ---
TEST_TASK_ID = "101"
LATEST_STATUS = ""
RECEIVED_LOGS = []
TEST_TIMEOUT = 60 # 测试的总超时时间（秒）

async def status_listener(state_fixture):
    """
    现在监听 Fanout 交换机，获取所有状态更新的广播。
    """
    connection = None
    try:
        connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
        async with connection:
            channel = await connection.channel()
            # 声明 Fanout 交换机（确保它存在）
            exchange = await channel.declare_exchange(
                "platform.fanout.status", aio_pika.ExchangeType.FANOUT, durable=True
            )
            
            # --- 关键修改：声明一个匿名的、排他的队列 ---
            # name='': RabbitMQ 会自动生成一个唯一的名字
            # exclusive=True: 当消费者断开连接时，这个队列会自动被删除
            queue = await channel.declare_queue(name='', exclusive=True)
            
            # 将这个临时队列绑定到 Fanout 交换机
            await queue.bind(exchange)
            
            print("[TEST LISTENER] Status listener is ready and bound to fanout exchange.")
            async with queue.iterator() as queue_iter:
                async for message in queue_iter:
                    async with message.process():
                        data = json.loads(message.body.decode())
                        # 确保 task_id 是字符串进行比较
                        if str(data.get("task_id")) == str(TEST_TASK_ID):
                            status = data.get("status")
                            print(f"[TEST LISTENER] <<< Received status: {status}")
                            state_fixture.latest_status = status
    except asyncio.CancelledError:
        print("[TEST LISTENER] Status listener was cancelled.")
    except Exception as e:
        print(f"[TEST LISTENER] Error: {e}")
    finally:
        if connection and not connection.is_closed:
            await connection.close()

# --- 测试主体：使用 pytest 框架 ---
@pytest.mark.asyncio
async def test_full_pipeline():
    """
    一个完整的端到端集成测试。
    """
    # 1. 准备环境：清理并设置 MinIO
    dataset_uuid = await setup_minio()
    assert dataset_uuid is not None, "Failed to prepare MinIO environment."

    # 2. 启动后台状态监听器
    loop = asyncio.get_running_loop()
    print("[TEST RUNNER] Starting status listener.")
    listener_task = loop.create_task(status_listener(loop))
    print("[TEST RUNNER] Status listener started.")
    
    # 3. 发送一个测试任务
    # 使用同步的 pika，因为它只是一个简单的触发动作
    connection = pika.BlockingConnection(pika.ConnectionParameters(settings.RABBITMQ_SERVER))
    channel = connection.channel()
    task_message = {
        "task_id": TEST_TASK_ID,
        "user_id": "pytest_user",
        "uuid": dataset_uuid,
        "config": {"epochs": 3} # 一个快速完成的短任务
    }
    channel.basic_publish(
        exchange=settings.RABBIT_EXCHANGE_NAME,
        routing_key=settings.RABBIT_REQUEST_BINDING_KEY,
        body=json.dumps(task_message)
    )
    connection.close()
    print(f"[TEST RUNNER] Sent test task {TEST_TASK_ID} with UUID {dataset_uuid}.")

    # 4. 等待并验证状态变化
    expected_statuses = ["queued", "training", "completed"]
    for expected_status in expected_statuses:
        print(f"\n[TEST RUNNER] Waiting for status: '{expected_status}'...")
        start_time = asyncio.get_event_loop().time()
        while LATEST_STATUS != expected_status:
            await asyncio.sleep(1)
            if asyncio.get_event_loop().time() - start_time > TEST_TIMEOUT:
                pytest.fail(f"Timeout: Did not receive status '{expected_status}' within {TEST_TIMEOUT}s. Last status was '{LATEST_STATUS}'.")
        print(f"✅ Verified status: '{LATEST_STATUS}'")
    
    # 5. 清理
    listener_task.cancel()
    print("\n[TEST RUNNER] Test finished successfully!")

    # 你还可以在这里添加检查 MinIO 是否有新模型上传的逻辑