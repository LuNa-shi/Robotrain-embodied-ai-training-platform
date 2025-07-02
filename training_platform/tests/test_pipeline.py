import asyncio
import json
import aio_pika
import pika # 我们需要一个同步的 pika 来发送初始任务
import pytest

from training_platform.configs.settings import settings
from training_platform.tests.minio_data_prepare import setup_minio
from training_platform.tests.state_fixture import MultiTaskState

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
                        task_id = str(data.get("task_id"))
                        status = data.get("status")
                        # 使用 state_fixture 的方法来更新状态
                        state_fixture.update_status(task_id, status)
    except asyncio.CancelledError:
        print("[TEST LISTENER] Status listener was cancelled.")
    except Exception as e:
        print(f"[TEST LISTENER] Error: {e}")
    finally:
        if connection and not connection.is_closed:
            await connection.close()

# # --- 测试主体：使用 pytest 框架 ---
# @pytest.mark.asyncio
# async def test_full_pipeline():
#     """
#     一个完整的端到端集成测试。
#     """
#     # 1. 准备环境：清理并设置 MinIO
#     dataset_uuid = await setup_minio()
#     assert dataset_uuid is not None, "Failed to prepare MinIO environment."

#     # 2. 启动后台状态监听器
#     loop = asyncio.get_running_loop()
#     print("[TEST RUNNER] Starting status listener.")
#     listener_task = loop.create_task(status_listener(loop))
#     print("[TEST RUNNER] Status listener started.")
    
#     # 3. 发送一个测试任务
#     # 使用同步的 pika，因为它只是一个简单的触发动作
#     connection = pika.BlockingConnection(pika.ConnectionParameters(settings.RABBITMQ_SERVER))
#     channel = connection.channel()
#     task_message = {
#         "task_id": TEST_TASK_ID,
#         "user_id": "pytest_user",
#         "uuid": dataset_uuid,
#         "config": {"epochs": 3} # 一个快速完成的短任务
#     }
#     channel.basic_publish(
#         exchange=settings.RABBIT_EXCHANGE_NAME,
#         routing_key=settings.RABBIT_REQUEST_BINDING_KEY,
#         body=json.dumps(task_message)
#     )
#     connection.close()
#     print(f"[TEST RUNNER] Sent test task {TEST_TASK_ID} with UUID {dataset_uuid}.")

#     # 4. 等待并验证状态变化
#     expected_statuses = ["queued", "training", "completed"]
#     for expected_status in expected_statuses:
#         print(f"\n[TEST RUNNER] Waiting for status: '{expected_status}'...")
#         start_time = asyncio.get_event_loop().time()
#         while LATEST_STATUS != expected_status:
#             await asyncio.sleep(1)
#             if asyncio.get_event_loop().time() - start_time > TEST_TIMEOUT:
#                 pytest.fail(f"Timeout: Did not receive status '{expected_status}' within {TEST_TIMEOUT}s. Last status was '{LATEST_STATUS}'.")
#         print(f"✅ Verified status: '{LATEST_STATUS}'")
    
#     # 5. 清理
#     listener_task.cancel()
#     print("\n[TEST RUNNER] Test finished successfully!")

#     # 你还可以在这里添加检查 MinIO 是否有新模型上传的逻辑


