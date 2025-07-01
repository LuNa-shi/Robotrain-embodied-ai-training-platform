import os
from pathlib import Path
import shutil

# 假设你的项目结构正确，并且已经 pip install -e .
# 或者你需要手动把项目根目录加到 PYTHONPATH
from training_platform.common.storage import MinIOClient

# --- 配置 ---
MINIO_ENDPOINT = "localhost:9000"
MINIO_ACCESS_KEY = "minioadmin"
MINIO_SECRET_KEY = "minioadmin"
TEST_BUCKET = "test-checkpoints-bucket"
TEST_TASK_ID = "task_test_123"
TEST_STEP = 5000

def create_fake_checkpoint(base_dir: Path):
    """在本地创建一个假的 checkpoint 目录结构。"""
    checkpoint_dir = base_dir / "checkpoints" / f"step_{TEST_STEP}"
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    
    # 创建一些假文件
    (checkpoint_dir / "policy.pth").write_text("fake policy data")
    (checkpoint_dir / "optimizer.pth").write_text("fake optimizer data")
    
    # 创建一个子目录
    (checkpoint_dir / "extra_data").mkdir()
    (checkpoint_dir / "extra_data" / "some_logs.txt").write_text("log line 1")
    
    print(f"创建了假的 checkpoint 在: {checkpoint_dir}")
    return checkpoint_dir

def main():
    # --- 1. 准备本地数据 ---
    # 创建一个临时目录用于测试
    local_tmp_dir = Path("./tmp_test_run")
    if local_tmp_dir.exists():
        shutil.rmtree(local_tmp_dir) # 清理旧的测试目录
    
    local_checkpoint_dir = create_fake_checkpoint(local_tmp_dir)
    
    # --- 2. 初始化客户端并执行上传 ---
    print("\n初始化 MinIO 客户端...")
    minio_client = MinIOClient(
        endpoint=MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=False
    )
    
    print(f"\n开始上传 checkpoint 到 bucket '{TEST_BUCKET}'...")
    try:
        minio_client.upload_checkpoint(
            bucket_name=TEST_BUCKET,
            task_id=TEST_TASK_ID,
            step=TEST_STEP,
            local_dir=str(local_checkpoint_dir) # 你的方法需要一个字符串路径
        )
        print("\n✅ 上传成功!")
    except Exception as e:
        print(f"❌ 上传失败: {e}")
    finally:
        # --- 3. 清理本地临时文件 ---
        print("\n清理本地临时目录...")
        shutil.rmtree(local_tmp_dir)
        print("清理完成。")

    print(f"\n👉 请访问 http://localhost:9001 并登录 (minioadmin/minioadmin)")
    print(f"   检查 bucket '{TEST_BUCKET}' 中是否存在以下路径的对象:")
    print(f"   - checkpoints/{TEST_TASK_ID}/step_{TEST_STEP}/policy.pth")
    print(f"   - checkpoints/{TEST_TASK_ID}/step_{TEST_STEP}/optimizer.pth")
    print(f"   - checkpoints/{TEST_TASK_ID}/step_{TEST_STEP}/extra_data/some_logs.txt")


if __name__ == "__main__":
    main()