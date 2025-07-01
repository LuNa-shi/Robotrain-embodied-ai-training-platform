from typing import Optional, Tuple
from miniopy_async import Minio
from miniopy_async.error import S3Error
import mimetypes

from settings import settings

minio_client: Optional[Minio] = None

async def get_minio_client() -> Optional[Minio]:
    """提供已创建的 MinIO 客户端实例"""
    client = await connect_minio()
    if not client:
        raise ValueError("MinIO 客户端未初始化，请检查配置")
    return client

async def connect_minio()->Optional[Minio]:
    """
    连接到 MinIO 服务器。

    Args:
        endpoint (str): MinIO 服务器的地址和端口 (例如 'play.min.io' 或 'localhost:9000')。
        access_key (str): MinIO 访问密钥。
        secret_key (str): MinIO 秘密密钥。

    Returns:
        minio.Minio: 连接成功的 MinIO 客户端对象，如果连接失败则返回 None。
    """
    global minio_client
    if minio_client is not None:
        print("MinIO 客户端已存在，直接返回。")
        return minio_client
    try:
        # 使用 secure=False 如果你的 MinIO 服务器没有启用 HTTPS
        # 如果是 HTTPS，则 secure=True
        minio_client = Minio(
            endpoint = settings.MINIO_URL,
            access_key= settings.MINIO_ACCESS_KEY,
            secret_key= settings.MINIO_SECRET_KEY,
            secure=False  # 根据你的 MinIO 配置调整
        )
        print(f"💡 正在连接到 MinIO 服务器: {settings.MINIO_URL} ...")
        # 测试连接
        await minio_client.list_buckets()  # 列出桶以验证连接是否成功
        if not minio_client:
            print("MinIO 客户端连接失败！")
        else:
            print("成功连接到 MinIO 服务器！")
    except S3Error as e:
        print(f"连接 MinIO 失败: {e}")
    except Exception as e:
        print(f"发生错误: {e}")
    
async def upload_model_to_minio(
    client: Minio,
    dataset_file_local_path: str,
    filename: str,
) -> Tuple[bool, str]:
    """
    将 FastAPI UploadFile 对象的文件内容直接异步上传到 MinIO 的指定桶中。

    Args:
        client (Minio): 已连接的异步 Minio 客户端实例。
        dataset_file (UploadFile): FastAPI 从前端接收到的 UploadFile 对象。

    Returns:
        Tuple[bool, str]: 上传成功则返回 (True, MinIO 中的对象完整路径)，失败则返回 (False, 错误信息)。
    """

    return await upload_file_to_minio(
        client=client,
        upload_file_local_path=dataset_file_local_path,
        filename=filename,
        bucket_name=settings.DATASET_BUCKET, # 使用配置文件中的桶名
        object_prefix="models/" # 可以根据需要调整前缀
    )
    
async def download_file_from_minio(
    client: Minio,
    bucket_name: str,
    object_name: str,
    local_file_path: str
) -> Tuple[bool, str]:
    """从 MinIO 桶中下载指定对象到本地文件系统。
    Args:
        client (Minio): 已连接的异步 Minio 客户端实例。 
        bucket_name (str): MinIO 桶的名称。
        object_name (str): MinIO 中的对象名称（包括前缀路径）。
        local_file_path (str): 本地文件系统中保存下载文件的路径。
    Returns:
        Tuple[bool, str]: 下载成功则返回 (True, 本地文件路径)，失败则返回 (False, 错误信息)。
    """
    if not isinstance(client, Minio):
        return False, "传入的 MinIO 客户端无效或未初始化。"

    try:
        # 检查桶是否存在
        found = await client.bucket_exists(bucket_name)
        if not found:
            return False, f"桶 '{bucket_name}' 不存在。"

        # 下载对象到本地文件
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
    object_prefix: str = "", # 对象在桶内的前缀路径，例如 "images/" 或 "documents/"
) -> Tuple[bool, str]:
    """
    将本地文件异步上传到 MinIO 的指定桶中。

    Args:
        client (Minio): 已连接的异步 Minio 客户端实例。
        upload_file_local_path (str): 本地文件系统中要上传的文件路径。
        filename (str): 上传到 MinIO 时使用的文件名。
        bucket_name (str): MinIO 桶的名称。
        object_prefix (str): 对象在桶内的前缀路径，例如 "images/" 或 "documents/"。

    Returns:
        Tuple[bool, str]: 上传成功则返回 (True, MinIO 中的对象完整路径)，失败则返回 (False, 错误信息)。
    """
    if not isinstance(client, Minio):
        return False, "传入的 MinIO 客户端无效或未初始化。"

    try:
        # 检查桶是否存在
        found = await client.bucket_exists(bucket_name)
        if not found:
            return False, f"桶 '{bucket_name}' 不存在。"

        # 确定对象名称
        object_name = f"{object_prefix}{filename}"

        # 获取文件的 MIME 类型
        content_type, _ = mimetypes.guess_type(upload_file_local_path)
        content_type = content_type or 'application/octet-stream'  # 默认类型

        # 异步上传文件
        await client.fput_object(bucket_name, object_name, upload_file_local_path, content_type=content_type)
        
        print(f"✅ 文件 '{upload_file_local_path}' 已成功上传到 MinIO 桶 '{bucket_name}'，对象名称为 '{object_name}'。")
        return True, f"{settings.MINIO_URL}/{bucket_name}/{object_name}"
    except S3Error as e:
        error_msg = f"MinIO 上传失败: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg
    except Exception as e:
        error_msg = f"文件上传时发生意外错误: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg