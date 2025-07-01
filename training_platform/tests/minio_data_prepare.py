import asyncio
import os
import uuid
from zipfile import ZipFile

# 导入你的 utils，我们需要能够连接到 MinIO
# 使用绝对路径，以便脚本可以在任何地方运行
from training_platform.common.minio_utils import get_minio_client
from training_platform.configs.settings import settings

async def setup_minio():
    """
    连接到 MinIO，创建必要的 buckets，并上传一个假的“数据集”文件。
    返回上传的数据集文件的 UUID。
    """
    print("--- 1. Preparing MinIO Environment ---")
    minio_client = await get_minio_client()
    if not minio_client:
        print("❌ Fatal: Could not connect to MinIO. Aborting setup.")
        return None

    # 1. 确保所有需要的 buckets 都存在
    buckets_to_create = [
        settings.MINIO_DATASET_BUCKET,
        settings.MINIO_MODEL_BUCKET,
        settings.MINIO_CHECKPOINT_BUCKET, # 如果未来会用到
    ]
    for bucket_name in buckets_to_create:
        try:
            found = await minio_client.bucket_exists(bucket_name)
            if not found:
                await minio_client.make_bucket(bucket_name)
                print(f"✅ Bucket '{bucket_name}' created.")
            else:
                print(f"ℹ️ Bucket '{bucket_name}' already exists.")
        except Exception as e:
            print(f"❌ Error creating bucket '{bucket_name}': {e}")
            return None

    # 2. 创建并上传一个假的本地数据集文件
    dataset_uuid = str(uuid.uuid4())
    local_zip_filename = f"{dataset_uuid}.zip"
    
    # 在内存中创建一个假的 zip 文件
    with ZipFile(local_zip_filename, 'w') as zipf:
        zipf.writestr("data.txt", "This is fake dataset content.")
    
    print(f"📦 Created fake dataset file: {local_zip_filename}")

    # 3. 上传这个文件到 MinIO
    try:
        await minio_client.fput_object(
            bucket_name=settings.MINIO_DATASET_BUCKET,
            object_name=local_zip_filename, # object_name 就是 s3 中的文件名
            file_path=local_zip_filename
        )
        print(f"✅ Uploaded fake dataset to MinIO: s3://{settings.MINIO_DATASET_BUCKET}/{local_zip_filename}")
    except Exception as e:
        print(f"❌ Error uploading fake dataset: {e}")
        dataset_uuid = None
    finally:
        # 清理本地临时文件
        if os.path.exists(local_zip_filename):
            os.remove(local_zip_filename)

    print("--- MinIO Environment is Ready ---")
    return dataset_uuid

if __name__ == "__main__":
    test_uuid = asyncio.run(setup_minio())
    if test_uuid:
        print(f"\nGenerated Test Dataset UUID: {test_uuid}")
        print("You can now use this UUID to run your tests.")