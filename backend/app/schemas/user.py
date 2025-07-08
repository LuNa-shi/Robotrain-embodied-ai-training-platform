from sqlmodel import SQLModel, Field
from datetime import datetime
from typing import Optional
from app.models.user import UserBase
# Create: create时前端传来的数据
class UserCreate(UserBase):
    password: str

# CreateDB： create时经过一定处理后，要存入数据库的数据，单不包括id和time等自动生成的字段
class UserCreateDB(UserBase):
    password_hash: str = Field(max_length=255)

#Public：get时公开给前端的数据
class UserPublic(SQLModel):
    id: int
    username: str
    is_admin: bool
    created_at: datetime
    last_login: Optional[datetime] = None

#Update：update时前端传来的数据
class UserUpdate(SQLModel):
    username: Optional[str] = Field(default=None, max_length=50)
    password: Optional[str] = Field(default=None)
    is_admin: Optional[bool] = Field(default=None)