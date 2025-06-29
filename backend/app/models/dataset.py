from datetime import datetime, timezone
from sqlalchemy import DateTime 
from typing import Optional
from sqlmodel import Field, SQLModel, Relationship
from uuid import UUID
from typing import List

class DatasetBase(SQLModel):
    dataset_name: str = Field(max_length=100, index=True)
    description: Optional[str] = Field(default=None)

class Dataset(DatasetBase, table=True):
    __tablename__ = "dataset"

    id: Optional[int] = Field(default=None, primary_key=True)
    dataset_uuid: UUID = Field(nullable=False)
    owner_id: int = Field(foreign_key="app_user.id", nullable=False)
    uploaded_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
        sa_type=DateTime(timezone=True)
    )

    owner: "AppUser" = Relationship(back_populates="owned_datasets")

from app.models.user import AppUser