from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException, status
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Annotated

from app.core.deps import get_db
from app.service.eval_task import EvalTaskService
from app.schemas.eval_task import EvalTaskCreate, EvalTaskPublic
from app.core.security import get_current_user
from app.models.user import AppUser
import os
# 创建路由实例
router = APIRouter()

async def get_train_task_service(db: Annotated[AsyncSession, Depends(get_db)]) -> EvalTaskService:
    return EvalTaskService(db)

@router.get("/me", response_model=list[EvalTaskPublic], summary="获取所有评估任务")
async def get_my_eval_tasks(
    current_user: Annotated[AppUser, Depends(get_current_user)],
    eval_task_service: Annotated[EvalTaskService, Depends(get_train_task_service)]
) -> list[EvalTaskPublic]:
    """
    **获取当前用户的所有评估任务**

    返回当前登录用户的所有评估任务信息。

    **响应:**
    - `200 OK`: 成功获取评估任务列表。
    - `401 Unauthorized`: 用户未登录。
    """
    return await eval_task_service.get_eval_tasks_by_user(current_user.id)

@router.get("/{eval_task_id}", response_model=EvalTaskPublic, summary="获取评估任务详情")
async def get_eval_task(
    eval_task_id: int,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    eval_task_service: Annotated[EvalTaskService, Depends(get_train_task_service)]
) -> EvalTaskPublic:
    """
    **获取评估任务详情**

    返回指定评估任务的详细信息。

    **路径参数:**
    - `eval_task_id`: 评估任务的唯一标识符。

    **响应:**
    - `200 OK`: 成功获取评估任务详情。
    - `404 Not Found`: 评估任务不存在。
    - `401 Unauthorized`: 用户未登录。
    """
    eval_task = await eval_task_service.get_eval_task_by_id(eval_task_id, current_user.id)
    if not eval_task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评估任务不存在")
    return eval_task

@router.post("/", response_model=EvalTaskPublic, summary="创建评估任务")
async def create_eval_task(
    eval_task_create: EvalTaskCreate,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    eval_task_service: Annotated[EvalTaskService, Depends(get_train_task_service)]
) -> EvalTaskPublic:
    """
    **创建评估任务**

    创建一个新的评估任务。

    **请求体:**
    - `eval_task_create`: 评估任务创建的详细信息。

    **响应:**
    - `201 Created`: 成功创建评估任务。
    - `400 Bad Request`: 请求体格式错误/创建失败
    - `401 Unauthorized`: 用户未登录。
    
    """
    train_task = await eval_task_service.create_eval_task_for_user(current_user, eval_task_create)
    if not train_task:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="创建评估任务失败")
    return train_task

@router.get("/{eval_task_id}/download", summary="下载评估任务结果")
async def download_eval_task_result(
    eval_task_id: int,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    eval_task_service: Annotated[EvalTaskService, Depends(get_train_task_service)]
) -> FileResponse:
    """
    **下载评估任务结果**

    下载指定评估任务的结果文件。

    **路径参数:**
    - `eval_task_id`: 评估任务的唯一标识符。

    **响应:**
    - `200 OK`: 成功下载评估任务结果。
    - `404 Not Found`: 评估任务不存在。
    - `401 Unauthorized`: 用户未登录。
    """
    file_path = await eval_task_service.download_eval_task_result(eval_task_id, current_user.id)
    if not file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评估任务结果文件不存在")
    
    return FileResponse(file_path, background=BackgroundTask(os.remove, file_path))