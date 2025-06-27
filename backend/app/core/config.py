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
    DATASET_BUCKET: str

    RABBITMQ_DEFAULT_USER: str
    RABBITMQ_DEFAULT_PASS: str
    RABBITMQ_SERVER: str
    RABBITMQ_PORT: int

    @property
    def DATABASE_URL(self) -> str:
        # 构建 PostgreSQL 连接字符串
        # f-string 语法，方便地将变量嵌入字符串
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
    
    @property
    def MINIO_URL(self) -> str:
        # 构建 MinIO 连接字符串
        return f"{self.MINIO_SERVER}:{self.MINIO_PORT}"
    
    SQL_ECHO: bool = False # 是否打印 SQL 语句
    
    model_config = SettingsConfigDict(env_file="../env", extra="ignore")

settings = Settings()