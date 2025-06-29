from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Annotated

from app.core.deps import get_db
from app.service.model_type import ModelTypeService
from app.schemas.model_type import ModelTypeCreate, ModelTypePublic, ModelTypeUpdate
from app.core.security import get_current_user
from app.models.user import AppUser

# 创建路由实例
router = APIRouter()

# 依赖注入 UserService
async def get_train_task_service(db: Annotated[AsyncSession, Depends(get_db)]) -> ModelTypeService:
    return ModelTypeService(db)

@router.post("/", response_model=ModelTypePublic, summary="创建模型类型")
async def create_model_type(
    model_type_create: ModelTypeCreate,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    model_type_service: Annotated[ModelTypeService, Depends(get_train_task_service)]
) -> ModelTypePublic:
    """
    **创建新的模型类型**

    创建一个新的模型类型并返回其详细信息。

    **请求体:**
    - `model_type_create`: 包含模型类型的创建信息。

    **响应:**
    - `201 Created`: 成功创建模型类型。
    - `400 Bad Request`: 请求体不符合要求。
    - `403 Forbidden`: 当前用户不是管理员。
    - `401 Unauthorized`: 用户未登录。
    """
    # 验证当前用户是否是管理员
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="你不是管理员，无法创建模型类型。",
        )
    return await model_type_service.create_model_type(model_type_create)