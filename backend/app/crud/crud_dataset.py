from typing import Optional
from datetime import datetime, timezone
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.dataset import Dataset
from app.schemas.dataset import DatasetCreateDB

async def create_dataset(db_session: AsyncSession, dataset_create_db: DatasetCreateDB) -> Dataset:
    """
    在数据库中创建新数据集。
    """
    dataset = Dataset(**dataset_create_db.model_dump())  # 使用 model_dump() 将 Pydantic 模型转换为字典
    db_session.add(dataset)
    await db_session.flush()
    return dataset

async def get_dataset_by_id(db_session: AsyncSession, dataset_id: int) -> Optional[Dataset]:
    """
    根据数据集 ID 获取数据集。
    """
    statement = select(Dataset).where(Dataset.id == dataset_id)
    result = await db_session.exec(statement)
    return result.one_or_none()

async def get_datasets_by_user_id(db_session: AsyncSession, user_id: int) -> list[Dataset]:
    """根据用户 ID 获取该用户的所有数据集。
    """
    statement = select(Dataset).where(Dataset.owner_id == user_id)
    result = await db_session.exec(statement)
    return result.all()

async def update_dataset(db_session: AsyncSession, dataset_id: int, dataset_update_db: DatasetCreateDB) -> Optional[Dataset]:
    """
    更新指定 ID 的数据集。
    """
    dataset = await get_dataset_by_id(db_session, dataset_id)
    if dataset:
        for key, value in dataset_update_db.model_dump().items():
            setattr(dataset, key, value)
        dataset.updated_at = datetime.now(timezone.utc)  # 更新修改时间
        db_session.add(dataset)
        await db_session.flush()
        return dataset
    return None

async def delete_dataset(db_session: AsyncSession, dataset_id: int) -> Optional[Dataset]:
    """
    删除指定 ID 的数据集。
    """
    dataset = await get_dataset_by_id(db_session, dataset_id)
    if dataset:
        await db_session.delete(dataset)
        await db_session.flush()
        return dataset
    return None