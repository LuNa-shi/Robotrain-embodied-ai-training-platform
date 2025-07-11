from pathlib import Path
import ray
from ray.train.torch import TorchTrainer
from ray.train import RunConfig, ScalingConfig
import os
import shutil
# Import the function to be tested
from training_platform.trainer.distributed_train_logic import train_func

def test_logic():
    ray.init(address='auto')

    # --- Test 1: Train from scratch for a few steps ---
    print("--- Testing training from scratch ---")
    real_dataset_path = Path("/home/ubuntu/aloha_sim_insertion_human")
    run_dir_scratch = "/tmp/ray_results/test_scratch"
    if Path(run_dir_scratch).exists():
        print(f"发现旧的运行目录 '{run_dir_scratch}', 正在删除...")
        shutil.rmtree(run_dir_scratch)
        
    # You should manually place your test dataset here.
    # Mock the config that the actor would normally provide
    train_config_scratch = {
        "base_config_path": "/home/ubuntu/SE25Project-17/train/config/act_aloha_config.json",
        "user_override_config": {
            "steps": 10,
            "log_freq": 2,
            "save_freq": 5,
            "batch_size": 4 # Use a small batch size for testing
        },
        "run_dir": run_dir_scratch,
        "task_id": "task_scratch",
        "real_dataset_path": real_dataset_path,
    }
    # Mock downloading the dataset
   
    
    trainer_scratch = TorchTrainer(
        train_loop_per_worker=train_func,
        train_loop_config=train_config_scratch,
        scaling_config=ScalingConfig(num_workers=1, use_gpu=True), # Test with 2 GPUs
    )
    result_scratch = trainer_scratch.fit()
    
    print("✅✅✅ 从头训练测试成功! ✅✅✅")
    print("结果:", result_scratch.metrics)
    
    # --- 关键修复：修改断言 ---
    # 我们断言训练是完成的，并且最后的 step 是 10
    assert result_scratch.metrics['done'] is True
    assert result_scratch.metrics['training_iteration'] == 6 # Ray 的 iteration 次数
    # 我们可以从 metrics 里找到我们自己的 step
    final_reported_step = result_scratch.metrics.get('checkpoint_step') or result_scratch.metrics.get('step')
    # 断言我们自己的逻辑是正确的
    assert final_reported_step == 10

    # --- 现在可以取消注释，继续测试恢复功能 ---
    print("\n" + "="*20 + " 测试 2: 从 checkpoint 恢复 " + "="*20)
    
    run_dir_resume = "/tmp/ray_results/test_resume"
    if Path(run_dir_resume).exists():
        shutil.rmtree(run_dir_resume)

    # ... (之前恢复测试的 train_config_resume 定义是正确的) ...
    train_config_resume = {
        "base_config_path": "/home/ubuntu/SE25Project-17/train/config/act_aloha_config.json",
        "user_override_config": {
            "output_dir": run_dir_resume,
            "steps": 20, # 继续到 20
            "save_freq": 5,
            "log_freq": 2,
            "batch_size": 4
        },
        "run_dir": run_dir_resume,
        "task_id": "task_resume",
    }
    
    trainer_resume = TorchTrainer(
        train_loop_per_worker=train_func,
        train_loop_config=train_config_resume,
        scaling_config=ScalingConfig(num_workers=1, use_gpu=True),
        # 使用上一次运行的 checkpoint 来恢复
        resume_from_checkpoint=result_scratch.checkpoint, 
        run_config=RunConfig(name="resume_run")
    )
    result_resume = trainer_resume.fit()

    print("✅✅✅ 恢复训练测试成功! ✅✅✅")
    print("结果:", result_resume.metrics)
    
    # 计算恢复训练的 iteration 次数
    # 从 step 10 到 20，会 report at 12, 14, 15, 16, 18, 20 (共6次)
    assert result_resume.metrics['training_iteration'] == 6
    final_reported_step_resume = result_resume.metrics.get('checkpoint_step') or result_resume.metrics.get('step')
    assert final_reported_step_resume == 20

if __name__ == "__main__":
    test_logic()