from typing import Optional
from sqlmodel import Field, SQLModel

class ModelTypeBase(SQLModel):
    type_name: str = Field(max_length=50, unique=True)
    description: Optional[str] = Field(default=None)
    
class ModelType(ModelTypeBase, table=True):
    __tablename__ = "model_type"

    id: Optional[int] = Field(default=None, primary_key=True)

