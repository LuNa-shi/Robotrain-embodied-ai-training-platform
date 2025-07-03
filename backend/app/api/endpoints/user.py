from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Annotated

from app.core.deps import get_db
from app.schemas.user import UserPublic
from app.service.user import UserService
from app.core.security import get_current_user
from app.models.user import AppUser

# 创建路由实例
router = APIRouter()

# 依赖注入 UserService
async def get_user_service(db: Annotated[AsyncSession, Depends(get_db)]) -> UserService:
    return UserService(db)

@router.get("/me", response_model=UserPublic, summary="获取当前用户信息")
async def get_me(
    current_user: Annotated[AppUser, Depends(get_current_user)]
) -> UserPublic:
    """
    **获取当前用户信息**

    返回当前登录用户的公开信息。

    **响应:**
    - `200 OK`: 成功获取用户信息。
    - `401 Unauthorized`: 用户未登录。
    """
    return current_user

@router.get("/", response_model=list[UserPublic], summary="获取所有用户信息")
async def get_all_users(
    user_service: Annotated[UserService, Depends(get_user_service)],
    current_user: Annotated[AppUser, Depends(get_current_user)]
) -> list[UserPublic]:
    """
    **获取所有用户信息**

    返回系统中所有用户的公开信息列表。

    **响应:**
    - `200 OK`: 成功获取用户列表。
    - `403 Forbidden`: 当前用户不是管理员，无法访问此资源。
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="你不是管理员，无法访问此资源。",
        )
    
    return await user_service.get_all_users()

@router.get("/{username}", response_model=UserPublic, summary="根据用户名获取用户信息")
async def get_user_by_username(
    username: str,
    user_service: Annotated[UserService, Depends(get_user_service)],
    current_user: Annotated[AppUser, Depends(get_current_user)]
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
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="你不是管理员，无法访问此资源。",
        )
    
    user = await user_service.get_user_by_username(username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户未找到。",
        )
    return user

# 你可能还会在这里添加其他用户相关的路由，例如更新用户资料、删除用户等

@router.delete("/{username}", response_model=UserPublic, summary="根据用户名删除用户")
async def delete_user_by_username(
    username: str,
    user_service: Annotated[UserService, Depends(get_user_service)],
    current_user: Annotated[AppUser, Depends(get_current_user)]
) -> UserPublic:
    """
    **根据用户名删除用户**

    通过用户名删除用户，并返回是否成功删除的用户信息。

    **路径参数:**
    - `username`: 要删除的用户的用户名。

    **响应:**
    - `200 OK`: 成功删除用户，并返回是否成功
    - `403 Forbidden`: 当前用户不是管理员，无法删除用户。
    - `404 Not Found`: 用户不存在。
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="你不是管理员，无法访问此资源。",
        )
    user_to_delete = await user_service.get_user_by_username(username)
    if not user_to_delete:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户未找到。",
        )
    
    if user_to_delete.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="不能删除管理员用户。",
        )
        
    deleted_user = await user_service.delete_user_by_username(username)\
    
    return deleted_user
    
