# test_actor_initial_training.py
# 第一部分：初始训练并上传checkpoint

import asyncio
import os
import shutil
import time
from pathlib import Path
from minio import Minio

# Import the actual actor and task models
from training_platform.trainer.lerobot_train_actor import TrainerActor
from training_platform.common.task_models import TrainingTask
from training_platform.configs.settings import settings

# --- Configuration for the Initial Training Test ---
TEST_UUID = "initial-training-test-uuid"
TEST_USER_ID = "initial-training-user"
TEST_TASK_ID = "initial-training-task-001"
TEMP_RUN_DIR = Path("./temp_initial_training_run")

# Helper to check MinIO state
def verify_minio_setup():
    """Connects to MinIO and verifies buckets exist."""
    print("Verifying MinIO setup...")
    client = Minio(
        settings.MINIO_URL,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=False
    )
    try:
        if not client.bucket_exists(settings.MINIO_DATASET_BUCKET):
            raise ConnectionError(f"MinIO bucket '{settings.MINIO_DATASET_BUCKET}' does not exist! Please create it.")
        if not client.bucket_exists(settings.MINIO_CHECKPOINT_BUCKET):
            raise ConnectionError(f"MinIO bucket '{settings.MINIO_CHECKPOINT_BUCKET}' does not exist! Please create it.")
        print("✅ MinIO buckets are present.")
        return client
    except Exception as e:
        print(f"\n❌ Could not connect to MinIO at '{settings.MINIO_URL}'. Is it running? Error: {e}")
        raise

async def run_initial_training_test():
    """执行初始训练测试：从0步开始训练到50步，并上传checkpoint"""
    
    print("--- 初始训练测试 ---")
    print("此测试将连接到真实的MinIO和RabbitMQ服务。")
    print("请确保服务正在运行：'docker-compose up -d'")
    input("按Enter键继续...")

    # 覆盖运行目录以便清理
    settings.RUN_DIR_BASE = str(TEMP_RUN_DIR)
    if TEMP_RUN_DIR.exists(): 
        shutil.rmtree(TEMP_RUN_DIR)
    TEMP_RUN_DIR.mkdir()

    minio_client = verify_minio_setup()

    # 定义训练任务
    initial_task = TrainingTask(
        uuid=TEST_UUID,
        user_id=TEST_USER_ID,
        task_id=TEST_TASK_ID,
        config={
            "policy": {"type": "act"},
            "env": {"type": "aloha"}, # 假设config/act_aloha_config.json存在
            "dataset": {"repo_id": "lerobot/aloha_sim_insertion_human"},
            "steps": 100,       # 总训练步数
            "save_freq": 50,    # 每50步保存一个checkpoint
            "batch_size": 8,
        }
    )

    try:
        # --- 初始训练运行 (0 -> 50 steps) ---
        print("\n" + "="*50 + "\n�� 初始训练运行 (steps 0 -> 50)\n" + "="*50)
        actor = TrainerActor(initial_task)
        final_step = await actor.train(start_step=0, end_step=50)
        
        print(f"\n✅ 初始训练完成。Actor在步数: {final_step} 结束")
        assert final_step == 50
        time.sleep(2) # 给Ray时间清理

        # --- 验证checkpoint上传 ---
        print("\n" + "="*50 + "\n🔎 验证MinIO中的checkpoint\n" + "="*50)
        objects = minio_client.list_objects(settings.MINIO_CHECKPOINT_BUCKET, prefix=f"checkpoints/{TEST_UUID}/", recursive=True)
        found_objects = [obj.object_name for obj in objects]
        
        expected_ckpt_50 = f"checkpoints/{TEST_UUID}/checkpoint_step_50.zip"

        print("在checkpoint bucket中找到的对象:")
        for obj in found_objects: 
            print(f"- {obj}")

        assert expected_ckpt_50 in found_objects
        print(f"\n�� 成功：找到预期的checkpoint: {expected_ckpt_50}")
        
        # 保存测试状态信息供后续测试使用
        test_state = {
            "uuid": TEST_UUID,
            "user_id": TEST_USER_ID,
            "task_id": TEST_TASK_ID,
            "last_checkpoint_step": 50,
            "total_steps": 100,
            "save_freq": 50
        }
        
        # 将状态信息写入文件，供后续测试读取
        state_file = Path("./test_state.json")
        import json
        with open(state_file, 'w') as f:
            json.dump(test_state, f, indent=2)
        print(f"✅ 测试状态已保存到: {state_file}")

    except Exception as e:
        print(f"\n❌ 初始训练测试失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # --- 清理 ---
        print("\n" + "="*50 + "\n�� 清理中...\n" + "="*50)
        if TEMP_RUN_DIR.exists():
            shutil.rmtree(TEMP_RUN_DIR)
            print(f"已删除临时运行目录: {TEMP_RUN_DIR}")
        print("初始训练测试完成。")

if __name__ == "__main__":
    asyncio.run(run_initial_training_test())