@pytest.mark.asyncio
async def test_multi_task_scheduling():
    """
    测试调度器是否能正确地按 FIFO 和时间片轮转策略处理多个任务。
    """
    # 0. 定义测试任务
    TEST_TASK_IDS = ["201", "202", "203"]
    # 每个任务的配置，注意 epochs 要大于 scheduler 的 steps_per_timeslice
    # 假设 steps_per_timeslice 在 settings.py 中是 2
    TASK_CONFIG = {"epochs": 20} 
    TEST_TIMEOUT = 120 # 多任务测试需要更长的超时时间

    # 1. 准备环境
    dataset_uuids = {task_id: await setup_minio() for task_id in TEST_TASK_IDS}
    assert all(dataset_uuids.values()), "Failed to prepare MinIO environment."

    # 2. 初始化状态管理器并启动监听器
    state = MultiTaskState(TEST_TASK_IDS)
    listener_task = asyncio.create_task(status_listener(state))

    # 给监听器一点时间启动和绑定
    await asyncio.sleep(2) 

    # 3. 快速连续发送多个任务
    print("\n[TEST RUNNER] Sending multiple tasks concurrently...")
    connection = pika.BlockingConnection(pika.ConnectionParameters(settings.RABBITMQ_SERVER))
    channel = connection.channel()
    for task_id in TEST_TASK_IDS:
        task_message = {
            "task_id": task_id,
            "user_id": f"pytest_user_{task_id}",
            "uuid": dataset_uuids[task_id],
            "config": TASK_CONFIG
        }
        channel.basic_publish(
            exchange=settings.RABBIT_EXCHANGE_NAME,
            routing_key=settings.RABBIT_REQUEST_BINDING_KEY,
            body=json.dumps(task_message)
        )
        print(f"  -> Sent task {task_id}")
    connection.close()
    print("[TEST RUNNER] All tasks sent.")

    # 4. 验证调度流程
    print("\n[TEST RUNNER] Verifying scheduling sequence...")
    
    # 验证点 1: 所有任务都进入了 queued 状态
    await wait_for_condition(
        lambda: all(s == "queued" for s in state.task_statuses.values()),
        "all tasks to be 'queued'",
        timeout=TEST_TIMEOUT
    )
    assert state.task_statuses[TEST_TASK_IDS[0]] == "queued"
    assert state.task_statuses[TEST_TASK_IDS[1]] == "queued"
    assert state.task_statuses[TEST_TASK_IDS[2]] == "queued"
    print("✅ Verified: All tasks are queued.")

    # 验证点 2: 第一个任务开始训练
    await wait_for_condition(
        lambda: state.task_statuses[TEST_TASK_IDS[0]] == "training",
        "task 201 to be 'training'",
        timeout=TEST_TIMEOUT
    )
    assert state.task_statuses[TEST_TASK_IDS[1]] == "queued" # 其他任务仍在排队
    assert state.task_statuses[TEST_TASK_IDS[2]] == "queued"
    print("✅ Verified: Task 201 started training (FIFO).")

    # 验证点 3: 第一个任务暂停，第二个任务开始训练 (时间片轮转)
    await wait_for_condition(
        lambda: state.task_statuses[TEST_TASK_IDS[0]] == "paused" and \
                state.task_statuses[TEST_TASK_IDS[1]] == "training",
        "task 201 to be 'paused' and task 202 to be 'training'",
        timeout=TEST_TIMEOUT
    )
    assert state.task_statuses[TEST_TASK_IDS[2]] == "queued" # 第三个任务仍在排队
    print("✅ Verified: Task 201 paused, Task 202 started training (Time-slicing).")

    # 验证点 4: 验证完整的轮转 (2 -> paused, 3 -> training)
    await wait_for_condition(
        lambda: state.task_statuses[TEST_TASK_IDS[1]] == "paused" and \
                state.task_statuses[TEST_TASK_IDS[2]] == "training",
        "task 202 to be 'paused' and task 203 to be 'training'",
        timeout=TEST_TIMEOUT
    )
    print("✅ Verified: Task 202 paused, Task 203 started training.")

    # 验证点 5: 最终所有任务都完成
    print("\n[TEST RUNNER] Waiting for all tasks to complete...")
    try:
        await asyncio.wait_for(state.all_tasks_completed.wait(), timeout=TEST_TIMEOUT)
    except asyncio.TimeoutError:
        pytest.fail(f"Timeout: Not all tasks reached 'completed' state within {TEST_TIMEOUT}s. Final states: {state.task_statuses}")

    assert all(s == "completed" for s in state.task_statuses.values())
    print("✅ Verified: All tasks completed successfully!")

    # 5. 清理
    listener_task.cancel()
    print("\n[TEST RUNNER] Multi-task test finished successfully!")


# --- 辅助函数 ---
async def wait_for_condition(condition_func, description, timeout):
    """一个通用的等待函数，直到某个条件满足或超时。"""
    start_time = asyncio.get_event_loop().time()
    while not condition_func():
        await asyncio.sleep(0.5)
        if asyncio.get_event_loop().time() - start_time > timeout:
            pytest.fail(f"Timeout: Waiting for {description} took too long.")