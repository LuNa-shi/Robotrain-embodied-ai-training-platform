from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import DateTime

class UserBase(SQLModel):
    username: str = Field(max_length=50, unique=True, index=True)
    is_admin: bool = Field(default=False)

class AppUser(UserBase, table=True):
    __tablename__ = "app_user"
    id: Optional[int] = Field(default=None, primary_key=True)
    password_hash: str = Field(max_length=255)
    created_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc), 
        nullable=False, 
        sa_type=DateTime(timezone=True)
    )
    last_login: Optional[datetime] = Field(
        default=None,
        nullable=True,
        sa_type=DateTime(timezone=True)
    )

    owned_datasets: list["Dataset"] = Relationship(
        back_populates="owner",
        # cascade="save-update, merge, refresh-expire, delete-orphan, expunge"
        sa_relationship_kwargs={
            "cascade": "save-update, merge, refresh-expire, expunge",
        }
    )
    train_tasks: list["TrainTask"] = Relationship(
        back_populates="owner",
        # cascade="save-update, merge, refresh-expire, delete-orphan, expunge"
        sa_relationship_kwargs={
            "cascade": "save-update, merge, refresh-expire, expunge",
        }
    )
    
from app.models.dataset import Dataset
from app.models.train_task import TrainTask