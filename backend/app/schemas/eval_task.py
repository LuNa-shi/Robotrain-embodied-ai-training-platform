from sqlmodel import SQLModel, Field
from datetime import datetime
from typing import List, Optional
from app.models.eval_task import EvalTaskBase
from app.models.eval_task import EvalTaskStatus

class EvalTaskCreate(EvalTaskBase):
    pass

class EvalTaskCreateDB(EvalTaskBase):
    owner_id: int = Field(foreign_key="app_user.id", nullable=False)
    
class EvalTaskPublic(SQLModel):
    id: int
    task_name: str
    owner_id: int
    train_task_id: int
    eval_stage: int
    status: EvalTaskStatus
    create_time: datetime
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    video_names: Optional[List[str]] = None

class EvalTaskUpdate(SQLModel):
    task_name: Optional[str] = Field(default=None)
    status: Optional[EvalTaskStatus] = Field(default=None, max_length=20)
    start_time: Optional[datetime] = Field(default=None)
    end_time: Optional[datetime] = Field(default=None)