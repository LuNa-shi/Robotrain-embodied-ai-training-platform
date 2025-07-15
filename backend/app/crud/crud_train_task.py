from typing import Optional
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.train_task import TrainTask
from app.schemas.train_task import TrainTaskCreateDB, TrainTaskUpdate

async def create_train_task(db_session: AsyncSession, train_task_create_db: TrainTaskCreateDB) -> TrainTask:
    """
    在数据库中创建新的训练任务。
    """
    train_task = TrainTask(**train_task_create_db.model_dump())  # 使用 model_dump() 将 Pydantic 模型转换为字典
    db_session.add(train_task)
    await db_session.flush()
    return train_task

async def get_train_task_by_id(db_session: AsyncSession, train_task_id: int) -> Optional[TrainTask]:
    """
    根据训练任务 ID 获取训练任务。
    """
    statement = select(TrainTask).where(TrainTask.id == train_task_id)
    result = await db_session.exec(statement)
    return result.one_or_none()

async def get_train_tasks_by_user_id(db_session: AsyncSession, user_id: int) -> list[TrainTask]:
    """
    获取指定用户的所有训练任务。
    """
    statement = select(TrainTask).where(TrainTask.owner_id == user_id)
    result = await db_session.exec(statement)
    return result.all()

async def get_completed_tasks_by_user_id(db_session: AsyncSession, user_id: int) -> list[TrainTask]:
    """
    获取指定用户已完成的训练任务。
    """
    from app.models.train_task import TrainTaskStatus
    statement = select(TrainTask).where(
        TrainTask.owner_id == user_id,
        TrainTask.status == TrainTaskStatus.completed
    )
    result = await db_session.exec(statement)
    return result.all()

async def update_train_task(db_session: AsyncSession, train_task_id: int, train_task_update_db: TrainTaskUpdate) -> Optional[TrainTask]:
    """
    更新指定 ID 的训练任务。
    """
    train_task = await get_train_task_by_id(db_session, train_task_id)
    if train_task:
        for key, value in train_task_update_db.model_dump().items():
            if value is not None:
                setattr(train_task, key, value)
        # train_task.upda = datetime.now(timezone.utc)  # 更新修改时间
        db_session.add(train_task)
        await db_session.flush()
        return train_task
    return None

async def delete_train_task(db_session: AsyncSession, train_task_id: int) -> Optional[TrainTask]:
    """
    删除指定 ID 的训练任务。
    """
    train_task = await get_train_task_by_id(db_session, train_task_id)
    if train_task:
        await db_session.delete(train_task)
        await db_session.flush()
        return train_task
    return None