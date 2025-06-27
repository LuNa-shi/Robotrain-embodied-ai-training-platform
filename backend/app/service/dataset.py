import uuid
from typing import Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from fastapi import UploadFile
from app.models.user import AppUser
from app.models.dataset import Dataset
from app.schemas.dataset import DatasetCreate, DatasetCreateDB
from app.crud import crud_dataset
from app.core.minio_utils import upload_dataset_to_minio, get_minio_client


class DatasetService:
    def __init__(self, db_session: AsyncSession): # 接收同步 Session
        self.db_session = db_session
        
    async def upload_dataset_for_user(self, user: AppUser, dataset_create: DatasetCreate, upload_file: UploadFile) -> Optional[Dataset]:
        """
        创建用户数据集的业务逻辑。
        - 检查用户是否存在
        - 构建 DatasetCreateDB 对象
        - 调用 CRUD 层保存数据集
        """
        # 1. 检查用户是否存在 (业务逻辑)
        if not user:
            return None
        
        new_uuid = uuid.uuid4()
        
        minio_client = await get_minio_client()
        
        # 2. 构建 DatasetCreateDB 对象传递给 CRUD 层
        dataset_create_db = DatasetCreateDB(
            dataset_name=dataset_create.dataset_name,
            description=dataset_create.description,
            owner_id=user.id,
            dataset_uuid=new_uuid
        )
        # 3. 上传数据集文件到 MinIO
        if not minio_client:
            raise ValueError("MinIO 客户端未初始化，请检查配置。")
        try:
            # 上传数据集到 MinIO
            await upload_dataset_to_minio(minio_client, upload_file, new_uuid)
        except Exception as e:
            # 处理上传错误
            print(f"上传数据集到 MinIO 失败: {e}")
            raise ValueError("数据集上传失败，请稍后重试。")
        
        # 3. 调用 CRUD 层创建数据集
        dataset = await crud_dataset.create_dataset(
            db_session=self.db_session,
            dataset_create_db=dataset_create_db
        )
        
        
        # 提交事务
        await self.db_session.commit()
        # 刷新数据集对象以获取最新数据
        await self.db_session.refresh(dataset)
        await self.db_session.refresh(user)
        
        # 4. 返回新创建的数据集
        return dataset
        