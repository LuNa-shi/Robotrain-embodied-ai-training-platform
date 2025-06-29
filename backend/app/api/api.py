from fastapi import APIRouter
from app.api.endpoints import auth, user, dataset, train_task, websocket # 导入 auth 和 user 模块

# 创建主 API 路由器
api_router = APIRouter()

# 将各个模块的路由器包含到主路由器中
# prefix 参数为该路由器下的所有路由添加前缀
# tags 参数用于 OpenAPI (Swagger UI) 文档中的分组
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(user.router, prefix="/users", tags=["users"])
api_router.include_router(dataset.router, prefix="/datasets", tags=["datasets"])
api_router.include_router(websocket.router, prefix="/websocket", tags=["websocket"])
api_router.include_router(train_task.router, prefix="/train_tasks", tags=["train_tasks"])