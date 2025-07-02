import asyncio
import os
import shutil
import uuid
import json
from pathlib import Path
import ray

# --- Hugging Face Imports ---
from huggingface_hub import snapshot_download

# --- Your Project Imports ---
# 确保Python的搜索路径正确，如果从根目录运行，通常需要这样
import sys
sys.path.append('.')

from training_platform.trainer.lerobot_train_actor import TrainerActor
from training_platform.common.task_models import TrainingTask
from training_platform.common.minio_utils import get_minio_client
from training_platform.configs.settings import settings

# --- Test Configuration ---
TEST_UUID = str(uuid.uuid4())
DATASET_REPO_ID = "lerobot/aloha_sim_insertion_human"
LOCAL_TEMP_DIR = Path("./tmp_simple_test")

# --- Step 1: Data Preparation Function ---
async def prepare_dataset_in_minio(client):
    """
    Downloads dataset from Hugging Face, zips it, and uploads to MinIO.
    """
    print("--- STEP 1: PREPARING DATASET IN MINIO ---")
    
    # MinIO 配置
    bucket_name = settings.MINIO_DATASET_BUCKET
    object_name = f"datasets/{DATASET_REPO_ID.split('/')[-1]}.zip"

    # 检查 MinIO 中是否已存在，如果存在则跳过
    try:
        await client.stat_object(bucket_name, object_name)
        print(f"✅ Dataset '{object_name}' already exists in MinIO bucket '{bucket_name}'. Skipping preparation.")
        return
    except Exception:
        print(f"Dataset not found in MinIO. Starting download and upload process...")

    # 准备本地临时目录
    local_dataset_path = LOCAL_TEMP_DIR / "dataset"
    local_zip_path = LOCAL_TEMP_DIR / "dataset.zip"
    LOCAL_TEMP_DIR.mkdir(exist_ok=True, parents=True)

    try:
        # 下载
        print(f"Downloading '{DATASET_REPO_ID}' from Hugging Face...")
        snapshot_download(
            repo_id=DATASET_REPO_ID,
            repo_type="dataset",
            local_dir=str(local_dataset_path),
            local_dir_use_symlinks=False,
            resume_download=True,  
        )
        print("Download complete.")

        # 压缩
        print("Zipping dataset folder...")
        shutil.make_archive(str(local_dataset_path), 'zip', root_dir=str(local_dataset_path))
        shutil.move(f"{local_dataset_path}.zip", local_zip_path)
        print("Zipping complete.")

        # 上传
        print(f"Uploading '{local_zip_path}' to MinIO as '{object_name}'...")
        await client.fput_object(bucket_name, object_name, str(local_zip_path))
        print("Upload complete.")
        print(f"✅ STEP 1 SUCCESS: Dataset is ready in MinIO.")

    finally:
        # 清理本地临时文件
        if LOCAL_TEMP_DIR.exists():
            print("Cleaning up local temporary directory...")
            shutil.rmtree(LOCAL_TEMP_DIR)

# --- Step 2: Training Actor Test Function ---
async def run_training_test():
    """
    Initializes Ray, creates a TrainerActor, and runs a short training task.
    """
    print("\n--- STEP 2: RUNNING TRAINER ACTOR TEST ---")

    # 确保 Ray 已经初始化
    if not ray.is_initialized():
        print("Initializing Ray...")
        # 根据你的环境，决定是否需要 GPU
        if os.environ.get("TEST_ON_CPU", "true").lower() == "true":
            ray.init(num_cpus=4, num_gpus=0)
        else:
            ray.init(num_cpus=4, num_gpus=1)
        print("Ray initialized.")

    # 加载并修改配置以进行快速测试
    try:
        config_path = Path("./config/act_aloha_config.json")
        with open(config_path, 'r') as f:
            cfg = json.load(f)
    except FileNotFoundError:
        print(f"❌ ERROR: Base config file not found at '{config_path}'. Please create it.")
        return

    test_steps = 10  # 运行一个非常短的训练来验证流程
    test_save_freq = 5
    
    cfg.update({
        "steps": test_steps,
        "save_freq": test_save_freq,
        "log_freq": 2,
        "batch_size": 2,
        "num_workers": 1,
    })
    
    if os.environ.get("TEST_ON_CPU", "true").lower() == "true":
        print("Configuring for CPU environment.")
        cfg["policy"]["device"], cfg["num_gpus"] = "cpu", 0
    else:
        print("Configuring for GPU environment.")
        cfg["policy"]["device"], cfg["num_gpus"] = "cuda", 1

    # 创建训练任务
    training_task = TrainingTask(
        task_id="simple_test_task_001",
        user_id="simple_test_user",
        uuid=TEST_UUID,
        config=cfg
    )

    # 启动 TrainerActor
    print("Creating TrainerActor...")
    trainer_actor = TrainerActor.options(num_gpus=cfg["num_gpus"]).remote(training_task)
    print("TrainerActor created.")

    # 运行训练
    try:
        print(f"Calling train method for steps 0 to {test_steps}...")
        final_step = await trainer_actor.train.remote(start_step=0, end_step=test_steps)
        
        print(f"TrainerActor reported completion at step: {final_step}")
        
        if final_step == test_steps:
            print("✅ STEP 2 SUCCESS: Training actor completed the specified number of steps.")
        else:
            print(f"❌ FAILED: Training actor finished at step {final_step}, but expected {test_steps}.")

    except Exception as e:
        print(f"❌ FAILED: An error occurred during the training process: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # 清理
        print("Shutting down the actor and Ray...")
        if 'trainer_actor' in locals():
            ray.kill(trainer_actor)
        ray.shutdown()
        
        # 清理本地的运行目录
        run_dir_base = settings.RUN_DIR_BASE
        test_run_dir = Path(run_dir_base) / TEST_UUID
        if test_run_dir.exists():
            print(f"Cleaning up run directory: {test_run_dir}")
            shutil.rmtree(test_run_dir)

# --- Main Execution Block ---
async def main():
    """Main function to orchestrate the test steps."""
    try:
        # 获取 MinIO 客户端
        minio_client = await get_minio_client()

        # 第一步：准备数据
        await prepare_dataset_in_minio(minio_client)

        # 第二步：运行训练测试
        await run_training_test()

    except Exception as e:
        print(f"\n❌ An unexpected error occurred in the main script: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # 确保你的环境设置正确
    # 例如, HF_TOKEN, MINIO_URL 等
    # 你可以在这里检查或硬编码
    
    # 运行主异步函数
    asyncio.run(main())