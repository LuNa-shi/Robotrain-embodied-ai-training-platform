from typing import Optional
from datetime import datetime, timezone
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.train_log import TrainLog
from app.schemas.train_log import TrainLogCreateDB

async def create_train_log(db_session: AsyncSession, train_log_create_db: TrainLogCreateDB) -> TrainLog:
    """
    在数据库中创建新训练日志。
    """
    train_log = TrainLog(**train_log_create_db.model_dump())  # 使用 model_dump() 将 Pydantic 模型转换为字典
    db_session.add(train_log)
    await db_session.flush()
    return train_log

async def get_train_log_by_id(db_session: AsyncSession, train_log_id: int) -> Optional[TrainLog]:
    """
    根据训练日志 ID 获取训练日志。
    """
    statement = select(TrainLog).where(TrainLog.id == train_log_id)
    result = await db_session.exec(statement)
    return result.one_or_none()

async def get_train_logs_by_task_id(db_session: AsyncSession, train_task_id: int) -> list[TrainLog]:
    """
    根据训练任务 ID 获取所有相关的训练日志。
    """
    statement = select(TrainLog).where(TrainLog.train_task_id == train_task_id)
    result = await db_session.exec(statement)
    return result.all()

async def delete_train_log(db_session: AsyncSession, train_log_id: int) -> Optional[TrainLog]:
    """
    删除指定 ID 的训练日志。
    """
    train_log = await get_train_log_by_id(db_session, train_log_id)
    if train_log:
        await db_session.delete(train_log)
        await db_session.flush()
        return train_log
    return None