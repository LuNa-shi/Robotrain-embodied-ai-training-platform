from datetime import datetime, timezone
from typing import Optional, Dict, Any
from uuid import UUID
from enum import Enum

from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Column, JSON, DateTime

class EvalTaskStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    
class EvalTaskBase(SQLModel):
    train_task_id: Optional[int] = Field(default=None, foreign_key="train_task.id", nullable=False)
    eval_stage: int = Field(default=1, ge=1, le=4, nullable=False)

class EvalTask(EvalTaskBase, table=True):
    __tablename__ = "eval_task"
    
    id: Optional[int] = Field(default=None, primary_key=True)

    owner_id: int = Field(foreign_key="app_user.id", nullable=False, index=True)
    
    status: EvalTaskStatus = Field(
        default=EvalTaskStatus.pending,
        nullable=False
    )
    
    create_time: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc), 
        nullable=False, 
        sa_type=DateTime(timezone=True)
    )
    start_time: Optional[datetime] = Field(
        default=None,
        sa_type=DateTime(timezone=True)
    )
    end_time: Optional[datetime] = Field(
        default=None, 
        sa_type=DateTime(timezone=True)
    )
    
    