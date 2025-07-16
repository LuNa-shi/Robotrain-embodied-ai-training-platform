from typing import List, Optional, Tuple
from fastapi import UploadFile
from fastapi.responses import FileResponse
from miniopy_async import Minio
from miniopy_async.api import ListObjects
from miniopy_async.error import S3Error
import mimetypes
import threading
import time

from app.core.config import settings

minio_client: Optional[Minio] = None

# 文件锁字典，用于防止并发访问同一ZIP文件
_zip_file_locks: dict = {}
_lock_dict_lock = threading.Lock()

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
    

async def get_sub_file_of_eval_task_dir(
    eval_task_id: int,
    client: Minio
) -> Optional[List[str]]:
    """
    获取指定评估任务目录下的所有子文件名。

    Args:
        eval_task_id (int): 评估任务的唯一标识符。
        client (Minio): 已连接的 MinIO 客户端实例。

    Returns:
        Optional[List[str]]: 返回子文件名列表，如果目录不存在或发生错误则返回 None。
    """
    if not client:
        print("MinIO 客户端未初始化，请先连接。")
        return None
    
    try:
        # 构造评估任务目录路径
        eval_task_dir = f"{settings.MINIO_EVAL_DIR}/{eval_task_id}/"
        # 列出目录下的所有对象
        objects: ListObjects = client.list_objects(
            bucket_name=settings.MINIO_BUCKET,
            prefix=eval_task_dir,
            recursive=True
        )
        obj_iter = objects.gen_iterator()
        # 提取文件名
        sub_files = []
        async for obj in obj_iter: # 直接遍历 objects 对象，它本身就是异步可迭代的
            if obj.object_name != eval_task_dir:
                sub_files.append(obj.object_name.split('/')[-1])
        
        return sub_files if sub_files else None
    except S3Error as e:
        print(f"获取评估任务目录下的子文件失败: {e}")
        return None
    
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
    
    success, result = await upload_file_to_minio(
        client=client,
        upload_file=dataset_file,
        filename=filename,
        bucket_name=settings.MINIO_BUCKET, # 使用配置文件中的桶名
        object_dir=settings.MINIO_DATASET_DIR # 可以根据需要调整前缀
    )
    if success:
        print(f"✅ 数据集 '{filename}' 已成功上传到 MinIO: {result}")
        return True, result
    else:
        print(f"❌ 上传数据集 '{filename}' 失败: {result}")
        return False, result

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
  
