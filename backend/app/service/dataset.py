from functools import partial
import uuid
from typing import Optional
from fastapi.responses import FileResponse
from sqlmodel.ext.asyncio.session import AsyncSession
from fastapi import UploadFile
from starlette.background import BackgroundTask
from app.models.user import AppUser
from app.models.dataset import Dataset
from app.schemas.dataset import DatasetCreate, DatasetCreateDB
from app.crud import crud_dataset
from app.core.minio_utils import upload_dataset_to_minio, get_minio_client, delete_dataset_from_minio
import zipfile
import io
import json
from typing import List
from app.core.minio_utils import download_dataset_file_from_zip_on_minio
import os

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
        total_episodes: int = 0
        total_chunks: int = 0
        video_keys: List[str] = []
        chunks_size: int = 0
        video_path: str = ""
        data_path: str = ""
        
        minio_client = await get_minio_client()

        #前面已经检验过UploadFile为zip格式，这里不再重复验证
        #把文件解压，获取压缩文件中meta/info.json文件，获取数据集的相关信息
        
        try:
            # 读取上传文件的内容到内存
            zip_content = await upload_file.read()
            zip_file_in_memory = io.BytesIO(zip_content)

            with zipfile.ZipFile(zip_file_in_memory, 'r') as zf:
                # 假设 info.json 在 zip 文件根目录下的 meta 文件夹中
                info_json_path = 'meta/info.json'
                if info_json_path in zf.namelist():
                    with zf.open(info_json_path, 'r') as info_file:
                        info_data = json.load(info_file)
                        # 你可以在这里使用 info_data 来更新 dataset_create 或进行其他逻辑
                        total_episodes = info_data.get("total_episodes", 0)
                        total_chunks = info_data.get("total_chunks", 0)
                        chunks_size = info_data.get("chunks_size", 0)
                        video_path = info_data.get("video_path", "")
                        data_path = info_data.get("data_path", "")
                        # 读取所有video_keys
                        features_dict = info_data.get("features", {})
                        if isinstance(features_dict, dict):
                            parsed_features = features_dict
                            for feature_name, feature_details in parsed_features.items():
                                # 假设你想读取 dtype 为 "video" 的项
                                if feature_details.get("dtype") == "video":
                                    print(f"  视频特征: {feature_name}, 详情: {feature_details}")
                                    video_keys.append(feature_name) 
                else:
                    print(f"Warning: {info_json_path} 未在 ZIP 文件中找到。")

        except zipfile.BadZipFile:
            print("上传的文件不是一个有效的 ZIP 文件。")
            return None 
        except KeyError:
            print(f"ZIP 文件中缺少预期的 {info_json_path} 文件。")
            return None 
        except json.JSONDecodeError:
            print(f"无法解析 {info_json_path}，文件内容不是有效的 JSON。")
            return None 
        except Exception as e:
            print(f"处理 ZIP 文件时发生未知错误: {e}")
            return None
        
        # 2. 构建 DatasetCreateDB 对象传递给 CRUD 层
        dataset_create_db = DatasetCreateDB(
            dataset_name=dataset_create.dataset_name,
            description=dataset_create.description,
            owner_id=user.id,
            dataset_uuid=new_uuid,
            total_episodes=total_episodes,
            total_chunks=total_chunks,
            video_keys=video_keys,
            chunks_size=chunks_size,
            video_path=video_path,
            data_path=data_path
        )
        # 3. 上传数据集文件到 MinIO
        if not minio_client:
            raise ValueError("MinIO 客户端未初始化，请检查配置。")
            return None 
        try:
            # 上传数据集到 MinIO
            upload_file.file.seek(0)  # 确保文件指针在开始位置
            success,_ = await upload_dataset_to_minio(minio_client, upload_file, str(new_uuid) + ".zip")
            if not success:
                print(f"上传数据集到 MinIO 失败: {upload_file.filename}")
                raise None
            print(f"数据集 '{upload_file.filename}' 已成功上传到 MinIO。")
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

    async def get_video_by_dataset_id_and_chunk_id_and_episode_id(
        self,
        dataset_id: int,
        chunck_id: int,
        view_point: str,
        episode_id: int
    ) -> Optional[FileResponse]:
        """
        根据数据集ID、块ID和片段ID获取视频文件。
        """
        dataset = await crud_dataset.get_dataset_by_id(
            db_session=self.db_session,
            dataset_id=dataset_id
        )
        if not dataset:
            print(f"数据集ID {dataset_id} 不存在。")
            return None
        
        # 获取视频文件路径
        video_path_template = dataset.video_path
        full_video_path = video_path_template.format(
            episode_chunk=chunck_id,
            video_key=view_point,
            episode_index=episode_id
        )
        # 从 MinIO 下载视频文件
        minio_client = await get_minio_client()
        if not minio_client:
            raise ValueError("MinIO 客户端未初始化，请检查配置。")
        try:
            success, video_file_path = await download_dataset_file_from_zip_on_minio(
                client=minio_client,
                dataset_uuid_str=str(dataset.dataset_uuid),
                file_path_in_zip=full_video_path,
            )
            if not success:
                print(f"从 MinIO 下载视频文件失败: {video_file_path}")
                return None
        except Exception as e:
            print(f"从 MinIO 下载视频文件失败: {e}")
            raise ValueError("视频文件下载失败，请稍后重试。")
        print(f"视频文件已成功下载: {video_file_path}")
        # 返回视频文件响应
        return FileResponse(video_file_path, 
                            media_type="video/mp4", 
                            filename=f"{dataset.dataset_name}_episode_{episode_id}_chunk_{chunck_id}.mp4",
                            background=BackgroundTask(os.remove, video_file_path))

    async def get_parquet_by_dataset_id_and_chunk_id_and_episode_id(
        self,
        dataset_id: int,
        chunck_id: int,
        episode_id: int
    ) -> Optional[FileResponse]:
        """
        根据数据集ID、块ID和片段ID获取视频文件。
        """
        dataset = await crud_dataset.get_dataset_by_id(
            db_session=self.db_session,
            dataset_id=dataset_id
        )
        if not dataset:
            print(f"数据集ID {dataset_id} 不存在。")
            return None
        
        # 获取视频文件路径
        data_path_template = dataset.data_path
        full_data_path = data_path_template.format(
            episode_chunk=chunck_id,
            episode_index=episode_id
        )
        # 从 MinIO 下载视频文件
        minio_client = await get_minio_client()
        if not minio_client:
            raise ValueError("MinIO 客户端未初始化，请检查配置。")
        try:
            success, parquet_file_path = await download_dataset_file_from_zip_on_minio(
                client=minio_client,
                dataset_uuid_str=str(dataset.dataset_uuid),
                file_path_in_zip=full_data_path,
            )
            if not success:
                print(f"从 MinIO 下载parquet文件失败: {parquet_file_path}")
                return None
        except Exception as e:
            print(f"从 MinIO 下载parquet文件失败: {e}")
            raise ValueError("parquet文件下载失败，请稍后重试。")
        print(f"parquet文件已成功下载: {parquet_file_path}")
        # 返回视频文件响应
        return FileResponse(parquet_file_path, 
                            media_type="application/octet-stream", 
                            filename=f"{dataset.dataset_name}_episode_{episode_id}_chunk_{chunck_id}.parquet",
                            background=BackgroundTask(os.remove, parquet_file_path))
        
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
                    dataset_uuid_str=str(uuid_to_delete.dataset_uuid)
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