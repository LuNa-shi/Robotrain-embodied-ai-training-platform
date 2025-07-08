import asyncio
import json
from typing import Optional, Callable
import aio_pika
from aio_pika.abc import AbstractRobustConnection, AbstractChannel, AbstractExchange, AbstractQueue

from training_platform.configs.settings import settings

class _RabbitMQManager:
    """
    一个内部单例类，用于管理 RabbitMQ 连接的生命周期。
    对外部调用者透明。
    """
    _instance: Optional['_RabbitMQManager'] = None
    _lock = asyncio.Lock()

    def __init__(self):
        self.connection: Optional[AbstractRobustConnection] = None
        self.channel: Optional[AbstractChannel] = None
        self.exchange: Optional[AbstractExchange] = None
        self.queues: dict[str, AbstractQueue] = {}

    @classmethod
    async def get_instance(cls) -> '_RabbitMQManager':
        if cls._instance is None:
            async with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    async def initialize_internal(self):
        if self.channel and not self.channel.is_closed:
            return

        async with self._lock:
            if self.channel and not self.channel.is_closed:
                return

            try:
                print(f"💡 正在连接 RabbitMQ 并声明所有实体...")
                self.connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
                self.channel = await self.connection.channel()
                self.exchange = await self.channel.declare_exchange(
                    settings.RABBIT_EXCHANGE_NAME, aio_pika.ExchangeType.DIRECT, durable=True
                )

                queue_configs = {
                    settings.RABBIT_REQUEST_QUEUE_NAME: settings.RABBIT_REQUEST_BINDING_KEY,
                    settings.RABBIT_STATUS_QUEUE_NAME: settings.RABBIT_STATUS_BINDING_KEY,
                    settings.RABBIT_TRAIN_LOG_QUEUE_NAME: settings.RABBIT_TRAIN_LOG_BINDING_KEY,
                }
                for q_name, r_key in queue_configs.items():
                    queue = await self.channel.declare_queue(q_name, durable=True)
                    await queue.bind(self.exchange, routing_key=r_key)
                    self.queues[q_name] = queue

                print("✅ RabbitMQ 初始化成功！")
            except Exception as e:
                print(f"❌ RabbitMQ 初始化失败: {e}")
                if self.connection: await self.connection.close()
                self.connection = self.channel = self.exchange = None; self.queues = {}
                raise

    async def close_internal(self):
        if self.connection and not self.connection.is_closed:
            await self.connection.close()
            self.connection = None
            print("👋 RabbitMQ 连接已关闭。")

# --- 以下是你原有的函数，我们保持接口不变，但内部实现调用Manager ---

async def init_rabbitmq():
    manager = await _RabbitMQManager.get_instance()
    await manager.initialize_internal()

async def close_rabbitmq():
    manager = await _RabbitMQManager.get_instance()
    await manager.close_internal()

async def get_rabbit_exchange() -> Optional[AbstractExchange]:
    manager = await _RabbitMQManager.get_instance()
    await manager.initialize_internal() # 确保已初始化
    return manager.exchange

async def _send_message(routing_key: str, message_body: dict):
    try:
        exchange = await get_rabbit_exchange()
        if not exchange:
            print(f"发送消息失败: 交换机未就绪。")
            return
        message = aio_pika.Message(
            body=json.dumps(message_body).encode('utf-8'),
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT
        )
        await exchange.publish(message, routing_key=routing_key)
    except Exception as e:
        print(f"发送消息到 {routing_key} 失败: {e}")

async def send_status_message(task_id: int, status: str):
    manager = await _RabbitMQManager.get_instance()
    await manager.initialize_internal()
    message_body = {"task_id": task_id, "status": status}
    await _send_message(settings.RABBIT_STATUS_BINDING_KEY, message_body)



async def send_log_message(task_id:int, epoch: int, loss: float, accuracy: float, log_message: str):
    message_body = {"task_id": task_id,"epoch": epoch, "loss": loss, "accuracy": accuracy, "log_message": log_message}
    await _send_message(settings.RABBIT_TRAIN_LOG_BINDING_KEY, message_body)

async def start_task_queue_consumer(on_message_callback: Callable):
    try:
        manager = await _RabbitMQManager.get_instance()
        await manager.initialize_internal() # 确保已初始化
        queue = manager.queues.get(settings.RABBIT_REQUEST_QUEUE_NAME)
        if not queue:
            print(f"❌ 无法启动消费者：队列 '{settings.RABBIT_REQUEST_QUEUE_NAME}' 未找到。")
            return
        print(f"[*] 开始监听队列 '{queue.name}'.")
        await queue.consume(on_message_callback, no_ack=False)
    except Exception as e:
        print(f"❌ 启动消费者失败: {e}")