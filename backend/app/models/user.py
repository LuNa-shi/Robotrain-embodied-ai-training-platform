from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel, Relationship

class UserBase(SQLModel):
    """
    用户模型的基础部分，用于定义公共字段，可被创建和读取 Schema 继承
    """
    username: str = Field(max_length=50, unique=True, index=True)
    is_admin: bool = Field(default=False)

class AppUser(UserBase, table=True):
    """
    SQLModel 模型，对应数据库中的 'app_user' 表
    """
    __tablename__ = "app_user"
    id: Optional[int] = Field(default=None, primary_key=True)
    password_hash: str = Field(max_length=255)
    created_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False) # 注册时间，默认使用 UTC 时间
    last_login: Optional[datetime] = Field(default=None, nullable=True)

    # 如果有其他模型与用户有关联，可以在这里定义关系
    # 例如：items: List["Item"] = Relationship(back_populates="owner")