import os
import mimetypes
import asyncio
from typing import Optional, Tuple
from miniopy_async.api import Minio
from miniopy_async.error import S3Error

# 导入 settings
from training_platform.configs.settings import settings

class _MinIOManager:
    _instance: Optional['_MinIOManager'] = None
    _lock = asyncio.Lock()

    def __init__(self):
        self.client: Optional[Minio] = None
        self._is_connecting = False

    @classmethod
    async def get_instance(cls) -> '_MinIOManager':
        # (这个方法保持不变)
        if cls._instance is None:
            async with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    async def get_client_internal(self) -> Minio:
        # 检查连接是否已关闭或不存在
        client_is_invalid = self.client is None
        if self.client and hasattr(self.client, '_http') and self.client._http:
             client_is_invalid = self.client._http.is_closed()
        
        if client_is_invalid:
            async with self._lock:
                # 再次检查，防止在等待锁时连接已被其他协程建立
                client_is_invalid_again = self.client is None
                if self.client and hasattr(self.client, '_http') and self.client._http:
                    client_is_invalid_again = self.client._http.is_closed()
                
                if client_is_invalid_again:
                    if self._is_connecting:
                        while self._is_connecting:
                            await asyncio.sleep(0.1)
                        # 在等待后，另一个协程可能已经成功连接，直接返回
                        if self.client and not self.client._http.is_closed():
                            return self.client
                        else:
                            # 如果等待后仍然连接失败，则抛出异常
                            raise ConnectionError("另一个协程尝试连接失败。")

                    self._is_connecting = True
                    try:
                        print(f"💡 正在连接到 MinIO 服务器: {settings.MINIO_URL} ...")
                        client = Minio(
                            endpoint=settings.MINIO_URL,
                            access_key=settings.MINIO_ACCESS_KEY,
                            secret_key=settings.MINIO_SECRET_KEY,
                            secure=False
                        )
                        # 使用一个轻量级的操作作为健康检查
                        await client.bucket_exists("health-check-bucket-that-may-not-exist")
                        self.client = client
                        print("✅ 成功连接到 MinIO 服务器！")
                    except Exception as e:
                        print(f"❌ 连接 MinIO 失败。原始错误: {e}")
                        self.client = None
                        # --- 关键修改：直接抛出异常 ---
                        raise ConnectionError(f"无法连接到 MinIO 服务器 at {settings.MINIO_URL}") from e
                    finally:
                        self._is_connecting = False
        
        # 能走到这里，self.client 一定是一个有效的对象
        return self.client

# --- 函数接口 ---

# --- 关键修改：让函数在失败时抛出异常，而不是返回 None ---
async def get_minio_client() -> Minio:
    """
    获取一个保证可用的 MinIO 客户端。如果无法连接，则抛出 ConnectionError。
    """
    manager = await _MinIOManager.get_instance()
    return await manager.get_client_internal()

async def connect_minio() -> Minio:
    """
    连接到 MinIO。这是 get_minio_client 的别名。
    """
    return await get_minio_client()



# 其他函数保持完全不变，因为它们依赖传入的 client 对象
async def upload_model_to_minio(
    client: Minio,
    dataset_file_local_path: str,
    filename: str,
) -> Tuple[bool, str]:
    from training_platform.configs.settings import settings # 在函数内导入以避免循环依赖
    return await upload_file_to_minio(
        client=client,
        upload_file_local_path=dataset_file_local_path,
        filename=filename,
        bucket_name=settings.MINIO_MODEL_BUCKET,
        object_prefix="models/"
    )

async def download_file_from_minio(
    client: Minio,
    bucket_name: str,
    object_name: str,
    local_file_path: str
) -> Tuple[bool, str]:
    if not isinstance(client, Minio):
        return False, "传入的 MinIO 客户端无效或未初始化。"
    try:
        found = await client.bucket_exists(bucket_name)
        if not found:
            return False, f"桶 '{bucket_name}' 不存在。"
        await client.fget_object(bucket_name, object_name, local_file_path)
        print(f"⬇️ 文件 '{object_name}' 已成功下载到 '{local_file_path}'。")
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
    object_prefix: str = "",
) -> Tuple[bool, str]:
    if not isinstance(client, Minio):
        return False, "传入的 MinIO 客户端无效或未初始化。"
    try:
        found = await client.bucket_exists(bucket_name)
        if not found:
            await client.make_bucket(bucket_name)
            print(f"Bucket '{bucket_name}' 不存在，已自动创建。")

        object_name = f"{object_prefix}{filename}"
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