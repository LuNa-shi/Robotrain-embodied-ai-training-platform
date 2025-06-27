from typing import Optional
from datetime import datetime, timezone
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.model_type import ModelType
from app.schemas.model_type import ModelTypeCreateDB, ModelTypeUpdate

async def create_model_type(db_session: AsyncSession, model_type_create_db: ModelTypeCreateDB) -> ModelType:
    """
    在数据库中创建新模型类型。
    """
    model_type = ModelType(**model_type_create_db.model_dump())  # 使用 model_dump() 将 Pydantic 模型转换为字典
    db_session.add(model_type)
    await db_session.flush()
    return model_type

async def get_model_type_by_id(db_session: AsyncSession, model_type_id: int) -> Optional[ModelType]:
    """
    根据模型类型 ID 获取模型类型。
    """
    statement = select(ModelType).where(ModelType.id == model_type_id)
    result = await db_session.exec(statement)
    return result.one_or_none()

async def update_model_type(db_session: AsyncSession, model_type_id: int, model_type_update_db: ModelTypeUpdate) -> Optional[ModelType]:
    """
    更新指定 ID 的模型类型。
    """
    model_type = await get_model_type_by_id(db_session, model_type_id)
    if model_type:
        for key, value in model_type_update_db.model_dump().items():
            setattr(model_type, key, value)
        model_type.updated_at = datetime.now(timezone.utc)  # 更新修改时间
        db_session.add(model_type)
        await db_session.flush()
        return model_type
    return None

async def delete_model_type(db_session: AsyncSession, model_type_id: int) -> Optional[ModelType]:
    """
    删除指定 ID 的模型类型。
    """
    model_type = await get_model_type_by_id(db_session, model_type_id)
    if model_type:
        await db_session.delete(model_type)
        await db_session.flush()
        return model_type
    return None