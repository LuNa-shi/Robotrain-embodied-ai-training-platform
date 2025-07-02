import asyncio
import aio_pika
from aio_pika.connection import Connection
from aio_pika.channel import Channel
from aio_pika.exchange import ExchangeType, Exchange
from typing import Optional
from app.core.config import settings
import json
from uuid import uuid4
from app.core.websocket_utils import send_log_to_websockets
rabbit_connection: Optional[Connection] = None
rabbit_channel: Optional[Channel] = None
rabbit_exchange: Optional[Exchange] = None
request_queue: Optional[aio_pika.Queue] = None
status_queue: Optional[aio_pika.Queue] = None
log_queue: Optional[aio_pika.Queue] = None


async def send_task_message(task_id: int, user_id: int, model_type: str, dataset_uuid: str, config: dict):
    global rabbit_channel, rabbit_exchange, request_queue
    if rabbit_channel is None:
        print("RabbitMQ 通道未就绪，请先调用 init_rabbitmq() 方法。")
        return
    if rabbit_exchange is None:
        print("RabbitMQ 交换机未就绪，请先调用 init_rabbitmq() 方法。")
        return
    if request_queue is None:
        print("RabbitMQ 请求队列未就绪，请先调用 init_rabbitmq() 方法。")
        return
    try:
        # 创建一个新的消息
        message_body = json.dumps({
            "task_id": task_id,
            "user_id": user_id,
            "model_type": model_type,
            "dataset_uuid": dataset_uuid,
            "config": config
        }).encode('utf-8')  # 将字典转换为 JSON 字符串并编码为字节
        rabbit_message = aio_pika.Message(body=message_body)

        # 发送消息到指定的交换机和路由键
        await rabbit_exchange.publish(
            rabbit_message,
            routing_key=settings.RABBIT_REQUEST_BINDING_KEY
        )
        print(f"已发送任务消息: task_id = {task_id}, user_id = {user_id}, model_type = {model_type}, dataset_uuid = {dataset_uuid}")
    except Exception as e:
        print(f"发送任务消息失败: {e}")

# 获取 RabbitMQ 交换机实例的协程函数
async def get_rabbit_exchange() -> Optional[Exchange]:
    """提供已创建的 RabbitMQ 交换机实例"""
    global rabbit_exchange
    if rabbit_exchange is None:
        print("RabbitMQ 交换机未初始化，请先调用 init_rabbitmq() 方法。")
        return None
    return rabbit_exchange

# --- 新增的状态队列监听回调函数 ---
async def on_status_message(message: aio_pika.IncomingMessage):
    """
    状态消息处理回调函数。
    """
    from app.service.train_task import TrainTaskService
    from app.schemas.train_task import TrainTaskUpdate
    from app.core.deps import get_db
    # db = await get_db()  # 获取数据库会话
    async for session in get_db():
        TrainTaskService = TrainTaskService(db_session=session)  # 确保 TrainTaskService 已经正确导入和初始化
        try:
            # 打印接收到的消息内容
            print(f"[Status Consumer] Received message: {message.body.decode()} (Delivery Tag: {message.delivery_tag})")

            # 在这里添加处理状态消息的逻辑
            # 例如，解析消息内容并更新训练任务状态
            # 假设消息内容是 JSON 格式的字符串
            message_content = message.body.decode()
            # 这里可以根据实际消息格式进行解析和处理
            # 例如，如果消息是 JSON 格式，可以使用 json.loads() 解析
            status_data = json.loads(message_content)
            if not isinstance(status_data, dict):
                print(f"[Status Consumer] Received invalid message format: {message_content}")
                return
            # 假设 status_data 包含任务 ID 和状态信息
            task_id = status_data.get("task_id")
            status = status_data.get("status")
            if status == "completed":
                model_uuid_str = status_data.get("model_uuid")
                # 调用 TrainTaskService 更新任务状态
                train_task_to_update: TrainTaskUpdate = TrainTaskUpdate(
                    status=status,
                    model_uuid=model_uuid_str,
                    log_uuid=uuid4() #之后应该从数据库中提取出所有的日志 UUID
                )
                await TrainTaskService.update_train_task(task_id, train_task_to_update)
                print(f"[Status Consumer] Task {task_id} status updated to '{status}' with model UUID '{model_uuid_str}'.")
            else:
                # 如果状态不是 "completed"，可以根据需要进行其他处理
                train_task_to_update: TrainTaskUpdate = TrainTaskUpdate(
                    status=status
                )
                await TrainTaskService.update_train_task(task_id, train_task_to_update)
                print(f"[Status Consumer] Task {task_id} status updated to '{status}'.")

            # 确认消息已被处理
            await message.ack()
            print(f"[Status Consumer] Message '{message.body.decode()}' processed and acknowledged.")

        except Exception as e:
            print(f"[Status Consumer] Error processing message '{message.body.decode()}': {e}")
            # 如果处理失败，将消息 NACK 并不重新入队，通常会进入死信队列
            await message.nack(requeue=False)

