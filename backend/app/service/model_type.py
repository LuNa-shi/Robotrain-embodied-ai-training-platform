import uuid
from typing import Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from fastapi import UploadFile
from app.models.user import AppUser
from app.models.model_type import ModelType
from app.schemas.model_type import ModelTypeCreate,ModelTypeCreateDB, ModelTypeUpdate, ModelTypePublic
from app.crud import crud_model_type

class ModelTypeService:
    def __init__(self, db_session: AsyncSession):
        self.db_session = db_session
        
    async def create_model_type(self, model_type_create: ModelTypeCreate) -> Optional[ModelType]:
        """
        创建模型类型的业务逻辑。
        - 构建 ModelType 对象
        - 调用 CRUD 层保存模型类型
        """
        # 1. 构建 ModelTypeCreateDB 对象传递给 CRUD 层
        model_type_create_db = ModelTypeCreateDB(
            type_name=model_type_create.type_name,
            description=model_type_create.description,
        )
        
        # 2. 调用 CRUD 层创建模型类型
        model_type = await crud_model_type.create_model_type(
            db_session=self.db_session,
            model_type_create_db=model_type_create_db
        )
        
        # 刷新模型类型对象以获取最新数据
        await self.db_session.refresh(model_type)
        
        return model_type

    async def get_model_types(self) -> list[ModelTypePublic]:
        """
        获取所有模型类型的业务逻辑。
        """
        model_types = await crud_model_type.get_all_model_types(db_session=self.db_session)
        return [mt for mt in model_types]