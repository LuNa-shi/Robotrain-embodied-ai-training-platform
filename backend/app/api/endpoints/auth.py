from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.deps import get_db
from app.schemas.user import UserCreate, UserPublic
from app.service.user import UserService

# 创建路由实例
router = APIRouter()

# 依赖注入 UserService
def get_user_service(db: Session = Depends(get_db)) -> UserService:
    return UserService(db)

@router.post("/signup", response_model=UserPublic, status_code=status.HTTP_201_CREATED, summary="注册新用户")
def signup_user(
    user_in: UserCreate,
    user_service: UserService = Depends(get_user_service)
) -> UserPublic:
    """
    **注册新用户**

    通过提供用户名、密码和管理员状态来注册新用户。

    **请求体:**
    - `username`: 用户名，必须唯一。
    - `password`: 用户的明文密码。
    - `is_admin`: 布尔值，指示是否为管理员（默认为 False）。

    **响应:**
    - `201 Created`: 用户成功创建，返回用户信息（不含密码哈希）。
    - `400 Bad Request`: 如果用户名已存在。
    """
    user = user_service.create_new_user(user_in)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="具有此用户名的用户已存在。",
        )
    return user