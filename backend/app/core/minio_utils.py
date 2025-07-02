from typing import Optional, Tuple
from fastapi import UploadFile
from miniopy_async import Minio
from miniopy_async.error import S3Error
import mimetypes

from app.core.config import settings

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
    
async def upload_dataset_to_minio(
    client: Minio,
    dataset_file: UploadFile,
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
        upload_file=dataset_file,
        filename=filename,
        bucket_name=settings.MINIO_BUCKET, # 使用配置文件中的桶名
        object_dir=settings.MINIO_DATASET_DIR # 可以根据需要调整前缀
    )

async def delete_dataset_from_minio(
    client: Minio,
    dataset_uuid_str: str,
) -> Tuple[bool, str]:
    """
    从 MinIO 中删除指定的文件。

    Args:
        client (Minio): 已连接的异步 Minio 客户端实例。
        uuid_str (str): 数据集的 UUID 字符串，用于构建对象名称。
        bucket_name (str): 目标 MinIO 桶的名称。
        object_prefix (str): 对象在桶内的路径前缀。

    Returns:
        Tuple[bool, str]: 删除成功则返回 (True, "删除成功")，失败则返回 (False, 错误信息)。
    """
    return await delete_file_from_minio(
        client=client,
        bucket_name=settings.MINIO_BUCKET,
        object_name=f"{dataset_uuid_str}.zip",  # 假设数据集文件名为 UUID.zip
        object_dir=settings.MINIO_DATASET_DIR  # 使用配置文件中的数据集目录前缀
    )
  
async def upload_file_to_minio(
    client: Minio,
    upload_file: UploadFile,
    filename: str,
    bucket_name: str,
    object_dir: str = "", # 对象在桶内的前缀路径，例如 "images/" 或 "documents/"
) -> Tuple[bool, str]:
    """
    将 FastAPI UploadFile 对象的文件内容直接异步上传到 MinIO 的指定桶中。

    Args:
        client (Minio): 已连接的异步 Minio 客户端实例。
        upload_file (UploadFile): FastAPI 从前端接收到的 UploadFile 对象。
        filename (str): 上传文件在 MinIO 中保存的名称 (通常是原始文件名)。
                        建议在实际应用中确保其唯一性，例如加上UUID或时间戳。
        bucket_name (str): 目标 MinIO 桶的名称。如果不存在，函数会尝试创建。
        object_prefix (str): 文件在桶内的路径前缀。例如，如果设为 "docs/"，文件将存储为 "docs/your_file.txt"。
                              默认为空字符串（存储在桶的根目录）。
        content_type (Optional[str]): 文件的 MIME 类型。如果为 None，函数会尝试根据 filename 猜测，
                                      或使用 upload_file.content_type。

    Returns:
        Tuple[bool, str]: 上传成功则返回 (True, MinIO 中的对象完整路径)，失败则返回 (False, 错误信息)。
    """
    # 确保 MinIO 客户端已初始化
    if not isinstance(client, Minio): # 检查传入的client是否是Minio实例
        return False, "传入的 MinIO 客户端无效或未初始化。"

    # 构造 MinIO 中的对象完整路径
    # object_prefix 需要清理前后的斜杠，确保路径格式正确
    minio_object_name = f"{object_dir}/{filename}" if object_dir else filename

    # 确定文件内容类型：优先使用 UploadFile 提供的，否则就猜测
    final_content_type = upload_file.content_type
    if not final_content_type:
        guessed_type, _ = mimetypes.guess_type(filename)
        final_content_type = guessed_type if guessed_type else "application/octet-stream"
        print(f"💡 猜测文件 '{filename}' 的 MIME 类型为: {final_content_type}")
    else:
        print(f"💡 使用 UploadFile 提供的 MIME 类型: {final_content_type}")


    try:
        # 1. 检查桶是否存在，如果不存在则创建
        found = await client.bucket_exists(bucket_name)
        if not found:
            try:
                # 尝试创建桶
                await client.make_bucket(bucket_name)
                print(f"💡 桶 '{bucket_name}' 不存在，已创建。")
            except S3Error as e:
                error_msg = f"创建桶 '{bucket_name}' 失败: {e}"
                print(f"❌ {error_msg}")
                return False, error_msg
        else:
            print(f"✅ 桶 '{bucket_name}' 已存在。")

        # 2. 直接从 UploadFile 的文件对象中读取并上传到 MinIO
        # upload_file.file 是一个异步文件对象 (io.BytesIO 或类似的)
        # upload_file.size 是文件的大小
        await client.put_object(
            bucket_name,
            minio_object_name,
            upload_file.file,  # 直接传递 UploadFile 的文件流
            upload_file.size,  # MinIO 需要知道文件大小
            content_type=final_content_type
        )
        print(f"⬆️ 文件 '{filename}' (大小: {upload_file.size} bytes) 已成功异步上传到 '{bucket_name}/{minio_object_name}'。")
        return True, minio_object_name
    except S3Error as e:
        error_msg = f"MinIO 上传失败: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg
    except Exception as e:
        error_msg = f"文件上传时发生意外错误: {e}"
        print(f"❌ {error_msg},{bucket_name}")
        return False, error_msg
    
async def delete_file_from_minio(
    client: Minio,
    bucket_name: str,
    object_name: str,
    object_dir: str = ""  # 对象在桶内的前缀路径，例如 "images/" 或 "documents/"
) -> Tuple[bool, str]:
    """
    从 MinIO 中删除指定的文件。

    Args:
        client (Minio): 已连接的异步 Minio 客户端实例。
        bucket_name (str): 目标 MinIO 桶的名称。
        object_name (str): 要删除的对象名称（包括前缀）。
        object_prefix (str): 对象在桶内的路径前缀。例如，如果设为 "docs/"，则 object_name 应为 "docs/your_file.txt"。

    Returns:
        Tuple[bool, str]: 删除成功则返回 (True, "删除成功")，失败则返回 (False, 错误信息)。
    """
    if not isinstance(client, Minio):
        return False, "传入的 MinIO 客户端无效或未初始化。"

    # 确保 object_name 包含前缀
    full_object_name = f"{object_dir}/{object_name}" if object_dir else object_name

    try:
        await client.remove_object(bucket_name, full_object_name)
        print(f"✅ 文件 '{full_object_name}' 已成功从桶 '{bucket_name}' 中删除。")
        return True, "删除成功"
    except S3Error as e:
        error_msg = f"MinIO 删除失败: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg
    except Exception as e:
        error_msg = f"删除文件时发生意外错误: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg