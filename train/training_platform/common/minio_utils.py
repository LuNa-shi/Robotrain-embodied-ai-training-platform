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
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    @classmethod
    async def get_instance(cls) -> '_MinIOManager':
        if cls._instance is None:
            async with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    async def get_client(self) -> Optional[Minio]:
        current_loop = asyncio.get_running_loop()
        
        # 如果客户端不存在或者运行在不同的事件循环中，需要重新创建
        if (self.client is None or 
            self._loop is None or 
            self._loop != current_loop):
            
            await self._create_client_for_loop(current_loop)
        
        return self.client

    async def _create_client_for_loop(self, loop: asyncio.AbstractEventLoop):
        """为特定的事件循环创建MinIO客户端"""
        try:
            print(f"💡 为当前事件循环创建新的MinIO客户端...")
            
            # 关闭旧客户端（如果存在）
            if self.client:
                try:
                    if hasattr(self.client, '_http_session') and self.client._http_session:
                        await self.client._http_session.close()
                except Exception as e:
                    print(f"警告：关闭旧MinIO客户端时出错: {e}")

            # 为当前循环创建新客户端
            endpoint = f"{settings.MINIO_SERVER}:{settings.MINIO_PORT}"
            self.client = Minio(
                endpoint=endpoint,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=False  # 默认使用非安全连接
            )
            self._loop = loop
            
            print(f"✅ MinIO 客户端已为当前事件循环创建成功")
            
        except Exception as e:
            print(f"❌ 创建 MinIO 客户端失败: {e}")
            self.client = None
            self._loop = None
            raise

# 兼容性函数
async def connect_minio() -> Optional[Minio]:
    """
    连接到 MinIO，自动处理事件循环兼容性。
    返回 MinIO 客户端或 None（如果连接失败）
    """
    try:
        manager = await _MinIOManager.get_instance()
        return await manager.get_client()
    except Exception as e:
        print(f"❌ 连接 MinIO 失败: {e}")
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

async def upload_ckpt_to_minio(
    client: Minio,
    ckpt_file_local_path: str,
    filename: str,
) -> Tuple[bool, str]:
    from training_platform.configs.settings import settings # 在函数内导入以避免循环依赖
    return await upload_file_to_minio(
        client=client,
        upload_file_local_path=ckpt_file_local_path,
        filename=filename,
        bucket_name=settings.MINIO_BUCKET,
        object_dir=settings.MINIO_CKPT_DIR
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

async def download_ckpt_from_minio(
    client: Minio,
    download_local_path: str,
    ckpt_name: str
) -> Tuple[bool, str]:
    from training_platform.configs.settings import settings # 在函数内导入以避免循环依赖
    return await download_file_from_minio(
        client=client,
        local_file_path=download_local_path,
        object_name=ckpt_name,
        bucket_name=settings.MINIO_BUCKET,
        object_dir=settings.MINIO_CKPT_DIR
    )

async def list_objects_with_prefix(
    client: Minio,
    bucket_name: str,
    prefix: str = "",
) -> Tuple[bool, list]:
    """
    列出指定前缀的所有对象
    
    Args:
        client: MinIO 客户端
        bucket_name: 桶名称
        prefix: 对象前缀
        
    Returns:
        (success, object_list): 成功标志和对象列表
    """
    if not isinstance(client, Minio):
        return False, []
    
    try:
        found = await client.bucket_exists(bucket_name)
        if not found:
            return False, []
        
        objects = []
        async for obj in client.list_objects(bucket_name, prefix=prefix, recursive=True):
            objects.append(obj.object_name)
        
        return True, objects
    except S3Error as e:
        print(f"❌ MinIO 列出对象失败: {e}")
        return False, []
    except Exception as e:
        print(f"❌ 列出对象时发生意外错误: {e}")
        return False, []

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