import asyncio
from datetime import datetime, timezone
import aio_pika
from aio_pika.connection import Connection
from aio_pika.channel import Channel
from aio_pika.exchange import ExchangeType, Exchange
from typing import Optional
from app.core.config import settings
import json
from uuid import uuid4
from app.core.websocket_utils import send_log_to_websockets, send_eval_status_to_websockets
from app.core.deps import AsyncSessionLocal
rabbit_connection: Optional[Connection] = None
rabbit_channel: Optional[Channel] = None
rabbit_exchange: Optional[Exchange] = None
request_queue: Optional[aio_pika.Queue] = None
status_queue: Optional[aio_pika.Queue] = None
log_queue: Optional[aio_pika.Queue] = None
eval_queue: Optional[aio_pika.Queue] = None
eval_status_queue: Optional[aio_pika.Queue] = None

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
        
async def send_eval_task_message(eval_task_id: int, user_id: int, train_task_id: int, eval_stage: int):
    global rabbit_channel, rabbit_exchange, eval_queue
    if rabbit_channel is None:
        print("RabbitMQ 通道未就绪，请先调用 init_rabbitmq() 方法。")
        return
    if rabbit_exchange is None:
        print("RabbitMQ 交换机未就绪，请先调用 init_rabbitmq() 方法。")
        return
    if eval_queue is None:
        print("RabbitMQ 评估队列未就绪，请先调用 init_rabbitmq() 方法。")
        return
    try:
        # 创建一个新的消息
        message_body = json.dumps({
            "eval_task_id": eval_task_id,
            "user_id": user_id,
            "train_task_id": train_task_id,
            "eval_stage": eval_stage
        }).encode('utf-8')  # 将字典转换为 JSON 字符串并编码为字节
        rabbit_message = aio_pika.Message(body=message_body)

        # 发送消息到指定的交换机和路由键
        await rabbit_exchange.publish(
            rabbit_message,
            routing_key=settings.RABBIT_EVAL_BINDING_KEY
        )
        print(f"已发送评估任务消息: eval_task_id = {eval_task_id}, user_id = {user_id}, train_task_id = {train_task_id}, eval_stage = {eval_stage}")
    except Exception as e:
        print(f"发送评估任务消息失败: {e}")

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
    async for session in get_db():
        train_task_service = TrainTaskService(db_session=session)
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
            
            train_task_to_update: TrainTaskUpdate = TrainTaskUpdate(
                status=status
            )

            await train_task_service.update_train_task(task_id, train_task_to_update)
            await send_log_to_websockets(task_id, log_message=message_content)
            print(f"[Status Consumer] Task {task_id} status updated to '{status}'.")
            # 确认消息已被处理
            await message.ack()
            print(f"[Status Consumer] Message '{message.body.decode()}' processed and acknowledged.")
        except Exception as e:
            print(f"[Status Consumer] Error processing message '{message.body.decode()}': {e}")
            # 如果处理失败，将消息 NACK 并不重新入队，通常会进入死信队列
            await message.nack(requeue=False)

async def on_eval_status_message(message: aio_pika.IncomingMessage):
    """
    评估状态消息处理回调函数。
    """
    from app.service.eval_task import EvalTaskService
    from app.schemas.eval_task import EvalTaskUpdate
    from app.core.deps import get_db
    async for session in get_db():
        eval_task_service = EvalTaskService(db_session=session)
        try:
            # 打印接收到的消息内容
            print(f"[Eval Status Consumer] Received message: {message.body.decode()}", flush=True)
            # 在这里添加处理评估状态消息的逻辑
            # 例如，解析消息内容并更新评估任务状态
            eval_status_data = json.loads(message.body.decode())
            if not isinstance(eval_status_data, dict):
                print(f"[Eval Status Consumer] Received invalid message format: {message.body.decode()}", flush=True)
                return
            
            eval_task_id = eval_status_data.get("eval_task_id")
            status = eval_status_data.get("status")
            
            eval_task_to_update: EvalTaskUpdate = EvalTaskUpdate(
                status=status
            )
            old_eval_task = await eval_task_service.get_eval_task_by_id(eval_task_id)
            if status == "completed" or status == "failed": 
                eval_task_to_update.end_time = datetime.now(timezone.utc)
            if status == "running" and old_eval_task.status != "running":
                eval_task_to_update.start_time = datetime.now(timezone.utc)
                
            await eval_task_service.update_eval_task(eval_task_id, eval_task_to_update)
            # TODO:增加websocket与前端同步

            await send_eval_status_to_websockets(eval_task_id, message.body.decode())

            # 确认消息已被处理
            await message.ack()
            print(f"[Eval Status Consumer] Message '{message.body.decode()}' processed and acknowledged.", flush=True)
        except Exception as e:
            print(f"[Eval Status Consumer] Error processing message '{message.body.decode()}': {e}", flush=True)
            # 如果处理失败，将消息 NACK 并不重新入队，通常会进入死信队列
            await message.nack(requeue=False)

async def on_train_log_message(message: aio_pika.IncomingMessage):
    """
    训练日志消息处理回调函数。
    """
    from app.core.websocket_utils import send_log_to_websockets
    from app.core.deps import get_db
    from app.service.train_log import TrainLogService
    from app.service.user import UserService
    from app.service.train_task import TrainTaskService
    from app.schemas.train_log import TrainLogCreate
    async for session in get_db():
        train_log_service = TrainLogService(db_session=session)
        user_service = UserService(db_session=session)
        train_task_service = TrainTaskService(db_session=session)  # 确保 Train
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
            # 往log_data中添加一项status为null
            log_data["status"] = None  # 假设日志消息中没有状态信息
            # log_data转回字符串
            log_message_trans = json.dumps(log_data)

            # 发送日志到 WebSocket 客户端
            await send_log_to_websockets(task_id, log_message=log_message_trans)

        
            train_task = await train_task_service.get_train_task_by_id(task_id)
            if not train_task:
                print(f"[Train Log Consumer] Task with ID {task_id} not found. Cannot create log.")
                return
            task_user = await user_service.get_user_by_id(train_task.owner_id)
            if not task_user:
                print(f"[Train Log Consumer] User with ID {train_task.owner_id} not found. Cannot create log.")
                return
            train_log_to_create = TrainLogCreate(
                train_task_id=task_id,
                log_message=log_message,
            )

            await train_log_service.create_train_log_for_task(
                user=task_user,
                train_log_create=train_log_to_create
            )

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

async def start_eval_status_queue_consumer():
    """
    创建并启动监听评估状态队列的消费者。
    """
    global rabbit_channel, eval_status_queue

    # 确保 RabbitMQ 已经初始化
    if rabbit_channel is None or rabbit_channel.is_closed or eval_status_queue is None:
        print("RabbitMQ 连接或评估状态队列未就绪，请先调用 init_rabbitmq() 方法。")
        return

    try:
        # 注册消息处理回调函数
        # no_ack=False 表示手动确认消息，确保消息可靠性
        print(f"[Eval Status Consumer] Starting to consume messages from queue '{eval_status_queue.name}'.")
        await eval_status_queue.consume(on_eval_status_message, no_ack=False)

        # 消费者协程会持续运行，直到通道关闭或被取消
        # 这里不需要 asyncio.Future()，因为 consume() 会保持协程运行
        # 如果这个函数是作为主应用的一部分，它会一直监听
        # 如果是独立的协程，需要确保事件循环不会立即退出
        print(f"[Eval Status Consumer] Consumer for '{eval_status_queue.name}' started. Waiting for messages...")

    except Exception as e:
        print(f"[Eval Status Consumer] Error starting consumer: {e}")
        
        
async def init_rabbitmq():
    global rabbit_connection, rabbit_channel, rabbit_exchange, request_queue, status_queue, log_queue, eval_queue, eval_status_queue
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

    # 声明评估队列
    if eval_queue is not None:
        print("RabbitMQ 评估队列已存在")
    else:
        print("RabbitMQ 正在声明评估队列。")
        try:
            eval_queue = await rabbit_channel.declare_queue(
                settings.RABBIT_EVAL_QUEUE_NAME,
                durable=True,
                auto_delete=False,
                exclusive=False
            )
            print("声明成功")
        except Exception as e:
            print(f"声明评估队列失败: {e}")
            return
    try:
        print("正在绑定评估队列到交换机。")
        await eval_queue.bind(
            rabbit_exchange,
            routing_key=settings.RABBIT_EVAL_BINDING_KEY
        )
        print("绑定成功")
    except Exception as e:
        print(f"绑定评估队列到交换机失败: {e}")
        return
    
    if eval_status_queue is not None:
        print("RabbitMQ 评估状态队列已存在")
    else:
        print("RabbitMQ 正在声明评估状态队列。")
        try:
            eval_status_queue = await rabbit_channel.declare_queue(
                settings.RABBIT_EVAL_STATUS_QUEUE_NAME,
                durable=True,
                auto_delete=False,
                exclusive=False
            )
            print("声明成功")
        except Exception as e:
            print(f"声明评估状态队列失败: {e}")
            return
    try:
        print("正在绑定评估状态队列到交换机。")
        await eval_status_queue.bind(
            rabbit_exchange,
            routing_key=settings.RABBIT_EVAL_STATUS_BINDING_KEY
        )
        print("绑定成功")
    except Exception as e:
        print(f"绑定评估状态队列到交换机失败: {e}")
        return
    
    print("RabbitMQ 初始化完成，所有队列和交换机已就绪。")
    
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