async def on_train_log_message(message: aio_pika.IncomingMessage):
    """
    训练日志消息处理回调函数。
    """
    from app.core.websocket_utils import send_log_to_websockets
    try:
        # 打印接收到的消息内容
        print(f"[Train Log Consumer] Received message: {message.body.decode()}", flush=True)

        # 在这里添加处理训练日志消息的逻辑
        # 例如，解析消息内容并发送到 WebSocket 客户端
        log_message = message.body.decode()
        
        # 假设消息内容是 JSON 格式的字符串
        log_data = json.loads(log_message)
        if not isinstance(log_data, dict):
            print(f"[Train Log Consumer] Received invalid message format: {log_message}", flush=True)
            return
        task_id = log_data.get("task_id")
        log_content = log_data.get("log_message")
        # 记得还有 epoch, loss, accuracy 等字段，之后要加上
        epoch = log_data.get("epoch", 0)
        loss = log_data.get("loss", 0.0)
        accuracy = log_data.get("accuracy", 0.0)

        # 发送日志到 WebSocket 客户端
        await send_log_to_websockets(task_id, log_content)

        # 确认消息已被处理
        await message.ack()
        print(f"[Train Log Consumer] Message '{message.body.decode()}' processed and acknowledged.", flush=True)
    except Exception as e:
        print(f"[Train Log Consumer] Error processing message '{message.body.decode()}': {e}", flush=True)
        # 如果处理失败，将消息 NACK 并不重新入队，通常会进入死信队列
        await message.nack(requeue=False)

async def start_train_log_queue_consumer():
    """
    创建并启动监听训练日志队列的消费者。
    """
    global rabbit_channel, rabbit_exchange, log_queue

    # 确保 RabbitMQ 已经初始化
    if rabbit_channel is None or rabbit_channel.is_closed or log_queue is None:
        print("RabbitMQ 连接或请求队列未就绪，请先调用 init_rabbitmq() 方法。")
        return

    try:
        # 注册消息处理回调函数
        # no_ack=False 表示手动确认消息，确保消息可靠性
        print(f"[Train Log Consumer] Starting to consume messages from queue '{request_queue.name}'.")
        await log_queue.consume(on_train_log_message, no_ack=False)

        # 消费者协程会持续运行，直到通道关闭或被取消
        # 这里不需要 asyncio.Future()，因为 consume() 会保持协程运行
        # 如果这个函数是作为主应用的一部分，它会一直监听
        # 如果是独立的协程，需要确保事件循环不会立即退出
        print(f"[Train Log Consumer] Consumer for '{log_queue.name}' started. Waiting for messages...")

    except Exception as e:
        print(f"[Train Log Consumer] Error starting consumer: {e}")

# --- 新增的创建监听 status_queue 的协程函数 ---
async def start_status_queue_consumer():
    """
    创建并启动监听 status_queue 的消费者。
    """
    global rabbit_channel, status_queue

    # 确保 RabbitMQ 已经初始化
    if rabbit_channel is None or rabbit_channel.is_closed or status_queue is None:
        print("RabbitMQ 连接或状态队列未就绪，请先调用 init_rabbitmq() 方法。")
        return

    try:
        # 注册消息处理回调函数
        # no_ack=False 表示手动确认消息，确保消息可靠性
        print(f"[Status Consumer] Starting to consume messages from queue '{status_queue.name}'.")
        await status_queue.consume(on_status_message, no_ack=False)

        # 消费者协程会持续运行，直到通道关闭或被取消
        # 这里不需要 asyncio.Future()，因为 consume() 会保持协程运行
        # 如果这个函数是作为主应用的一部分，它会一直监听
        # 如果是独立的协程，需要确保事件循环不会立即退出
        print(f"[Status Consumer] Consumer for '{status_queue.name}' started. Waiting for messages...")

    except Exception as e:
        print(f"[Status Consumer] Error starting consumer: {e}")

