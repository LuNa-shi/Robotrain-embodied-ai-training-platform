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
# Make sure the project root is in the Python path
import sys
sys.path.append('.')

from training_platform.trainer.lerobot_train_actor import TrainerActor
from training_platform.common.task_models import TrainingTask
from training_platform.configs.settings import settings

# --- Test Configuration ---
TEST_UUID = str(uuid.uuid4())
# The Hugging Face dataset to use
DATASET_REPO_ID = "lerobot/aloha_sim_insertion_human"
# A fixed, local directory to store the dataset for tests
# Using .resolve() to get an absolute path, which is more robust for Ray actors
LOCAL_DATASET_DIR = Path(".training_platform/tests/data/aloha_sim_insertion_human").resolve()
# Path to the base configuration file for the training
BASE_CONFIG_PATH = Path("./config/act_aloha_config.json")


# --- Step 1: Data Preparation (Run once) ---
def prepare_local_dataset():
    """
    Downloads the dataset from Hugging Face to a fixed local directory if it's not already there.
    This makes subsequent test runs much faster.
    """
    print("--- STEP 1: PREPARING LOCAL DATASET ---")
    
    # Check if the dataset already exists
    # A simple check for the presence of a common file like 'train/episode_0.hdf5' can work
    if LOCAL_DATASET_DIR.exists() and any(LOCAL_DATASET_DIR.glob("**/*.hdf5")):
        print(f"✅ Dataset already exists at '{LOCAL_DATASET_DIR}'. Skipping download.")
        return

    print(f"Dataset not found locally. Downloading '{DATASET_REPO_ID}' to '{LOCAL_DATASET_DIR}'...")
    
    # Ensure the parent directory exists
    LOCAL_DATASET_DIR.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        snapshot_download(
            repo_id=DATASET_REPO_ID,
            repo_type="dataset",
            local_dir=str(LOCAL_DATASET_DIR),
            local_dir_use_symlinks=False, # Important for stability
            resume_download=True,
        )
        print(f"✅ STEP 1 SUCCESS: Dataset is ready at '{LOCAL_DATASET_DIR}'.")
    except Exception as e:
        print(f"❌ FAILED to download dataset: {e}")
        # If download fails, it's better to clean up a potentially partial download
        if LOCAL_DATASET_DIR.exists():
            shutil.rmtree(LOCAL_DATASET_DIR)
        raise # Re-raise the exception to stop the test

# --- Step 2: Focused Training Actor Test ---
async def run_training_test_on_local_data():
    """
    Initializes Ray and tests the TrainerActor using a pre-downloaded local dataset.
    This test focuses solely on the actor's training logic.
    """
    print("\n--- STEP 2: RUNNING FOCUSED TRAINER ACTOR TEST ---")

    # Ensure Ray is initialized
    if not ray.is_initialized():
        print("Initializing Ray...")
        # Configure for CPU by default for simpler testing, unless overridden
        num_gpus = 0 if os.environ.get("TEST_ON_CPU", "true").lower() == "true" else 1
        ray.init(num_cpus=4, num_gpus=num_gpus)
        print(f"Ray initialized with num_gpus={num_gpus}.")

    # Load and modify the base configuration for a quick test run
    if not BASE_CONFIG_PATH.exists():
        print(f"❌ ERROR: Base config file not found at '{BASE_CONFIG_PATH}'.")
        print("Please create it, for example by copying 'config/act_aloha_config.json.template'.")
        return

    with open(BASE_CONFIG_PATH, 'r') as f:
        cfg = json.load(f)

    test_steps = 10  # Run a very short training to verify the pipeline
    test_save_freq = 5
    
    # --- KEY MODIFICATION: Point to the local dataset ---
    cfg.update({
        "dataset_repo_id": str(LOCAL_DATASET_DIR), # This tells lerobot to use the local path
        "steps": test_steps,
        "save_freq": test_save_freq,
        "log_freq": 2,
        "batch_size": 2,
        "num_workers": 1, # Use fewer workers for a quick test
    })
    
    # Configure for CPU or GPU environment
    if os.environ.get("TEST_ON_CPU", "true").lower() == "true":
        print("Configuring training for CPU environment.")
        cfg["policy"]["device"] = "cpu"
        cfg["num_gpus"] = 0
    else:
        print("Configuring training for GPU environment.")
        cfg["policy"]["device"] = "cuda"
        cfg["num_gpus"] = 1

    # Create the TrainingTask Pydantic model
    training_task = TrainingTask(
        task_id="focused_test_task_001",
        user_id="focused_test_user",
        uuid=TEST_UUID,
        config=cfg
    )

    # Start the TrainerActor
    print("Creating TrainerActor...")
    # Use .options() to specify resource requirements for the actor
    trainer_actor = TrainerActor.options(num_gpus=cfg["num_gpus"]).remote(training_task)
    print("TrainerActor created.")

    # Run the training and await the result
    try:
        print(f"Calling train method for steps 0 to {test_steps}...")
        final_step = await trainer_actor.train.remote(start_step=0, end_step=test_steps)
        
        print(f"TrainerActor reported completion at step: {final_step}")
        
        assert final_step == test_steps, f"Expected {test_steps} steps, but actor finished at {final_step}"
        
        print("✅ STEP 2 SUCCESS: Training actor completed the specified number of steps.")

    except Exception as e:
        print(f"❌ FAILED: An error occurred during the training process: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Cleanup
        print("Shutting down the actor and Ray...")
        if 'trainer_actor' in locals():
            ray.kill(trainer_actor)
        ray.shutdown()
        
        # Clean up the specific run directory created by this test
        run_dir_base = settings.RUN_DIR_BASE
        test_run_dir = Path(run_dir_base) / TEST_UUID
        if test_run_dir.exists():
            print(f"Cleaning up temporary run directory: {test_run_dir}")
            shutil.rmtree(test_run_dir)
        print("Cleanup complete.")


# --- Main Execution Block ---
async def main():
    """Main function to orchestrate the test steps."""
    try:
        # Step 1: Ensure local data is available. This is synchronous.
        # prepare_local_dataset()

        # Step 2: Run the focused, async test on the actor.
        await run_training_test_on_local_data()
        
        print("\n🎉 Focused integration test completed successfully.")

    except Exception as e:
        print(f"\n❌ An unexpected error occurred in the main script: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # This script can now be run without needing MinIO credentials or connectivity.
    # The first run will download the dataset, which might take a while.
    # Subsequent runs will be much faster.
    asyncio.run(main())