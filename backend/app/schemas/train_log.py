from app.models.train_log import TrainLogBase
from sqlmodel import Field, SQLModel, Relationship
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import DateTime
from uuid import UUID
from app.models.train_task import TrainTask

class TrainLogCreate(TrainLogBase):
    """
    用于创建训练日志的 Pydantic 模型。
    """
    pass

class TrainLogCreateDB(TrainLogBase):
    """
    用于创建训练日志的数据库模型。
    """
    pass

class TrainLogPublic(SQLModel):
    """
    用于公开训练日志的 Pydantic 模型。
    """
    id: int
    train_task_id: int
    log_message: str
    log_time: datetime
    
