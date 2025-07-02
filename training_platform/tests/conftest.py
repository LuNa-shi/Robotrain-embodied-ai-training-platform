import pytest
import ray
import asyncio
import os
import shutil
from pathlib import Path

# --- Project Imports ---
from training_platform.common.minio_utils import get_minio_client
from training_platform.configs.settings import settings

# --- Hugging Face Imports for data prep ---
from huggingface_hub import snapshot_download

# --- Test Constants ---
TEST_DATASET_BUCKET = "test-datasets"
TEST_CHECKPOINT_BUCKET = "test-checkpoints"
DATASET_REPO_ID = "lerobot/aloha_sim_insertion_human"
MINIO_DATASET_OBJECT_NAME = f"datasets/{DATASET_REPO_ID.split('/')[-1]}.zip"
LOCAL_TEST_DIR = Path("./tmp_test_data_conftest")

# Pytest-asyncio setting for all tests in the directory
pytestmark = pytest.mark.asyncio


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the session."""
    loop = asyncio.get_event_loop_policy().get_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def ray_init_shutdown():
    """Initializes and shuts down Ray for the entire test session."""
    if os.environ.get("TEST_ON_CPU", "true").lower() == "true":
        ray.init(num_cpus=4, num_gpus=0, log_to_driver=False)
    else:
        ray.init(num_cpus=4, num_gpus=1, log_to_driver=False)
    yield
    ray.shutdown()


@pytest.fixture(scope="session")
async def minio_test_client():
    """
    Provides a MinIO client for the session.
    It creates test buckets and cleans them up after all tests are done.
    """
    print("Setting up MinIO client and buckets for the test session...")
    client = await get_minio_client()
    # Create buckets
    for bucket in [TEST_DATASET_BUCKET, TEST_CHECKPOINT_BUCKET]:
        if not await client.bucket_exists(bucket):
            await client.make_bucket(bucket)
    
    yield client
    
    # Teardown: Clean up buckets after the entire test session
    print("\nCleaning up MinIO buckets after test session...")
    try:
        for bucket in [TEST_DATASET_BUCKET, TEST_CHECKPOINT_BUCKET]:
            if await client.bucket_exists(bucket):
                objects_to_delete = [
                    obj.object_name async for obj in client.list_objects(bucket, recursive=True)
                ]
                for obj_name in objects_to_delete:
                    await client.remove_object(bucket, obj_name)
                await client.remove_bucket(bucket)
                print(f"Bucket '{bucket}' cleaned up.")
    except Exception as e:
        print(f"Error during MinIO cleanup: {e}")

@pytest.fixture(scope="session")
async def prepared_dataset_in_minio(minio_test_client, event_loop):
    """
    Ensures the test dataset exists in MinIO. If not, it downloads, zips, and uploads it.
    This runs only once for the entire test session.
    """
    client = minio_test_client
    try:
        await client.stat_object(TEST_DATASET_BUCKET, MINIO_DATASET_OBJECT_NAME)
        print("Dataset already exists in MinIO. Skipping preparation.")
        return MINIO_DATASET_OBJECT_NAME
    except Exception:
        print("Dataset not found in MinIO. Starting preparation...")

    LOCAL_TEST_DIR.mkdir(exist_ok=True, parents=True)
    local_dataset_path = LOCAL_TEST_DIR / "dataset"
    local_zip_path = LOCAL_TEST_DIR / "dataset.zip"

    print(f"Downloading dataset '{DATASET_REPO_ID}' from Hugging Face...")
    # Run blocking IO in a thread
    await event_loop.run_in_executor(None, lambda: snapshot_download(
        repo_id=DATASET_REPO_ID, repo_type="dataset", local_dir=str(local_dataset_path), local_dir_use_symlinks=False
    ))
    
    print(f"Zipping dataset folder...")
    await event_loop.run_in_executor(None, lambda: shutil.make_archive(str(local_dataset_path), 'zip', root_dir=str(local_dataset_path)))
    shutil.move(f"{local_dataset_path}.zip", local_zip_path) # Move is fast, no need for thread

    print(f"Uploading dataset to MinIO...")
    await client.fput_object(TEST_DATASET_BUCKET, MINIO_DATASET_OBJECT_NAME, str(local_zip_path))

    print("Cleaning up local temporary files...")
    shutil.rmtree(LOCAL_TEST_DIR) # shutil.rmtree is fast, no need for thread
    
    return MINIO_DATASET_OBJECT_NAME