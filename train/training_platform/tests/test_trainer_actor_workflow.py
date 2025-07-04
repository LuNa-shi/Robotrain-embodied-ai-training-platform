import pytest
import uuid
import json
import os
import shutil
from pathlib import Path
import ray

# --- Project Imports ---
from training_platform.trainer.trainer_actor import TrainerActor
from training_platform.common.task_models import TrainingTask
from training_platform.configs.settings import settings
from .conftest import TEST_CHECKPOINT_BUCKET, TEST_DATASET_BUCKET # Import constants

pytestmark = pytest.mark.asyncio

# A unique UUID for each test run to avoid conflicts if tests run in parallel
TEST_UUID = str(uuid.uuid4())

@pytest.fixture(scope="function")
async def cleanup_checkpoints(minio_test_client):
    """A function-scoped fixture to clean up checkpoints for a specific test run."""
    yield
    # Teardown after the test function completes
    print(f"\nCleaning up checkpoints for test UUID: {TEST_UUID}")
    client = minio_test_client
    try:
        if await client.bucket_exists(TEST_CHECKPOINT_BUCKET):
            prefix_to_delete = f"checkpoints/{TEST_UUID}/"
            objects_to_delete = [
                obj.object_name async for obj in client.list_objects(TEST_CHECKPOINT_BUCKET, prefix=prefix_to_delete, recursive=True)
            ]
            for obj_name in objects_to_delete:
                await client.remove_object(TEST_CHECKPOINT_BUCKET, obj_name)
    except Exception as e:
        print(f"Error during checkpoint cleanup for {TEST_UUID}: {e}")

@pytest.mark.asyncio
async def test_trainer_actor_workflow(
    ray_init_shutdown, minio_test_client, prepared_dataset_in_minio, cleanup_checkpoints, monkeypatch
):
    """
    Tests the TrainerActor's core workflow assuming the dataset is already in MinIO.
    """
    print(f"\n--- Starting trainer actor workflow test for UUID: {TEST_UUID} ---")
    
    # --- 1. Setup ---
    # Patch settings to use test buckets
    monkeypatch.setattr(settings, "MINIO_DATASET_BUCKET", TEST_DATASET_BUCKET)
    monkeypatch.setattr(settings, "MINIO_CHECKPOINT_BUCKET", TEST_CHECKPOINT_BUCKET)
    test_run_base_dir = Path("./tmp_test_runs_workflow")
    monkeypatch.setattr(settings, "RUN_DIR_BASE", str(test_run_base_dir))

    # Load and customize config for a quick test
    config_path = Path("./config/act_aloha_config.json")
    with open(config_path, 'r') as f:
        cfg = json.load(f)

    test_steps, test_save_freq = 20, 10
    cfg.update({
        "steps": test_steps,
        "save_freq": test_save_freq,
        "log_freq": 5,
        "batch_size": 2,
        "num_workers": 1,
    })
    
    # Configure for CPU or GPU based on environment
    if os.environ.get("TEST_ON_CPU", "true").lower() == "true":
        cfg["policy"]["device"], cfg["num_gpus"] = "cpu", 0
    else:
        cfg["policy"]["device"], cfg["num_gpus"] = "cuda", 1

    # --- 2. Actor Initialization and Execution ---
    training_task = TrainingTask(task_id="w-test-001", user_id="w-user", uuid=TEST_UUID, config=cfg)
    trainer_actor = TrainerActor.options(num_gpus=cfg["num_gpus"]).remote(training_task)
    
    print(f"Starting training for task {training_task.task_id}...")
    final_step = await trainer_actor.train.remote(start_step=0, end_step=test_steps)
    
    # --- 3. Verification ---
    print(f"Training slice completed. Final step reported: {final_step}")
    assert final_step == test_steps

    print("Verifying checkpoints in MinIO...")
    expected_checkpoints = [
        f"checkpoints/{TEST_UUID}/checkpoint_step_10.zip",
        f"checkpoints/{TEST_UUID}/checkpoint_step_20.zip",
    ]
    
    found_objects = [
        obj.object_name async for obj in minio_test_client.list_objects(TEST_CHECKPOINT_BUCKET, prefix=f"checkpoints/{TEST_UUID}/")
    ]
    print(f"Found objects in MinIO: {found_objects}")
    
    for expected_ckpt in expected_checkpoints:
        assert expected_ckpt in found_objects, f"Checkpoint '{expected_ckpt}' was not found."
        
    print("✅ Verification successful!")

    # --- 4. Teardown ---
    ray.kill(trainer_actor)
    # Clean up local run directory
    if test_run_base_dir.exists():
        shutil.rmtree(test_run_base_dir)