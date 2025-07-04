import os

class Settings:
    """
    统一管理平台的所有配置。
    为了方便测试，我们直接在这里定义默认值。
    在生产环境中，这些值可以通过环境变量覆盖。
    """
    # --- MinIO 对象存储相关 ---
    MINIO_SERVER: str = os.getenv("MINIO_SERVER", "localhost")
    MINIO_PORT: int = int(os.getenv("MINIO_PORT", 9000))
    MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    MINIO_BUCKET: str = os.getenv("MINIO_BUCKET", "robotrain")
    MINIO_DATASET_DIR: str = os.getenv("MINIO_DATASET_DIR", "datasets")
    MINIO_MODEL_DIR: str = os.getenv("MINIO_MODEL_DIR", "models")
    MINIO_CKPT_DIR: str = os.getenv("MINIO_CKPT_DIR", "checkpoints")  # 新增检查点目录

    # --- RabbitMQ 消息队列相关 ---
    RABBITMQ_SERVER: str = os.getenv("RABBITMQ_SERVER", "localhost")
    RABBITMQ_PORT: int = int(os.getenv("RABBITMQ_PORT", 5672))
    RABBITMQ_DEFAULT_USER: str = os.getenv("RABBITMQ_DEFAULT_USER", "rabbituser")
    RABBITMQ_DEFAULT_PASS: str = os.getenv("RABBITMQ_DEFAULT_PASS", "12345678")
    # 交换机
    RABBIT_EXCHANGE_NAME: str = os.getenv("RABBIT_EXCHANGE_NAME", "my_direct_exchange")
    # 队列和路由键
    RABBIT_REQUEST_QUEUE_NAME: str = os.getenv("RABBIT_REQUEST_QUEUE_NAME", "task_request")
    RABBIT_REQUEST_BINDING_KEY: str = os.getenv("RABBIT_REQUEST_BINDING_KEY", "request_binding_key")
    RABBIT_STATUS_QUEUE_NAME: str = os.getenv("RABBIT_STATUS_QUEUE_NAME", "train_status")
    RABBIT_STATUS_BINDING_KEY: str = os.getenv("RABBIT_STATUS_BINDING_KEY", "status_binding_key")
    RABBIT_TRAIN_LOG_QUEUE_NAME: str = os.getenv("RABBIT_TRAIN_LOG_QUEUE_NAME", "train_log")
    RABBIT_TRAIN_LOG_BINDING_KEY: str = os.getenv("RABBIT_TRAIN_LOG_BINDING_KEY", "train_log_binding_key")


    # --- 数据库相关 (即使暂时不用，也保留结构) ---
    POSTGRES_SERVER: str = os.getenv("POSTGRES_SERVER", "localhost")
    POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT", 5432))
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "12345678")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "RoboTrain")


    # --- 平台自身配置 (新增加的部分) ---
    SCHEDULER_STEPS_PER_TIMESLICE: int = int(os.getenv("SCHEDULER_STEPS_PER_TIMESLICE", 50)) # for fake_train
    SCHEDULER_GPUS_PER_TRAINER: int = int(os.getenv("SCHEDULER_GPUS_PER_TRAINER", 1)) # for fake_train, no GPU
    
    # 运行目录
    RUN_DIR_BASE: str = os.getenv("RUN_DIR_BASE", "/tmp/training_platform_runs")


    # --- 自动生成的连接字符串 (方便使用) ---
    @property
    def MINIO_URL(self) -> str:
        return f"{self.MINIO_SERVER}:{self.MINIO_PORT}"

    @property
    def RABBITMQ_URL(self) -> str:
        return f"amqp://{self.RABBITMQ_DEFAULT_USER}:{self.RABBITMQ_DEFAULT_PASS}@{self.RABBITMQ_SERVER}:{self.RABBITMQ_PORT}/"
    
    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

# 创建一个全局可用的 settings 实例
settings = Settings()