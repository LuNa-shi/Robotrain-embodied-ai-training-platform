from sqlmodel import SQLModel, Field
from datetime import datetime
from typing import Optional
from app.models.train_task import TrainTaskBase
from app.models.train_task import TrainTaskStatus
from uuid import UUID

class TrainTaskCreate(TrainTaskBase):
    pass

class TrainTaskCreateDB(TrainTaskBase):
    owner_id: int = Field(foreign_key="app_user.id", nullable=False) 

class TrainTaskPublic(SQLModel):
    id: int
    task_name: str
    owner_id: int
    dataset_id: Optional[int] = None
    model_type_id: Optional[int] = None
    hyperparameter: dict
    status: TrainTaskStatus
    create_time: datetime
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    logs_uuid: Optional[UUID] = None
    
class TrainTaskUpdate(SQLModel):
    task_name: Optional[str] = Field(default=None)
    status: Optional[TrainTaskStatus] = Field(default=None, max_length=20)
    start_time: Optional[datetime] = Field(default=None)
    end_time: Optional[datetime] = Field(default=None)
    logs_uuid: Optional[UUID] = Field(default=None)