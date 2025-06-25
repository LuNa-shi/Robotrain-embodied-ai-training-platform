from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session # 导入同步会话

from app.core.deps import get_db
from app.schemas.user import UserPublic
from app.service.user import UserService

# 创建路由实例
router = APIRouter()

# 依赖注入 UserService
def get_user_service(db: Session = Depends(get_db)) -> UserService:
    return UserService(db)

@router.get("/users/{username}", response_model=UserPublic, summary="根据用户名获取用户信息")
def get_user_by_username(
    username: str,
    user_service: UserService = Depends(get_user_service)
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
    user = user_service.get_user_by_username(username) # 调用 Service 层方法
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户未找到。",
        )
    return user

# 你可能还会在这里添加其他用户相关的路由，例如更新用户资料、删除用户等