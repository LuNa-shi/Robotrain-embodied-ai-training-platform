from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    
    POSTGRES_SERVER: str
    POSTGRES_PORT: int
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_SERVER: str
    MINIO_PORT: int
    MINIO_BUCKET: str
    MINIO_DATASET_DIR: str
    MINIO_MODEL_DIR: str

    RABBITMQ_DEFAULT_USER: str
    RABBITMQ_DEFAULT_PASS: str
    RABBITMQ_SERVER: str
    RABBITMQ_PORT: int
    RABBIT_EXCHANGE_NAME: str
    RABBIT_REQUEST_QUEUE_NAME: str 
    RABBIT_REQUEST_BINDING_KEY: str
    RABBIT_STATUS_QUEUE_NAME: str
    RABBIT_STATUS_BINDING_KEY: str
    RABBIT_TRAIN_LOG_QUEUE_NAME: str
    RABBIT_TRAIN_LOG_BINDING_KEY: str

    @property
    def DATABASE_URL(self) -> str:
        # 构建 PostgreSQL 连接字符串
        # f-string 语法，方便地将变量嵌入字符串
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
    
    @property
    def MINIO_URL(self) -> str:
        # 构建 MinIO 连接字符串
        return f"{self.MINIO_SERVER}:{self.MINIO_PORT}"
    
    @property
    def RABBITMQ_URL(self) -> str:
        # 构建 RabbitMQ 连接字符串
        return f"amqp://{self.RABBITMQ_DEFAULT_USER}:{self.RABBITMQ_DEFAULT_PASS}@{self.RABBITMQ_SERVER}:{self.RABBITMQ_PORT}/"
    
    SQL_ECHO: bool = False # 是否打印 SQL 语句
    
    model_config = SettingsConfigDict(env_file="../env", extra="ignore")

settings = Settings()