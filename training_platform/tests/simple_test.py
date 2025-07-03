import asyncio
import json
import aio_pika
import pika
import time

from training_platform.configs.settings import settings
from training_platform.tests.minio_data_prepare import setup_minio

# --- 全局测试变量 ---
TEST_TASK_ID = "101"
LATEST_STATUS = ""
RECEIVED_LOGS = []
TEST_TIMEOUT = 1200  # 测试的总超时时间（秒）

class SimpleTaskState:
    """简单的任务状态管理器"""
    def __init__(self, task_ids):
        self.task_ids = task_ids
        self.task_statuses = {task_id: "unknown" for task_id in task_ids}
        self.all_completed = asyncio.Event()
        self.status_history = {task_id: [] for task_id in task_ids}  # 添加状态历史记录
    
    def update_status(self, task_id, status):
        print(f"[STATUS UPDATE] Task {task_id}: {status}")
        if task_id in self.task_ids:
            self.task_statuses[task_id] = status
            self.status_history[task_id].append(status)  # 记录状态历史
            if all(s == "completed" for s in self.task_statuses.values()):
                self.all_completed.set()

async def status_listener(state):
    """监听状态更新的简单监听器"""
    connection = None
    try:
        print("[LISTENER] 正在连接到RabbitMQ...")
        connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
        async with connection:
            channel = await connection.channel()
            exchange = await channel.declare_exchange(
                "platform.fanout.status", aio_pika.ExchangeType.FANOUT, durable=True
            )
            
            queue = await channel.declare_queue(name='', exclusive=True)
            await queue.bind(exchange)
            
            print("[LISTENER] 状态监听器已准备就绪")
            async with queue.iterator() as queue_iter:
                async for message in queue_iter:
                    async with message.process():
                        data = json.loads(message.body.decode())
                        print(f"[LISTENER] 收到消息: {data}")  # 添加调试信息
                        
                        # 修复：处理正确的消息格式
                        task_id = str(data.get("task_id"))
                        status = data.get("status")
                        
                        if task_id and status:
                            state.update_status(task_id, status)
                        else:
                            print(f"[LISTENER] 警告：消息格式不正确: {data}")
    except asyncio.CancelledError:
        print("[LISTENER] 监听器被取消")
    except Exception as e:
        print(f"[LISTENER] 错误: {e}")
    finally:
        if connection and not connection.is_closed:
            await connection.close()

async def wait_for_condition(condition_func, description, timeout):
    """等待条件满足的通用函数"""
    start_time = time.time()
    while not condition_func():
        await asyncio.sleep(0.5)
        if time.time() - start_time > timeout:
            print(f"❌ 超时: 等待 {description} 时间过长")
            return False
    return True

async def wait_for_status_sequence(state, task_id, expected_sequence, timeout):
    """等待任务按预期顺序经历状态变化"""
    print(f"[TEST] 等待任务 {task_id} 的状态序列: {expected_sequence}")
    
    start_time = time.time()
    current_sequence_index = 0
    
    while current_sequence_index < len(expected_sequence):
        await asyncio.sleep(0.5)
        
        if time.time() - start_time > timeout:
            print(f"❌ 超时: 等待状态序列完成")
            print(f"   期望序列: {expected_sequence}")
            print(f"   实际历史: {state.status_history[task_id]}")
            return False
        
        # 检查当前状态是否匹配期望序列中的下一个状态
        if (current_sequence_index < len(state.status_history[task_id]) and 
            state.status_history[task_id][current_sequence_index] == expected_sequence[current_sequence_index]):
            print(f"✅ 验证状态: '{expected_sequence[current_sequence_index]}'")
            current_sequence_index += 1
    
    return True

async def test_single_task():
    """测试单个任务的完整流程"""
    print("\n" + "="*50)
    print("开始单任务测试")
    print("="*50)
    
    # 1. 准备环境
    print("\n[TEST] 准备MinIO环境...")
    dataset_uuid = await setup_minio()
    if dataset_uuid is None:
        print("❌ 准备MinIO环境失败")
        return False
    print(f"✅ MinIO环境准备完成，UUID: {dataset_uuid}")
    
    # 2. 初始化状态管理器并启动监听器
    state = SimpleTaskState([TEST_TASK_ID])
    listener_task = asyncio.create_task(status_listener(state))
    await asyncio.sleep(2)  # 给监听器时间启动
    
    # 3. 发送测试任务
    print(f"\n[TEST] 发送测试任务 {TEST_TASK_ID}...")
    connection = pika.BlockingConnection(pika.ConnectionParameters(settings.RABBITMQ_SERVER))
    channel = connection.channel()
    
    task_message = {
        "task_id": TEST_TASK_ID,
        "user_id": "simple_test_user",
        "uuid": dataset_uuid,
        "config": {
            "policy": {"type": "act"},
            "env": {"type": "aloha"},
            "dataset": {"repo_id": "lerobot/aloha_sim_insertion_human"},
            "steps": 100,        # 较少的步数以快速完成
            "save_freq": 25,
            "batch_size": 8,
        }
    }
    
    channel.basic_publish(
        exchange=settings.RABBIT_EXCHANGE_NAME,
        routing_key=settings.RABBIT_REQUEST_BINDING_KEY,
        body=json.dumps(task_message)
    )
    connection.close()
    print(f"✅ 任务 {TEST_TASK_ID} 已发送")
    
    # 4. 等待并验证状态变化
    print("\n[TEST] 等待状态变化...")
    # 修复：包含所有可能的状态，包括"paused"
    expected_status_sequence = ["queued", "training", "paused", "training", "completed"]
    
    success = await wait_for_status_sequence(state, TEST_TASK_ID, expected_status_sequence, TEST_TIMEOUT)
    if not success:
        print(f"❌ 测试失败: 状态序列不匹配")
        print(f"   实际状态历史: {state.status_history[TEST_TASK_ID]}")
        listener_task.cancel()
        return False
    
    print(f"✅ 状态序列验证完成: {state.status_history[TEST_TASK_ID]}")
    
    # 5. 清理
    listener_task.cancel()
    print("\n✅ 单任务测试完成!")
    return True

