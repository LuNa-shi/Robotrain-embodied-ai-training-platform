import os
import mimetypes
import asyncio
from typing import Optional, Tuple
from miniopy_async.api import Minio
from miniopy_async.error import S3Error

# 导入 settings
from training_platform.configs.settings import settings

class _MinIOManager:
    """
    一个内部单例类，用于管理 MinIO 客户端的生命周期。
    对外部调用者透明。
    """
    _instance: Optional['_MinIOManager'] = None
    _lock = asyncio.Lock()

    def __init__(self):
        self.client: Optional[Minio] = None
        self._is_connecting = False

    @classmethod
    async def get_instance(cls) -> '_MinIOManager':
        if cls._instance is None:
            async with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    async def get_client_internal(self) -> Minio:
        if self.client is None:
            async with self._lock:
                if self.client is None:
                    if self._is_connecting:
                        while self._is_connecting:
                            await asyncio.sleep(0.1)
                        return self.client
                    self._is_connecting = True
                    try:
                        print(f"💡 正在连接到 MinIO 服务器: {settings.MINIO_URL} ...")
                        client = Minio(
                            endpoint=settings.MINIO_URL,
                            access_key=settings.MINIO_ACCESS_KEY,
                            secret_key=settings.MINIO_SECRET_KEY,
                            secure=False
                        )
                        await client.list_buckets()
                        self.client = client
                        print("✅ 成功连接到 MinIO 服务器！")
                    except Exception as e:
                        print(f"❌ 连接 MinIO 失败: {e}")
                        self.client = None
                        raise
                    finally:
                        self._is_connecting = False
        
        if not self.client:
            raise ConnectionError("无法建立 MinIO 连接")
        return self.client

# --- 以下是你原有的函数，我们保持接口不变，但内部实现调用Manager ---

# 包装 connect_minio 和 get_minio_client
async def connect_minio() -> Optional[Minio]:
    try:
        manager = await _MinIOManager.get_instance()
        return await manager.get_client_internal()
    except Exception as e:
        print(f"connect_minio 最终失败: {e}")
        return None

async def get_minio_client() -> Optional[Minio]:
    return await connect_minio()

# 其他函数保持完全不变，因为它们依赖传入的 client 对象
async def upload_model_to_minio(
    client: Minio,
    model_file_local_path: str,
    filename: str,
) -> Tuple[bool, str]:
    from training_platform.configs.settings import settings # 在函数内导入以避免循环依赖
    return await upload_file_to_minio(
        client=client,
        upload_file_local_path=model_file_local_path,
        filename=filename,
        bucket_name=settings.MINIO_BUCKET,
        object_dir=settings.MINIO_MODEL_DIR
    )
    
async def download_dataset_from_minio(
    client: Minio,
    download_local_path: str,
    dataset_name: str
) -> Tuple[bool, str]:
    from training_platform.configs.settings import settings # 在函数内导入以避免循环依赖
    return await download_file_from_minio(
        client=client,
        local_file_path=download_local_path,
        object_name=dataset_name,
        bucket_name=settings.MINIO_BUCKET,
        object_dir=settings.MINIO_DATASET_DIR
    )

async def download_file_from_minio(
    client: Minio,
    local_file_path: str,
    object_name: str,
    bucket_name: str,
    object_dir: str = "",
) -> Tuple[bool, str]:
    if not isinstance(client, Minio):
        return False, "传入的 MinIO 客户端无效或未初始化。"
    try:
        found = await client.bucket_exists(bucket_name)
        if not found:
            return False, f"桶 '{bucket_name}' 不存在。"
        full_object_name = f"{object_dir}/{object_name}"
        await client.fget_object(bucket_name, full_object_name, local_file_path)
        print(f"⬇️ 文件 '{full_object_name}' 已成功下载到 '{local_file_path}'。")
        return True, local_file_path
    except S3Error as e:
        error_msg = f"MinIO 下载失败: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg
    except Exception as e:
        error_msg = f"文件下载时发生意外错误: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg

async def upload_file_to_minio(
    client: Minio,
    upload_file_local_path: str,
    filename: str,
    bucket_name: str,
    object_dir: str = "",
) -> Tuple[bool, str]:
    if not isinstance(client, Minio):
        return False, "传入的 MinIO 客户端无效或未初始化。"
    try:
        found = await client.bucket_exists(bucket_name)
        if not found:
            await client.make_bucket(bucket_name)
            print(f"Bucket '{bucket_name}' 不存在，已自动创建。")

        object_name = f"{object_dir}/{filename}"
        content_type, _ = mimetypes.guess_type(upload_file_local_path)
        content_type = content_type or 'application/octet-stream'

        await client.fput_object(bucket_name, object_name, upload_file_local_path, content_type=content_type)
        print(f"✅ 文件 '{upload_file_local_path}' 已成功上传到 '{bucket_name}/{object_name}'。")
        return True, f"s3://{bucket_name}/{object_name}"
    except S3Error as e:
        error_msg = f"MinIO 上传失败: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg
    except Exception as e:
        error_msg = f"文件上传时发生意外错误: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg