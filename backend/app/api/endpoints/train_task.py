from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Annotated

from app.core.deps import get_db
from app.service.train_task import TrainTaskService
from app.schemas.train_task import TrainTaskCreate, TrainTaskPublic
from app.core.security import get_current_user
from app.models.user import AppUser

# 创建路由实例
router = APIRouter()

# 依赖注入 UserService
async def get_train_task_service(db: Annotated[AsyncSession, Depends(get_db)]) -> TrainTaskService:
    return TrainTaskService(db)

@router.get("/me", response_model=list[TrainTaskPublic], summary="获取所有训练任务")
async def get_my_train_tasks(
    current_user: Annotated[AppUser, Depends(get_current_user)],
    train_task_service: Annotated[TrainTaskService, Depends(get_train_task_service)]
) -> list[TrainTaskPublic]:
    """
    **获取当前用户的所有训练任务**

    返回当前登录用户的所有训练任务信息。

    **响应:**
    - `200 OK`: 成功获取训练任务列表。
    - `401 Unauthorized`: 用户未登录。
    """
    return await train_task_service.get_tasks_by_user(current_user.id)

@router.post("/", response_model=TrainTaskPublic, summary="创建训练任务")
async def create_train_task(
    train_task_create: TrainTaskCreate,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    train_task_service: Annotated[TrainTaskService, Depends(get_train_task_service)]
) -> TrainTaskPublic:
    """
    **创建新的训练任务**

    创建一个新的训练任务并返回其详细信息。

    **请求体:**
    - `train_task_create`: 包含训练任务的创建信息。

    **响应:**
    - `201 Created`: 成功创建训练任务。
    - `400 Bad Request`: 请求体不符合要求。
    - `401 Unauthorized`: 用户未登录。
    """
    return await train_task_service.create_train_task_for_user(current_user, train_task_create)

@router.get("/{task_id}", response_model=TrainTaskPublic, summary="获取训练任务详情")
async def get_train_task(
    task_id: int,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    train_task_service: Annotated[TrainTaskService, Depends(get_train_task_service)]
) -> TrainTaskPublic:
    """
    **获取指定训练任务的详细信息**

    根据任务 ID 获取训练任务的详细信息。

    **路径参数:**
    - `task_id`: 训练任务的唯一标识符。

    **响应:**
    - `200 OK`: 成功获取训练任务详情。
    - `403 Forbidden`: 当前用户无权访问该任务。
    - `404 Not Found`: 任务不存在。
    - `401 Unauthorized`: 用户未登录。
    """
    # 验证任务是否存在
    train_task = await train_task_service.get_train_task_by_id(task_id)
    if not train_task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="训练任务不存在")
    # 验证当前用户是否有权限访问该任务
    if train_task.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该训练任务")
    
    return await train_task_service.get_train_task_by_id(task_id, current_user.id)

