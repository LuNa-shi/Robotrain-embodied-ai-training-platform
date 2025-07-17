from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.core.deps import create_db_and_tables
from app.core.minio_utils import connect_minio
from app.core.rabbitmq_utils import init_rabbitmq, start_status_queue_consumer, close_rabbitmq, start_status_queue_consumer, start_train_log_queue_consumer, start_eval_status_queue_consumer
from app.api.api import api_router
from miniopy_async import Minio
from typing import Optional
import asyncio

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 在应用程序启动时执行的代码
    print("Application startup")
    await create_db_and_tables()
    await connect_minio()
    await init_rabbitmq()
    await start_status_queue_consumer()
    await start_train_log_queue_consumer()
    await start_eval_status_queue_consumer()
    yield
    # 在应用程序关闭时执行的代码
    await close_rabbitmq()
    # 这里可以添加其他清理代码，例如关闭数据库连接等) 
    print("Application shutdown")

app = FastAPI(
    title="RoboTrain_Backend",
    lifespan=lifespan
)

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],  # 允许所有来源
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有方法
    allow_headers=["*"],  # 允许所有头部
)

app.include_router(api_router, prefix="/api")

@app.get("/")
def read_root():
    """
    根路径。
    """
    return {"message": "Welcome to RoboTrain API! Visit /docs for API documentation."}