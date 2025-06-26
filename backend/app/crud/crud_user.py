from typing import Optional
from datetime import datetime, timezone
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.user import AppUser
from app.schemas.user import UserCreateDB

async def create_user(db_session: AsyncSession, user_create_db: UserCreateDB,) -> AppUser:
    """
    在数据库中创建新用户。
    """
    user = AppUser(**user_create_db.model_dump())  # 使用 model_dump() 将 Pydantic 模型转换为字典
    db_session.add(user)
    await db_session.commit() # 同步 commit
    await db_session.refresh(user) # 同步 refresh
    return user

async def get_user_by_username(db_session: AsyncSession, username: str) -> Optional[AppUser]:
    """
    根据用户名从数据库获取用户。
    """
    statement = select(AppUser).where(AppUser.username == username)
    result = await db_session.exec(statement) # 同步 exec
    return result.first()

async def get_user_by_id(db_session: AsyncSession, user_id: int) -> Optional[AppUser]:
    """
    根据ID从数据库获取用户。
    """
    return await db_session.get(AppUser, user_id) # 同步 get

async def update_last_login(db_session: AsyncSession, user: AppUser) -> AppUser:
    """
    更新用户的最后登录时间。
    """
    user.last_login = datetime.now(timezone.utc)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user