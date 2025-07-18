from datetime import datetime, timezone
from typing import Optional, Dict, Any
from uuid import UUID
from enum import Enum

from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Column, JSON, DateTime

class TrainTaskStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class TrainTaskBase(SQLModel):
    dataset_id: Optional[int] = Field(default=None, foreign_key="dataset.id")
    model_type_id: Optional[int] = Field(default=None, foreign_key="model_type.id")
    hyperparameter: Dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))
    task_name: str = Field(nullable=False)

class TrainTask(TrainTaskBase, table=True):
    __tablename__ = "train_task"

    id: Optional[int] = Field(default=None, primary_key=True)

    owner_id: int = Field(foreign_key="app_user.id", nullable=False, index=True)
    status: TrainTaskStatus = Field(
        default=TrainTaskStatus.pending,
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
    logs_uuid: Optional[UUID] = Field(default=None)

    owner: "AppUser" = Relationship(
        back_populates="train_tasks",
    )
    dataset: Optional["Dataset"] = Relationship(
        # back_populates="train_tasks", 
    )
    model_type: Optional["ModelType"] = Relationship(
        # back_populates="train_tasks",
    )

from app.models.user import AppUser
from app.models.dataset import Dataset
from app.models.model_type import ModelType