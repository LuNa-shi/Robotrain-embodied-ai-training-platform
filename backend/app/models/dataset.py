from datetime import datetime, timezone
from sqlalchemy import DateTime 
from typing import Optional
from sqlmodel import Field, SQLModel, Relationship
from uuid import UUID
from typing import List
from sqlalchemy.dialects.postgresql import ARRAY, TEXT
from sqlalchemy import Column

class DatasetBase(SQLModel):
    dataset_name: str = Field(max_length=100, index=True)
    description: Optional[str] = Field(default=None)
    is_aloha: bool = Field(default=False, nullable=False)  # 是否为Aloha数据集，默认为False

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

    total_episodes: int = Field(default=0, nullable=False)  # 训练集的episode数量 
    total_chunks: int = Field(default=0, nullable=False)  # 分块数量
    video_keys: List[str] = Field(default_factory=list, sa_column=Column(ARRAY(TEXT)))  # 视频文件的键列表
    chunks_size: int = Field(default=0, nullable=False)  # 每个分块的大小
    video_path: str = Field(default="", nullable=False)  # 视频文件的存储路径
    data_path: str = Field(default="", nullable=False)  # 数据文件的存储路径

    owner: "AppUser" = Relationship(back_populates="owned_datasets")

from app.models.user import AppUser