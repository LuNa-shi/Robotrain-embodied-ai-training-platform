from sqlmodel import SQLModel, Field
from typing import Optional
from app.models.model_type import ModelTypeBase

class ModelTypeCreate(ModelTypeBase):
    pass

class ModelTypeCreateDB(ModelTypeBase):
    pass

class ModelTypePublic(SQLModel):
    id: int
    type_name: str
    description: Optional[str] = None

class ModelTypeUpdate(SQLModel):
    type_name: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None)