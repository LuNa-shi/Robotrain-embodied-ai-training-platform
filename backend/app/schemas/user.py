from sqlmodel import SQLModel, Field
from datetime import datetime
from typing import Optional
from app.models.user import UserBase

class UserCreate(UserBase): # 继承自 UserBase
    password: str # 在创建时需要密码，而不是哈希值

class UserCreateDB(UserBase): # 继承自 UserBase (包含 username, is_admin)
    """
    用于在 Service 层构建，并传递给 CRUD 层以创建数据库记录的模型。
    包含哈希后的密码。
    """
    password_hash: str = Field(max_length=255) # 哈希后的密码，不再是明文

class UserPublic(SQLModel): # 用于公开显示的用户信息，不包含敏感字段
    id: int
    username: str
    is_admin: bool
    created_at: datetime
    last_login: Optional[datetime] = None

class UserUpdate(SQLModel): # 用户更新 Schema
    username: Optional[str] = None
    password: Optional[str] = None
    is_admin: Optional[bool] = None