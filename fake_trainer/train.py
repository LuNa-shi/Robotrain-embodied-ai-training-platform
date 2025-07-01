import asyncio
from uuid import uuid4
from minio_utils import upload_file_to_minio, download_file_from_minio,get_minio_client
from rabbitmq_utils import send_status_message, send_log_message
async def fake_train(task_id: int, model_type: str, dataset_uuid: str, hyperparam: dict, owner_id: int):
    """
    模拟训练过程的异步函数。
    :param task_id: 任务 ID
    :param dataset_uuid: 数据集 UUID
    :param hyperparam: 超参数字典
    """
    print(f"Starting fake training for task ID: {task_id}, dataset UUID: {dataset_uuid}, hyperparameters: {hyperparam}")
    # 获取 MinIO 客户端
    minio_client = await get_minio_client()
    if not minio_client:
        print("MinIO 客户端连接失败！")
        return
    await download_file_from_minio(
        client=minio_client,        
        bucket_name="robotrain",
        object_name=f"datasets/{dataset_uuid}.zip",
        local_file_path=f"{task_id}.zip"
    )
    # 先睡个5秒，模拟排队等待训练
    await asyncio.sleep(5)
    # 加入训练任务，rabbitmq发送消息
    await send_status_message(task_id=task_id, status="running", uuid=None)

    print(flush=True)
    # 模拟训练过程,训练10秒，每隔一秒发送一次状态消息
    for i in range(10):
        await asyncio.sleep(1)
        # 发送训练状态消息
        await send_log_message(epoch=i, loss=0.1 * (10 - i), 
                         accuracy=0.1 * (i + 1),
                         log_message=f"Epoch {i} completed, loss: {0.1 * (10 - i)}, accuracy: {0.1 * (i + 1)}")
        print(flush=True)
    # 训练完成
    model_uuid = str(uuid4())
    
    # 模拟上传模型文件到 MinIO
    await upload_file_to_minio(
        client=minio_client,
        upload_file_local_path=f"{task_id}.zip",
        filename=f"{model_uuid}.zip",
        bucket_name="robotrain",
        object_prefix="models/"
    )
    await send_status_message(task_id=task_id, status="completed")
    # 删除本地的模型文件
    import os
    if os.path.exists(f"{task_id}.zip"):
        os.remove(f"{task_id}.zip")
    print(f"Fake training for task ID: {task_id} completed, model UUID: {model_uuid}")
    # 发送训练完成消息
    
    print("Training completed successfully.", flush=True)
    