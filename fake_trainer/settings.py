import os

class Settings:
    def __init__(self):
        # PostgreSQL 数据库相关
        self.POSTGRES_SERVER: str = os.environ.get("POSTGRES_SERVER")
        self.POSTGRES_PORT: int = int(os.environ.get("POSTGRES_PORT"))
        self.POSTGRES_USER: str = os.environ.get("POSTGRES_USER")
        self.POSTGRES_PASSWORD: str = os.environ.get("POSTGRES_PASSWORD")
        self.POSTGRES_DB: str = os.environ.get("POSTGRES_DB")

        # MinIO 对象存储相关
        self.MINIO_ACCESS_KEY: str = os.environ.get("MINIO_ACCESS_KEY")
        self.MINIO_SECRET_KEY: str = os.environ.get("MINIO_SECRET_KEY")
        self.MINIO_SERVER: str = os.environ.get("MINIO_SERVER")
        self.MINIO_PORT: int = int(os.environ.get("MINIO_PORT"))
        self.DATASET_BUCKET: str = os.environ.get("DATASET_BUCKET")

        # RabbitMQ 消息队列相关
        self.RABBITMQ_DEFAULT_USER: str = os.environ.get("RABBITMQ_DEFAULT_USER")
        self.RABBITMQ_DEFAULT_PASS: str = os.environ.get("RABBITMQ_DEFAULT_PASS")
        self.RABBITMQ_SERVER: str = os.environ.get("RABBITMQ_SERVER")
        self.RABBITMQ_PORT: int = int(os.environ.get("RABBITMQ_PORT"))
        self.RABBIT_EXCHANGE_NAME: str = os.environ.get("RABBIT_EXCHANGE_NAME")
        self.RABBIT_REQUEST_QUEUE_NAME: str = os.environ.get("RABBIT_REQUEST_QUEUE_NAME")
        self.RABBIT_REQUEST_BINDING_KEY: str = os.environ.get("RABBIT_REQUEST_BINDING_KEY")
        self.RABBIT_STATUS_QUEUE_NAME: str = os.environ.get("RABBIT_STATUS_QUEUE_NAME")
        self.RABBIT_STATUS_BINDING_KEY: str = os.environ.get("RABBIT_STATUS_BINDING_KEY")
        self.RABBIT_TRAIN_LOG_QUEUE_NAME: str = os.environ.get("RABBIT_TRAIN_LOG_QUEUE_NAME")
        self.RABBIT_TRAIN_LOG_BINDING_KEY: str = os.environ.get("RABBIT_TRAIN_LOG_BINDING_KEY")

    @property
    def DATABASE_URL(self) -> str:
        # 构建 PostgreSQL 连接字符串
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @property
    def MINIO_URL(self) -> str:
        # 构建 MinIO 连接字符串
        return f"{self.MINIO_SERVER}:{self.MINIO_PORT}"

    @property
    def RABBITMQ_URL(self) -> str:
        # 构建 RabbitMQ 连接字符串
        return f"amqp://{self.RABBITMQ_DEFAULT_USER}:{self.RABBITMQ_DEFAULT_PASS}@{self.RABBITMQ_SERVER}:{self.RABBITMQ_PORT}/"

settings = Settings()