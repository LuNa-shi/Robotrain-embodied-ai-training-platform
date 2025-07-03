# test_actor_resume_training.py
# 第二部分：从checkpoint继续训练

import asyncio
import os
import shutil
import json
import time
from pathlib import Path
from minio import Minio

# Import the actual actor and task models
from training_platform.trainer.lerobot_train_actor import TrainerActor
from training_platform.common.task_models import TrainingTask
from training_platform.configs.settings import settings

# --- Configuration for the Resume Training Test ---
TEMP_RUN_DIR = Path("./temp_resume_training_run")

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

def load_test_state():
    """从文件加载初始训练测试的状态信息"""
    state_file = Path("./test_state.json")
    if not state_file.exists():
        raise FileNotFoundError(f"测试状态文件不存在: {state_file}。请先运行初始训练测试。")
    
    with open(state_file, 'r') as f:
        return json.load(f)

async def run_resume_training_test():
    """执行恢复训练测试：从checkpoint继续训练到100步"""
    
    print("--- 恢复训练测试 ---")
    print("此测试将连接到真实的MinIO和RabbitMQ服务。")
    print("请确保服务正在运行：'docker-compose up -d'")
    input("按Enter键继续...")

    # 加载初始训练的状态信息
    test_state = load_test_state()
    print(f"加载测试状态: {test_state}")

    # 覆盖运行目录以便清理
    settings.RUN_DIR_BASE = str(TEMP_RUN_DIR)
    if TEMP_RUN_DIR.exists(): 
        shutil.rmtree(TEMP_RUN_DIR)
    TEMP_RUN_DIR.mkdir()

    minio_client = verify_minio_setup()

    # 使用相同的任务配置，但从checkpoint开始
    resume_task = TrainingTask(
        uuid=test_state["uuid"],
        user_id=test_state["user_id"],
        task_id=test_state["task_id"],
        config={
            "policy": {"type": "act"},
            "env": {"type": "aloha"},
            "dataset": {"repo_id": "lerobot/aloha_sim_insertion_human"},
            "steps": test_state["total_steps"],
            "save_freq": test_state["save_freq"],
            "batch_size": 8,
        }
    )

    try:
        # --- 恢复训练运行 (50 -> 100 steps) ---
        print("\n" + "="*50 + f"\n🚀 恢复训练运行 (steps {test_state['last_checkpoint_step']} -> {test_state['total_steps']})\n" + "="*50)
        actor = TrainerActor(resume_task)
        final_step = await actor.train(
            start_step=test_state['last_checkpoint_step'], 
            end_step=test_state['total_steps']
        )

        print(f"\n✅ 恢复训练完成。Actor在步数: {final_step} 结束")
        assert final_step == test_state['total_steps']
        time.sleep(2)

        # --- 最终验证 ---
        print("\n" + "="*50 + "\n🔎 最终验证：检查MinIO中的所有checkpoints\n" + "="*50)
        objects = minio_client.list_objects(settings.MINIO_CHECKPOINT_BUCKET, prefix=f"checkpoints/{test_state['uuid']}/", recursive=True)
        found_objects = [obj.object_name for obj in objects]
        
        expected_ckpt_50 = f"checkpoints/{test_state['uuid']}/checkpoint_step_50.zip"
        expected_ckpt_100 = f"checkpoints/{test_state['uuid']}/checkpoint_step_100.zip"

        print("在checkpoint bucket中找到的对象:")
        for obj in found_objects: 
            print(f"- {obj}")

        assert expected_ckpt_50 in found_objects
        assert expected_ckpt_100 in found_objects
        print(f"\n🎉 成功：找到所有预期的checkpoints")
        print(f"   - {expected_ckpt_50}")
        print(f"   - {expected_ckpt_100}")

    except Exception as e:
        print(f"\n❌ 恢复训练测试失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # --- 清理 ---
        print("\n" + "="*50 + "\n清理中...\n" + "="*50)
        if TEMP_RUN_DIR.exists():
            shutil.rmtree(TEMP_RUN_DIR)
            print(f"已删除临时运行目录: {TEMP_RUN_DIR}")
        
        # 清理状态文件
        state_file = Path("./test_state.json")
        if state_file.exists():
            state_file.unlink()
            print(f"已删除测试状态文件: {state_file}")
        
        print("恢复训练测试完成。")

if __name__ == "__main__":
    asyncio.run(run_resume_training_test())