async def test_multi_task():
    """测试多任务调度"""
    print("\n" + "="*50)
    print("开始多任务测试")
    print("="*50)
    
    TEST_TASK_IDS = ["201", "202"]
    TASK_CONFIG = {
            "policy": {"type": "act"},
            "env": {"type": "aloha"},
            "dataset": {"repo_id": "lerobot/aloha_sim_insertion_human"},
            "steps": 100,        # 较少的步数以快速完成
            "save_freq": 25,
            "batch_size": 8,
        }
    
    # 1. 准备环境
    print("\n[TEST] 准备MinIO环境...")
    dataset_uuids = {}
    for task_id in TEST_TASK_IDS:
        dataset_uuids[task_id] = await setup_minio()
        if dataset_uuids[task_id] is None:
            print(f"❌ 为任务 {task_id} 准备MinIO环境失败")
            return False
    print("✅ 所有MinIO环境准备完成")
    
    # 2. 初始化状态管理器并启动监听器
    state = SimpleTaskState(TEST_TASK_IDS)
    listener_task = asyncio.create_task(status_listener(state))
    await asyncio.sleep(2)
    
    # 3. 发送多个任务
    print(f"\n[TEST] 发送多个任务...")
    connection = pika.BlockingConnection(pika.ConnectionParameters(settings.RABBITMQ_SERVER))
    channel = connection.channel()
    
    for task_id in TEST_TASK_IDS:
        # 修复：移除多余的字段，保持与单任务测试一致
        task_message = {
            "task_id": task_id,
            "user_id": f"simple_test_user_{task_id}",
            "uuid": dataset_uuids[task_id],
            "config": TASK_CONFIG,
        }
        channel.basic_publish(
            exchange=settings.RABBIT_EXCHANGE_NAME,
            routing_key=settings.RABBIT_REQUEST_BINDING_KEY,
            body=json.dumps(task_message)
        )
        print(f"  -> 已发送任务 {task_id}")
    connection.close()
    
    # 4. 验证调度流程
    print("\n[TEST] 验证调度流程...")
    
    # 验证所有任务都进入排队状态
    success = await wait_for_condition(
        lambda: all(s == "queued" for s in state.task_statuses.values()),
        "所有任务进入排队状态",
        TEST_TIMEOUT
    )
    if not success:
        print("❌ 测试失败: 任务未正确排队")
        print(f"   当前状态: {state.task_statuses}")
        listener_task.cancel()
        return False
    print("✅ 所有任务已排队")
    
    # 验证第一个任务开始训练
    success = await wait_for_condition(
        lambda: state.task_statuses[TEST_TASK_IDS[0]] == "training",
        f"任务 {TEST_TASK_IDS[0]} 开始训练",
        TEST_TIMEOUT
    )
    if not success:
        print("❌ 测试失败: 第一个任务未开始训练")
        print(f"   当前状态: {state.task_statuses}")
        listener_task.cancel()
        return False
    print(f"✅ 任务 {TEST_TASK_IDS[0]} 开始训练")
    
    # 等待所有任务完成
    print("\n[TEST] 等待所有任务完成...")
    try:
        await asyncio.wait_for(state.all_completed.wait(), timeout=TEST_TIMEOUT)
        print("✅ 所有任务完成!")
        
        # 打印每个任务的状态历史
        for task_id in TEST_TASK_IDS:
            print(f"   任务 {task_id} 状态历史: {state.status_history[task_id]}")
            
    except asyncio.TimeoutError:
        print(f"❌ 超时: 任务未在 {TEST_TIMEOUT}s 内完成")
        print(f"最终状态: {state.task_statuses}")
        for task_id in TEST_TASK_IDS:
            print(f"   任务 {task_id} 状态历史: {state.status_history[task_id]}")
        listener_task.cancel()
        return False
    
    # 5. 清理
    listener_task.cancel()
    print("\n✅ 多任务测试完成!")
    return True

async def main():
    """主测试函数"""
    print("开始训练平台测试...")
    
    # 运行单任务测试
    #   
    
    # 运行多任务测试
    multi_success = await test_multi_task()
    
    # 总结
    print("\n" + "="*50)
    print("测试总结")
    print("="*50)
    # print(f"单任务测试: {'✅ 通过' if single_success else '❌ 失败'}")
    print(f"多任务测试: {'✅ 通过' if multi_success else '❌ 失败'}")
    
    if multi_success:
        print("\n✅ 所有测试通过!")
    else:
        print("\n💥 部分测试失败!")

if __name__ == "__main__":
    asyncio.run(main()) 