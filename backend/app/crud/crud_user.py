from typing import Optional
from datetime import datetime, timezone
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.orm import selectinload


from app.models.user import AppUser
from app.schemas.user import UserCreateDB, UserUpdate

async def create_user(db_session: AsyncSession, user_create_db: UserCreateDB) -> AppUser:
    """
    在数据库中创建新用户。
    """
    user = AppUser(**user_create_db.model_dump())  # 使用 model_dump() 将 Pydantic 模型转换为字典
    db_session.add(user)
    await db_session.flush()
    return user

async def get_user_by_username(db_session: AsyncSession, username: str) -> Optional[AppUser]:
    """
    根据用户名从数据库获取用户。
    """
    statement = select(AppUser).where(AppUser.username == username)
    result = await db_session.exec(statement)
    return result.first()

async def get_user_by_id(db_session: AsyncSession, user_id: int) -> Optional[AppUser]:
    """
    根据ID从数据库获取用户。
    """
    return await db_session.get(AppUser, user_id)

async def update_user(db_session: AsyncSession, user_id: int, user_update_db: UserUpdate) -> Optional[AppUser]:
    """
    更新指定ID的用户信息。
    """
    from app.core.security import get_password_hash  # 假设你有一个安全模块来处理密码哈希
    user = await get_user_by_id(db_session, user_id)
    if user:
        # None值不会更新字段
        for key, value in user_update_db.model_dump().items():
            if value is not None:
                if key == "password":
                    # 如果有密码更新，通常需要进行哈希处理
                    user.password_hash = get_password_hash(value)
                else:
                    setattr(user, key, value)
        db_session.add(user)
        await db_session.flush()
        return user
    return None

async def delete_user(db_session: AsyncSession, user_id: int) -> Optional[AppUser]:
    """
    删除指定ID的用户。
    """
    user = await get_user_by_id(db_session, user_id)
    if user:
        await db_session.delete(user)
        await db_session.flush()
        return user
    return None

async def get_datasets_owned_by_user(db_session: AsyncSession, user_id: int):
    """
    获取用户拥有的数据集列表。
    """
    statement = select(AppUser).where(AppUser.id == user_id).options(
        selectinload(AppUser.owned_datasets)
    )
    result = await db_session.exec(statement)
    user = result.first()
    if user:
        return user.owned_datasets
    return []