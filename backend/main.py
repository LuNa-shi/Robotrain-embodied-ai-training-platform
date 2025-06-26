from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.core.deps import create_db_and_tables
from app.api.api import api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 在应用程序启动时执行的代码
    print("Application startup")
    await create_db_and_tables()
    yield
    # 在应用程序关闭时执行的代码
    print("Application shutdown")

app = FastAPI(
    title="RoboTrain_Backend",
    lifespan=lifespan
)

app.include_router(api_router, prefix="/api")

@app.get("/")
def read_root():
    """
    根路径。
    """
    return {"message": "Welcome to RoboTrain API! Visit /docs for API documentation."}