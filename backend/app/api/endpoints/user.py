from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Annotated

from app.core.deps import get_db
from app.schemas.user import UserPublic
from app.service.user import UserService
from app.core.security import get_current_user

# 创建路由实例
router = APIRouter()

# 依赖注入 UserService
async def get_user_service(db: Annotated[AsyncSession, Depends(get_db)]) -> UserService:
    return UserService(db)

@router.get("/users/me", response_model=UserPublic, summary="获取当前用户信息")
async def get_me(
    current_user: Annotated[UserPublic, Depends(get_current_user)]
) -> UserPublic:
    """
    **获取当前用户信息**

    返回当前登录用户的公开信息。

    **响应:**
    - `200 OK`: 成功获取用户信息。
    - `401 Unauthorized`: 用户未登录。
    """
    return current_user

@router.get("/users/{username}", response_model=UserPublic, summary="根据用户名获取用户信息")
async def get_user_by_username(
    username: str,
    user_service: Annotated[UserService, Depends(get_user_service)]
) -> UserPublic:
    """
    **根据用户名获取用户信息**

    通过用户名查询并返回用户的公开信息。

    **路径参数:**
    - `username`: 要查询的用户的用户名。

    **响应:**
    - `200 OK`: 成功获取用户信息。
    - `404 Not Found`: 用户不存在。
    """
    user = await user_service.get_user_by_username(username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户未找到。",
        )
    return user

# 你可能还会在这里添加其他用户相关的路由，例如更新用户资料、删除用户等