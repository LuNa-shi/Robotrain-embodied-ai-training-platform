from sqlmodel import SQLModel, Field
from datetime import datetime
from typing import Optional
from uuid import UUID
from app.models.dataset import DatasetBase
from typing import List
from sqlalchemy.dialects.postgresql import ARRAY, TEXT
from sqlalchemy import Column

class DatasetCreate(DatasetBase):
    pass

class DatasetCreateDB(DatasetBase):
    owner_id: int = Field(foreign_key="app_user.id", nullable=False)
    dataset_uuid: UUID = Field(nullable=False)
    
    total_episodes: int = Field(default=0, nullable=False)  # 训练集的episode数量 
    total_chunks: int = Field(default=0, nullable=False)  # 分块数量
    video_keys: List[str] = Field(default_factory=list, sa_column=Column(ARRAY(TEXT)))  # 视频文件的键列表
    chunks_size: int = Field(default=0, nullable=False)  # 每个分块的大小
    video_path: str = Field(default="", nullable=False)  # 视频文件的存储路径
    data_path: str = Field(default="", nullable=False)  # 数据文件的存储路径
    
class DatasetPublic(SQLModel):
    id: int
    dataset_name: str
    description: Optional[str] = None
    owner_id: int
    dataset_uuid: UUID
    uploaded_at: datetime
    
    total_episodes: int = Field(default=0, nullable=False)  # 训练集的episode数量 
    total_chunks: int = Field(default=0, nullable=False)  # 分块数量
    video_keys: List[str] = Field(default_factory=list, sa_column=Column(ARRAY(TEXT)))  # 视频文件的键列表
    chunks_size: int = Field(default=0, nullable=False)  # 每个分块的大小
    video_path: str = Field(default="", nullable=False)  # 视频文件的存储路径
    data_path: str = Field(default="", nullable=False)  # 数据文件的存储路径

class DatasetUpdate(SQLModel):
    dataset_name: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None)