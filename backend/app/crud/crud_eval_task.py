from typing import Optional
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.eval_task import EvalTask
from app.schemas.eval_task import EvalTaskUpdate, EvalTaskCreateDB

async def create_eval_task(db_session: AsyncSession, eval_task_create_db: EvalTaskCreateDB) -> EvalTask:
    """
    在数据库中创建新的评估任务。
    """
    eval_task = EvalTask(**eval_task_create_db.model_dump())  # 使用 model_dump() 将 Pydantic 模型转换为字典
    db_session.add(eval_task)
    await db_session.flush()
    return eval_task

async def get_eval_task_by_id(db_session: AsyncSession, eval_task_id: int) -> Optional[EvalTask]:
    """
    根据评估任务 ID 获取评估任务。
    """
    statement = select(EvalTask).where(EvalTask.id == eval_task_id)
    result = await db_session.exec(statement)
    return result.one_or_none()

async def get_eval_tasks_by_user_id(db_session: AsyncSession, user_id: int) -> list[EvalTask]:
    """
    获取指定用户的所有评估任务。
    """
    statement = select(EvalTask).where(EvalTask.owner_id == user_id)
    result = await db_session.exec(statement)
    return result.all()

async def get_completed_eval_tasks_by_user_id(db_session: AsyncSession, user_id: int) -> list[EvalTask]:
    """
    获取指定用户已完成的评估任务。
    """
    from app.models.eval_task import EvalTaskStatus
    statement = select(EvalTask).where(
        EvalTask.owner_id == user_id,
        EvalTask.status == EvalTaskStatus.completed
    )
    result = await db_session.exec(statement)
    return result.all()


async def update_eval_task(db_session: AsyncSession, eval_task_id: int, eval_task_update_db: EvalTaskUpdate) -> Optional[EvalTask]:
    """
    更新指定 ID 的评估任务。
    """
    eval_task = await get_eval_task_by_id(db_session, eval_task_id)
    if eval_task:
        for key, value in eval_task_update_db.model_dump().items():
            if value is not None:
                setattr(eval_task, key, value)
        # eval_task.update_time = datetime.now(timezone.utc)  # 更新修改时间
        db_session.add(eval_task)
        await db_session.flush()
        return eval_task
    return None

async def delete_eval_task(db_session: AsyncSession, eval_task_id: int) -> bool:
    """
    删除指定 ID 的评估任务。
    """
    eval_task = await get_eval_task_by_id(db_session, eval_task_id)
    if eval_task:
        await db_session.delete(eval_task)
        await db_session.flush()
        return True
    return False