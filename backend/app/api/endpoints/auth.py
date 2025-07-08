from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Annotated
from datetime import timedelta
from app.core import security 
from app.core.deps import get_db
from app.schemas.user import UserCreate, UserPublic
from app.service.user import UserService
from app.core.security import Token
from fastapi.security import OAuth2PasswordRequestForm
from app.core.config import settings

# 创建路由实例
router = APIRouter()

# 依赖注入 UserService
async def get_user_service(db: Annotated[AsyncSession, Depends(get_db)]) -> UserService:
    return UserService(db)

@router.post("/signup", response_model=UserPublic, status_code=status.HTTP_201_CREATED, summary="注册新用户")
async def signup_user(
    user_in: UserCreate,
    user_service: Annotated[UserService, Depends(get_user_service)]
) -> UserPublic:
    """
    **注册新用户**
    通过提供用户名、密码和管理员状态来注册新用户。
    **响应:**
    - `201 Created`: 用户成功创建，返回用户信息（不含密码哈希）。
    - `400 Bad Request`: 如果用户名已存在。
    """
    user = await user_service.create_new_user(user_in)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="具有此用户名的用户已存在。",
        )
    return user

@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)]
) -> Token:
    """
    用户登录以获取访问令牌。
    接收用户名和密码，如果认证成功，则返回 JWT 访问令牌。
    """
    # 调用 security 模块中的 authenticate_user 函数进行用户认证
    # 假设 authenticate_user 已经处理了用户查找和密码验证
    user = await security.authenticate_user(db, form_data.username, form_data.password)
    
    if not user:
        # 如果认证失败，抛出 401 未授权异常
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 设置访问令牌的过期时间，从 settings 中获取
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # 创建访问令牌，将用户的唯一标识（这里是用户名）作为 'sub' 声明
    access_token = security.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    # 返回包含访问令牌和令牌类型的 Token 模型实例
    return {"access_token": access_token, "token_type": "bearer"}

