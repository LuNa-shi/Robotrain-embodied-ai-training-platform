from sqlmodel import SQLModel, Field
from datetime import datetime
from typing import Optional
from uuid import UUID
from app.models.dataset import DatasetBase

class DatasetCreate(DatasetBase):
    pass

class DatasetCreateDB(DatasetBase):
    owner_id: int = Field(foreign_key="app_user.id", nullable=False)
    dataset_uuid: UUID = Field(nullable=False)
    
class DatasetPublic(SQLModel):
    id: int
    dataset_name: str
    description: Optional[str] = None
    owner_id: int
    dataset_uuid: UUID
    uploaded_at: datetime

class DatasetUpdate(SQLModel):
    dataset_name: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None)