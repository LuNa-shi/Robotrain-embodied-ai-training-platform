import uuid
from typing import Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from fastapi import UploadFile
from app.models.user import AppUser
from app.models.dataset import Dataset
from app.schemas.dataset import DatasetCreate, DatasetCreateDB
from app.crud import crud_dataset
from app.core.minio_utils import upload_dataset_to_minio, get_minio_client, delete_dataset_from_minio


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
            print("用户不存在，无法创建数据集")
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
            await upload_dataset_to_minio(minio_client, upload_file, str(new_uuid) + ".zip")
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

    async def get_datasets_by_user_id(self, user_id: int) -> list[Dataset]:
        """
        根据用户ID获取该用户的所有数据集。
        """
        datasets = await crud_dataset.get_datasets_by_user_id(
            db_session=self.db_session,
            user_id=user_id
        )
        return datasets
    
    async def get_dataset_by_id(self, dataset_id: int) -> Optional[Dataset]:
        """
        根据数据集ID获取数据集详情。
        """
        dataset = await crud_dataset.get_dataset_by_id(
            db_session=self.db_session,
            dataset_id=dataset_id
        )
        return dataset
    
    async def delete_dataset_by_id(self, dataset_id: int) -> Optional[Dataset]:
        """
        根据数据集ID删除数据集。
        """
        uuid_to_delete = await crud_dataset.get_dataset_by_id(
            db_session=self.db_session,
            dataset_id=dataset_id
        )
        deleted_dataset = await crud_dataset.delete_dataset(
            db_session=self.db_session,
            dataset_id=dataset_id
        )
        if deleted_dataset:
            # 删除数据集文件
            minio_client = await get_minio_client()
            if not minio_client:
                raise ValueError("MinIO 客户端未初始化，请检查配置。")
            try:
                # 删除 MinIO 中的数据集文件
                await delete_dataset_from_minio(
                    client=minio_client,
                    uuid_str=str(uuid_to_delete.dataset_uuid)
                )
            except Exception as e:
                # 处理删除错误
                print(f"从 MinIO 删除数据集文件失败: {e}")
                raise ValueError("数据集文件删除失败，请稍后重试。")
            print(f"数据集文件 {str(uuid_to_delete.dataset_uuid)}.zip 已从 MinIO 删除。")
            # 提交事务
            await self.db_session.commit()
            return deleted_dataset
        else:
            return None 