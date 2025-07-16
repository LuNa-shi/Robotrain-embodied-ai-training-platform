import sys
import os
import shutil
from pathlib import Path

import torch
import ray
from ray.train.torch import TorchTrainer
from ray.train import ScalingConfig, RunConfig, Checkpoint

# --- Setup Project Path ---
# This ensures that the script can find your 'training_platform' module.
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# The function we want to test
from training_platform.trainer.distributed_train_logic import train_func

# --- Main Test Execution ---

def main():
    # --- 1. Define Paths and Configuration ---

    # Use absolute paths to your actual files
    BASE_CONFIG_PATH = "/home/ubuntu/SE25Project-17/train/config/act_aloha_config.json"
    DATASET_PATH = "/home/ubuntu/aloha_sim_insertion_human"
    
    # Define a consistent output directory for this test run
    TEST_OUTPUT_DIR = PROJECT_ROOT / "test_run_output"


    if TEST_OUTPUT_DIR.exists():
        print(f"--- Cleaning up previous test output at: {TEST_OUTPUT_DIR} ---")
        shutil.rmtree(TEST_OUTPUT_DIR)

    # Clean up previous test runs if they exist
    if TEST_OUTPUT_DIR.exists():
        print(f"--- Cleaning up previous test output at: {TEST_OUTPUT_DIR} ---")
        shutil.rmtree(TEST_OUTPUT_DIR)


    # Verify paths exist before running
    assert Path(BASE_CONFIG_PATH).exists(), f"Base config file not found at: {BASE_CONFIG_PATH}"
    assert Path(DATASET_PATH).exists(), f"Dataset directory not found at: {DATASET_PATH}"
    print("✔️ Base config and dataset paths verified.")

    # Define the user override configuration for a quick test
    user_override_config = {
        "steps": 10,       # Run for a very short time
        "save_freq": 5,    # Save a checkpoint at step 5
        "log_freq": 1,
        "batch_size": 2,   # Use a small batch size for testing
        "num_workers": 0,  # Use 0 dataloader workers for simplicity in a local test
    }

    # Assemble the final config dictionary for `train_func`
    train_loop_config = {
        "base_config_path": BASE_CONFIG_PATH,
        "user_override_config": user_override_config,
        "task_id": 123,
        "local_dataset_path": DATASET_PATH,
    }

    # --- 2. Setup and Run Ray ---
    if ray.is_initialized():
        ray.shutdown()
    ray.init()

    # Configure the TorchTrainer
    scaling_config = ScalingConfig(
        num_workers=1,  # Test with 2 workers
        use_gpu=torch.cuda.is_available(),
        resources_per_worker={"GPU": 1} if torch.cuda.is_available() else {}
    )

    # Ray Train will save its own metadata inside the `RUN_DIR`
    run_config = RunConfig(
        name="test_lerobot_real_data_run",
        storage_path=str(TEST_OUTPUT_DIR),
        checkpoint_config=ray.train.CheckpointConfig(
            num_to_keep=2,
            checkpoint_frequency=0, # Disable Ray's frequency, we use our own `save_freq`
        ),
    )

    trainer = TorchTrainer(
        train_loop_per_worker=train_func,
        train_loop_config=train_loop_config,
        scaling_config=scaling_config,
        run_config=run_config,
    )

    # --- 3. PART 1: Run the initial training job ---
    print("\n--- 🚀 PART 1: Starting initial training run with real data... ---\n")
    result = trainer.fit()

    print("\n--- ✅ Initial training run finished. Verifying results... ---")

    # Check for errors
    assert result.error is None, f"Training failed with error: {result.error}"
    print("✔️ No training errors.")
    print(f"Final metrics reported: {result.metrics}")
    assert result.metrics.get("step") == 10

    trial_path = Path(result.path)
    experiment_path = Path(trial_path).parent
    print(f"Verifying checkpoints inside the correct trial directory: {trial_path}")
    
    # The `lerobot` checkpoint is saved inside this trial directory.
    checkpoint_dir = trial_path / "checkpoints"
    step_5_checkpoint = checkpoint_dir / "000005"
    last_symlink = checkpoint_dir / "last"

    assert step_5_checkpoint.is_dir(), f"Checkpoint for step 5 not found at {step_5_checkpoint}"
    print(f"✔️ Checkpoint found at: {step_5_checkpoint}")
    # assert last_symlink.is_symlink(), "The 'last' symlink was not created."
    # assert os.path.realpath(last_symlink) == str(step_5_checkpoint), "'last' symlink points to wrong directory."
    # print("✔️ 'last' symlink is correct.")


     # --- 4. PART 2: Restore the run and continue training ---
    print(f"\n--- 🚀 PART 2: Restoring run from {trial_path} and continuing... ---\n")

    # Use TorchTrainer.restore() to continue the *exact same run*
    restored_trainer = TorchTrainer.restore(path=str(experiment_path))
    
    # We need a new stopper, or remove it, to let it run to completion
    # For simplicity, we create a new RunConfig without a stopper
    restored_trainer.run_config = RunConfig(
        name="test_lerobot_resumption_run", # Must be the same name
        storage_path=str(TEST_OUTPUT_DIR),
        checkpoint_config=run_config.checkpoint_config # Re-use the same checkpoint config
    )

    result_part2 = restored_trainer.fit()

    print("\n--- ✅ PART 2 finished (resumed run completed). Verifying final state... ---")
    assert result_part2.error is None, f"Resumed training failed with error: {result_part2.error}"
    
    # Check that the final step is the total number of steps
    final_step = result_part2.metrics["step"]
    print(f"Final reported step: {final_step}")
    assert final_step == 20
    
    # Verify that new checkpoints were created in the SAME directory
    step_10_checkpoint = checkpoint_dir / "000010"
    step_15_checkpoint = checkpoint_dir / "000015"
    step_20_checkpoint = checkpoint_dir / "000020"
    assert step_10_checkpoint.is_dir(), "Checkpoint at step 10 was not created after resuming."
    assert step_15_checkpoint.is_dir(), "Checkpoint at step 15 was not created after resuming."
    assert step_20_checkpoint.is_dir(), "Checkpoint at step 20 was not created after resuming."
    print("✔️ All checkpoints (before and after resume) exist in the same directory.")


    print("\n🎉🎉🎉 CONGRATULATIONS! The true resumption test passed successfully! 🎉🎉🎉")


if __name__ == "__main__":
    try:
        main()
    finally:
        if ray.is_initialized():
            ray.shutdown()
        print("--- Ray has been shut down. ---")