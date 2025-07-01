import ray
import torch
import numpy as np
from typing import Dict, List

# Initialize Ray
if ray.is_initialized():
    ray.shutdown()
ray.init()

# Mock data remains the same
mock_data = [
    {
        "observation": {"image": np.random.rand(3, 84, 84).astype(np.float32)},
        "action": np.random.rand(6).astype(np.float32),
        "step_id": i,
    }
    for i in range(1000)
]

# 1. This step will still produce the ArrowInvalid warning, which is expected.
train_dataset = ray.data.from_items(mock_data)

# 2. This function correctly handles the warning by flattening the data. (No changes)
def preprocess_batch(batch: Dict[str, list]) -> Dict[str, np.ndarray]:
    if 'item' in batch:
        samples = batch['item']
    else:
        num_items = len(next(iter(batch.values())))
        samples = [dict(zip(batch, t)) for t in zip(*batch.values())]

    flattened_batch = {
        "obs_image": np.stack([item["observation"]["image"] for item in samples]),
        "action": np.stack([item["action"] for item in samples]),
        "step_id": np.array([item["step_id"] for item in samples])
    }
    return flattened_batch

# 3. Apply the transformation. (No changes)
train_dataset_transformed = train_dataset.map_batches(
    preprocess_batch,
    batch_size=128,
    batch_format='numpy'
)

# 4. Corrected iterator creation and in-loop conversion
print("--- Starting training loop with NumPy to Torch conversion ---")
num_epochs = 2
per_worker_batch_size = 32

# CHANGE 1: Request "numpy" format, which is supported by your Ray version.
iterator = train_dataset_transformed.random_shuffle().iter_batches(
    batch_size=per_worker_batch_size,
    batch_format="numpy"
)

# This loop structure is correct.
for epoch_num, epoch_iterator in enumerate(iterator.iter_epochs(num_epochs)):
    print(f"\n--- Epoch {epoch_num} ---")
    for batch in epoch_iterator:
        # CHANGE 2: Manually convert the NumPy batch to a Torch batch.
        torch_batch = {k: torch.from_numpy(v) for k, v in batch.items()}
        
        # Now use the torch_batch for all subsequent operations
        print("Batch received and converted to Torch:")
        print(f"  obs_image shape: {torch_batch['obs_image'].shape}, dtype: {torch_batch['obs_image'].dtype}")
        print(f"  action shape: {torch_batch['action'].shape}, dtype: {torch_batch['action'].dtype}")
        print(f"  step_id values: {torch_batch['step_id'][:5]}...")

        # Your training logic here using torch_batch
        break

ray.shutdown()