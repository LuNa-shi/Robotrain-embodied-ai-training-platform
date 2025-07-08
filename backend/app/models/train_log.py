from sqlalchemy import DateTime 
from typing import Optional
from sqlmodel import Field, SQLModel, Relationship
from datetime import datetime, timezone

class TrainLogBase(SQLModel):
    train_task_id: int = Field(foreign_key="train_task.id", nullable=False, index=True)
    log_message: str = Field(nullable=False)

class TrainLog(TrainLogBase, table=True):
    __tablename__ = "train_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    log_time: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
        sa_type=DateTime(timezone=True)
    )
    


from app.models.train_task import TrainTask