async def download_model_from_minio(
    client: Minio,
    task_id: int
) -> Tuple[bool, str]:
    """
    从 MinIO 中下载指定的模型文件。
    Args:
        client (Minio): 已连接的异步 Minio 客户端实例。
        local_path (str): 本地保存模型文件的路径。
        task_id (int): 任务 ID，用于获取模型
    Returns:
        Tuple[bool, str]: 下载成功则返回 (True, 本地文件路径)，
                          失败则返回 (False, 错误信息)。
    """
    ckpt_dir_path = f"checkpoints/{task_id}"
    # 需要下载minio这个文件夹下的所有文件，暂时不知道文件夹下的文件名
    try:
        # 确保客户端已连接
        if not isinstance(client, Minio):
            return False, "传入的 MinIO 客户端无效或未初始化。"

        # 使用 list_objects 获取所有对象
        objects = client.list_objects(
            bucket_name=settings.MINIO_BUCKET,
            prefix=ckpt_dir_path,
            recursive=True
        )
        print(f"正在下载任务 {task_id} 的模型文件...")
        # 把对象列表转换为列表
        objects = [obj async for obj in objects]

        # 下载每个对象到本地路径
        for obj in objects:
            if obj.object_name == ckpt_dir_path:
                continue
            object_name = obj.object_name
            
            tmp_ckpt_path = f"{settings.BACKEND_TMP_BASE_DIR}/ckpts/{task_id}/{object_name.split('/')[-1]}"  # 保留文件名
            # 确保存在这个文件夹
            import os
            os.makedirs(os.path.dirname(tmp_ckpt_path), exist_ok=True)
            success, message = await download_file_from_minio(
                client=client,
                local_path=tmp_ckpt_path,
                bucket_name=settings.MINIO_BUCKET,
                object_name=object_name,
                object_dir=""
            )
            if not success:
                return False, message
        
        # 把这些文件打包成一个 zip 文件
        import zipfile
        import os
        zip_file_path = f"{settings.BACKEND_TMP_BASE_DIR}/ckpts/{task_id}.zip"
        os.makedirs(os.path.dirname(zip_file_path), exist_ok=True)
        with zipfile.ZipFile(zip_file_path, 'w') as zipf:
            # 遍历临时目录下的所有文件，添加到 ZIP 中
            tmp_ckpt_dir = f"{settings.BACKEND_TMP_BASE_DIR}/ckpts/{task_id}"
            for root, _, files in os.walk(tmp_ckpt_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    # 添加到 ZIP 文件中，保持相对路径
                    zipf.write(file_path, arcname=os.path.relpath(file_path, tmp_ckpt_dir))
        # 返回打包后的 zip 文件路径
        zip_local_path = f"{settings.BACKEND_TMP_BASE_DIR}/ckpts/{task_id}.zip"
        print(f"✅ 模型文件已成功下载到本地目录: {zip_local_path}")
        # 删除临时的单个模型文件
        tmp_ckpt_dir = f"{settings.BACKEND_TMP_BASE_DIR}/ckpts/{task_id}"
        if os.path.exists(tmp_ckpt_dir):
            import shutil
            shutil.rmtree(tmp_ckpt_dir)
            print(f"🗑️ 已删除临时模型文件夹: {tmp_ckpt_dir}")
        return True, zip_local_path
    except Exception as e:
        error_msg = f"MinIO 下载失败: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg
        
    
    
async def download_dataset_file_from_zip_on_minio(
    client: Minio,
    dataset_uuid_str: str,
    file_path_in_zip: str
) -> Tuple[bool, str]:
    """
    从 MinIO 中下载指定数据集的 ZIP 文件中的某个文件。
    Args:
        client (Minio): 已连接的异步 Minio 客户端实例。
        dataset_uuid_str (str): 数据集的 UUID 字符串，用于构建对象名称。
        file_path_in_zip (str): ZIP 文件中要下载的文件路径。
    Returns:
        Tuple[bool, str]: 下载成功则返回 (True, 本地文件路径)，
                          失败则返回 (False, 错误信息)。
    """
    zip_tmp_path = f"{settings.BACKEND_TMP_BASE_DIR}/dataset_zip/{dataset_uuid_str}.zip"
    
    # 获取或创建文件锁
    with _lock_dict_lock:
        if dataset_uuid_str not in _zip_file_locks:
            _zip_file_locks[dataset_uuid_str] = threading.Lock()
        file_lock = _zip_file_locks[dataset_uuid_str]
    
    # 使用文件锁确保同一ZIP文件的并发安全
    with file_lock:
        # 保证存在文件夹
        import os
        os.makedirs(os.path.dirname(zip_tmp_path), exist_ok=True)
        
        # 检查ZIP文件是否已存在
        if os.path.exists(zip_tmp_path):
            print(f"📦 ZIP文件已存在，跳过下载: {zip_tmp_path}")
        else:
            # 把zip下载下来
            success, message = await download_dataset_from_minio(
                client=client,
                local_path=zip_tmp_path,
                dataset_uuid_str=dataset_uuid_str
            )
            if not success:
                return False, message
    # 解压 ZIP 文件并获取指定文件
    try:
        import zipfile
        with zipfile.ZipFile(zip_tmp_path, 'r') as zip_ref:
            # 检查文件是否在 ZIP 中
            if file_path_in_zip not in zip_ref.namelist():
                error_msg = f"文件 '{file_path_in_zip}' 不存在于 ZIP 文件 '{zip_tmp_path}' 中。"
                print(f"❌ {error_msg}")
                return False, error_msg
            
            # 解压指定文件到本地路径
            zip_ref.extract(file_path_in_zip, path=settings.BACKEND_TMP_BASE_DIR)
            extracted_file_path = f"{settings.BACKEND_TMP_BASE_DIR}/{file_path_in_zip}"
            print(f"✅ 文件 '{file_path_in_zip}' 已成功从 ZIP 文件 '{zip_tmp_path}' 解压到: {extracted_file_path}")
            return True, extracted_file_path
    except zipfile.BadZipFile as e:
        error_msg = f"ZIP 文件 '{zip_tmp_path}' 无效: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg
    except Exception as e:
        error_msg = f"处理 ZIP 文件时发生错误: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg
    # 清理临时 ZIP 文件 - 使用引用计数机制
    finally:
        import os
        import asyncio
        
        # 使用引用计数机制，只有当没有其他请求在使用时才删除
        async def smart_cleanup():
            # 等待一段时间，让其他可能的并发请求完成
            await asyncio.sleep(2)
            
            # 再次检查是否有其他请求在使用这个文件
            with _lock_dict_lock:
                if dataset_uuid_str in _zip_file_locks:
                    # 如果锁还在使用中，说明还有请求，不删除
                    return
            
            # 没有其他请求了，可以安全删除
            if os.path.exists(zip_tmp_path):
                os.remove(zip_tmp_path)
                print(f"🗑️ 已删除临时 ZIP 文件: {zip_tmp_path}")
                
                # 清理锁
                with _lock_dict_lock:
                    if dataset_uuid_str in _zip_file_locks:
                        del _zip_file_locks[dataset_uuid_str]
            else:
                print(f"⚠️ 临时 ZIP 文件不存在: {zip_tmp_path}")
        
        # 创建后台任务进行清理
        asyncio.create_task(smart_cleanup())
            
    
    
async def download_dataset_from_minio(
    client: Minio,
    local_path: str,
    dataset_uuid_str: str
) -> Tuple[bool, str]:
    """
    从 MinIO 中下载指定的数据集 ZIP 文件。

    Args:
        client (Minio): 已连接的异步 Minio 客户端实例。
        local_path (str): 本地保存数据集 ZIP 文件的路径。
        dataset_uuid_str (str): 数据集的 UUID 字符串，用于构建对象名称。

    Returns:
        Tuple[bool, str]: 下载成功则返回 (True, 本地文件路径)，失败则返回 (False, 错误信息)。
    """
    try:
        # 确保客户端已连接
        if not isinstance(client, Minio):
            return False, "传入的 MinIO 客户端无效或未初始化。"

        # 构造对象名称
        object_name = f"{dataset_uuid_str}.zip"  # 假设数据集文件名为 UUID.zip
        # 使用download_file_from_minio函数下载文件
        success, message = await download_file_from_minio(
            client=client,
            local_path=local_path,
            bucket_name=settings.MINIO_BUCKET,  # 使用配置文件中的桶名
            object_name=object_name,
            object_dir=settings.MINIO_DATASET_DIR  # 使用配置文件中的数据集目录前缀
        )
        if success:
            print(f"✅ 数据集 '{dataset_uuid_str}' 已成功下载到本地: {local_path}")
            return True, local_path
        else:
            print(f"❌ 下载数据集 '{dataset_uuid_str}' 失败: {message}")
            return False, message
    except S3Error as e:
        error_msg = f"MinIO 下载失败: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg
    except Exception as e:
        error_msg = f"下载数据集时发生意外错误: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg
    

        
async def download_eval_task_result_from_minio(
    client: Minio,
    eval_task_id: int,
    local_path: str
) -> Optional[str]:
    """
    - 下载评估任务结果。
    - 检查评估任务是否存在
    - 调用 MinIO 客户端下载文件
    """
    path_in_minio = f"evals/{eval_task_id}/result.zip"  # 假设评估任务结果存储在这个路径
    success, message = await download_file_from_minio(
        client=client,
        local_path=local_path,
        bucket_name=settings.MINIO_BUCKET,  # 使用配置文件中的桶名
        object_name=path_in_minio,
        object_dir=""  # 假设没有额外的目录前缀
    )
    if success:
        print(f"✅ 评估任务结果已成功下载到本地: {local_path}")
        return local_path
    else:
        print(f"❌ 下载评估任务结果失败: {message}")
        return None
            
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
    
async def download_file_from_minio(
    client: Minio,
    local_path: str,
    bucket_name: str,
    object_name: str,
    object_dir: str = ""  # 对象在桶内的前缀路径
) -> Tuple[bool, str]:
    """
    从 MinIO 中下载指定的文件。

    Args:
        client (Minio): 已连接的异步 Minio 客户端实例。
        local_path (str): 本地保存文件的路径。
        bucket_name (str): 目标 MinIO 桶的名称。
        object_name (str): 要下载的对象名称（包括前缀）。
        object_dir (str): 对象在桶内的路径前缀。例如，如果设为 "docs/"，则 object_name 应为 "docs/your_file.txt"。

    Returns:
        Tuple[bool, str]: 下载成功则返回 (True, 本地文件路径)，失败则返回 (False, 错误信息)。
    """
    if not isinstance(client, Minio):
        return False, "传入的 MinIO 客户端无效或未初始化。"

    # 确保 object_name 包含前缀
    full_object_name = f"{object_dir}/{object_name}" if object_dir else object_name

    try:
        response = await client.get_object(bucket_name, full_object_name)
        
        with open(local_path, 'wb') as file:
            data = await response.read()
            file.write(data)

        print(f"✅ 文件 '{full_object_name}' 已成功下载到本地: {local_path}")
        return True, local_path
    except S3Error as e:
        error_msg = f"MinIO 下载失败: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg
    except Exception as e:
        error_msg = f"下载文件时发生意外错误: {e}"
        print(f"❌ {error_msg}")
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