import asyncio
import aio_pika
from aio_pika.connection import Connection
from aio_pika.channel import Channel
from aio_pika.exchange import ExchangeType, Exchange
from typing import Optional
import json
from settings import settings

rabbit_connection: Optional[Connection] = None
rabbit_channel: Optional[Channel] = None
rabbit_exchange: Optional[Exchange] = None
request_queue: Optional[aio_pika.Queue] = None
status_queue: Optional[aio_pika.Queue] = None
log_queue: Optional[aio_pika.Queue] = None


async def send_status_message(task_id: int, status: str, uuid: Optional[str] = None):
    """
    发送任务状态消息到 RabbitMQ 状态队列。
    :param task_id: 任务 ID
    :param status: 任务状态
    """
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
        # message_body = message.encode('utf-8')
        message_body = json.dumps({
            "task_id": task_id,
            "status": status,
            "uuid": uuid
        }).encode('utf-8')
        rabbit_message = aio_pika.Message(body=message_body)

        # 发送消息到指定的交换机和路由键
        await rabbit_exchange.publish(
            rabbit_message,
            routing_key=settings.RABBIT_STATUS_BINDING_KEY
        )
        print(f"已发送任务消息: {message_body.decode('utf-8')}")
    except Exception as e:
        print(f"发送任务消息失败: {e}")


async def send_log_message(epoch: int, loss: float, accuracy: float, log_message: str):
    """
    发送任务状态消息到 RabbitMQ 状态队列。
    :param task_id: 任务 ID
    :param status: 任务状态
    """
    global rabbit_channel, rabbit_exchange, request_queue, log_queue
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
        # message_body = message.encode('utf-8')
        message_body = json.dumps({
            "log_message": log_message,
            "epoch": epoch,
            "loss": loss,
            "accuracy": accuracy
        }).encode('utf-8')
        rabbit_message = aio_pika.Message(body=message_body)

        # 发送消息到指定的交换机和路由键
        await rabbit_exchange.publish(
            rabbit_message,
            routing_key=settings.RABBIT_TRAIN_LOG_BINDING_KEY
        )
        print(f"已发送任务消息: {message_body.decode('utf-8')}")
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
async def on_task_message(message: aio_pika.IncomingMessage):
    from train import fake_train
    try:
        async with message.process(requeue=True):  # 确保消息处理完成后确认
            # 解析消息内容
            message_body = message.body.decode('utf-8')
            task_data = json.loads(message_body)
            if not isinstance(task_data, dict):
                print(f"[Task Consumer] Received invalid message format: {message_body}")
                return
            task_id: int = task_data.get("task_id")
            dataset_uuid: str = task_data.get("dataset_uuid")
            model_type: str = task_data.get("model_type")
            hyperparam:  dict= task_data.get("hyperparam")
            if task_id is None or dataset_uuid is None or model_type is None or hyperparam is None:
                print(f"[Task Consumer] Received message with missing fields: {message_body}")
                return

            print(f"[Task Consumer] Received task ID: {task_id}")

            
            await fake_train(task_id, dataset_uuid, hyperparam)

            # 打印接收到的消息内容
        print(f"[Task Consumer] Received message: {message.body.decode('utf-8')}")

    except Exception as e:
        print(f"[Task Consumer] Error processing message: {e}")
        # 如果处理失败，将消息 NACK 并不重新入队，通常会进入死信队列
        await message.nack(requeue=False)

# --- 新增的创建监听 task_queue 的协程函数 ---
async def start_task_queue_consumer():
    """
    创建并启动监听 task_queue 的消费者。
    """
    global rabbit_channel, request_queue

    # 确保 RabbitMQ 已经初始化
    if rabbit_channel is None or rabbit_channel.is_closed or status_queue is None:
        print("RabbitMQ 连接或状态队列未就绪，请先调用 init_rabbitmq() 方法。")
        return

    try:
        # 注册消息处理回调函数
        # no_ack=False 表示手动确认消息，确保消息可靠性
        print(f"[Status Consumer] Starting to consume messages from queue '{request_queue.name}'.")
        await request_queue.consume(on_task_message, no_ack=False)

        # 消费者协程会持续运行，直到通道关闭或被取消
        # 这里不需要 asyncio.Future()，因为 consume() 会保持协程运行
        # 如果这个函数是作为主应用的一部分，它会一直监听
        # 如果是独立的协程，需要确保事件循环不会立即退出
        print(f"[Status Consumer] Consumer for '{request_queue.name}' started. Waiting for messages...")

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