async def init_rabbitmq():
    global rabbit_connection, rabbit_channel, rabbit_exchange, request_queue, status_queue, log_queue
    if rabbit_connection is not None:
        print("RabbitMQ 连接已存在")
    else:
        print("RabbitMQ 连接不存在，正在创建新的连接。") 
        rabbit_channel = None
        rabbit_exchange = None
        while rabbit_connection is None:
            print(f"正在连接 RabbitMQ 服务器: {settings.RABBITMQ_URL} ...")
            try:
                rabbit_connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
            except aio_pika.exceptions.AMQPConnectionError as e:
                sleep_time = 5  # 每次尝试连接失败后等待的时间
                print(f"连接 RabbitMQ 失败，{sleep_time} 秒后重试...")
                await asyncio.sleep(sleep_time)
        print("成功连接到 RabbitMQ 服务器！")
        
    if rabbit_channel is not None:
        print("RabbitMQ 通道已存在")
    else:
        print("RabbitMQ 通道不存在，正在创建新的通道。")
        rabbit_channel = await rabbit_connection.channel()
        
    if rabbit_exchange is not None:
        print("RabbitMQ 交换机已存在")
    else:
        print("RabbitMQ 交换机不存在，正在创建新的交换机。")
        rabbit_exchange = await rabbit_channel.declare_exchange(
            settings.RABBIT_EXCHANGE_NAME,
            ExchangeType.DIRECT,
            durable=True
        )
    
    if request_queue is not None:
        print("RabbitMQ 请求队列已存在")
    else:
        print("RabbitMQ 正在声明请求队列。")
        try:
            request_queue = await rabbit_channel.declare_queue(
                settings.RABBIT_REQUEST_QUEUE_NAME,
                durable=True,
                auto_delete=False,
                exclusive=False
            )
            print("声明成功")
        except Exception as e:
            print(f"声明请求队列失败: {e}")
            return
    try: 
        print("正在绑定请求队列到交换机。")
        await request_queue.bind(
            rabbit_exchange,
            routing_key=settings.RABBIT_REQUEST_BINDING_KEY
        )
        print("绑定成功")
    except Exception as e:
        print(f"绑定请求队列到交换机失败: {e}")
        return
    
    # 声明状态队列
    if status_queue is not None:
        print("RabbitMQ 状态队列已存在")
    else:
        print("RabbitMQ 正在声明状态队列。")
        try:
            status_queue = await rabbit_channel.declare_queue(
                settings.RABBIT_STATUS_QUEUE_NAME,
                durable=True,
                auto_delete=False,
                exclusive=False
            )
            print("声明成功")
        except Exception as e:
            print(f"声明状态队列失败: {e}")
            return
    try:
        print("正在绑定状态队列到交换机。")
        await status_queue.bind(
            rabbit_exchange,
            routing_key=settings.RABBIT_STATUS_BINDING_KEY
        )
        print("绑定成功")
    except Exception as e:
        print(f"绑定状态队列到交换机失败: {e}")
        return
    
    # 声明log队列
    if log_queue is not None:
        print("RabbitMQ log队列已存在")
    else:
        print("RabbitMQ 正在声明log队列。")
        try:
            log_queue = await rabbit_channel.declare_queue(
                settings.RABBIT_TRAIN_LOG_QUEUE_NAME,
                durable=True,
                auto_delete=False,
                exclusive=False
            )
            print("声明成功")
        except Exception as e:
            print(f"声明log队列失败: {e}")
            return
    try:
        print("正在绑定log队列到交换机。")
        await log_queue.bind(
            rabbit_exchange,
            routing_key=settings.RABBIT_TRAIN_LOG_BINDING_KEY
        )
        print("绑定成功")
    except Exception as e:
        print(f"绑定log队列到交换机失败: {e}")
        return
    
async def close_rabbitmq():
    global rabbit_connection, rabbit_channel, rabbit_exchange, request_queue, status_queue
    if rabbit_connection is not None:
        print("正在关闭 RabbitMQ 连接...")
        await rabbit_connection.close()
        print("RabbitMQ 连接已关闭")
    else:
        print("RabbitMQ 连接不存在，无需关闭。")
    if rabbit_channel is not None:
        print("正在关闭 RabbitMQ 通道...")
        await rabbit_channel.close()
        print("RabbitMQ 通道已关闭")
    else:
        print("RabbitMQ 通道不存在，无需关闭。")