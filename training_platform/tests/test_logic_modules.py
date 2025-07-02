# train_platform/tests/test_logic_modules_final.py

import sys
import os
import shutil
from pathlib import Path
import logging

# --- 设置 PYTHONPATH ---
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# --- 导入待测试的模块和依赖 ---
from training_platform.trainer.lerobot_trainer_logic import (
    prepare_config,
    initialize_training_objects,
    execute_training_loop,
)
from omegaconf import OmegaConf
import torch

# --- 模拟和辅助函数 ---
def cleanup_temp_dir(dir_path):
    """辅助函数：只清理测试生成的临时目录。"""
    if dir_path.exists():
        shutil.rmtree(dir_path)

# --- 单元测试函数 ---

def test_prepare_config():
    """单元测试第一部分：prepare_config"""
    print("\n--- Testing: prepare_config() ---")
    
    # 1. 准备环境
    # 直接使用项目中的真实配置文件
    base_config_path = project_root / "config" / "act_aloha_config.json"
    if not base_config_path.exists():
        print(f"[FAIL] Base config not found at {base_config_path}. Please check the path.")
        return

    print(f"[*] Using real base config: {base_config_path}")
    
    user_override_config = {
        "batch_size": 128, # 一个明显不同的值
        "policy": {"optimizer_lr": 1.23e-7} # 一个明显不同的值
    }
    
    # 2. 执行待测试函数
    print("[*] Calling prepare_config...")
    final_cfg = prepare_config(
        base_config_path=str(base_config_path),
        user_override_config=user_override_config,
        run_dir="./tmp_test_runs/run_prepare_config",
        start_step=0,
        end_step=1000,
    )
    print("[OK] prepare_config executed.")

    # 3. 验证结果
    try:
        assert final_cfg.batch_size == 128
        print("[PASS] batch_size was correctly overridden to 128.")
        
        assert final_cfg.policy.optimizer_lr == 1.23e-7
        print("[PASS] Nested policy.optimizer_lr was correctly overridden to 1.23e-7.")
        
        # 验证原始配置文件中的值是否保留
        assert final_cfg.dataset.repo_id == "lerobot/aloha_sim_insertion_human"
        print("[PASS] dataset.repo_id from base config was preserved.")
        
        print("\n[SUCCESS] All checks for prepare_config passed!")
    except AssertionError as e:
        print(f"\n[FAIL] Assertion failed for prepare_config: {e}")
    finally:
        cleanup_temp_dir(Path("./tmp_test_runs"))
        print("--- Test for prepare_config finished ---")


def test_initialize_training_objects():
    """
    单元测试第二部分：initialize_training_objects
    这次我们用真实的配置，但仍然 mock 重量级的函数调用。
    """
    print("\n--- Testing: initialize_training_objects() ---")

    # 1. 使用 prepare_config 生成一个真实的配置对象
    base_config_path = project_root / "config" / "act_aloha_config.json"
    cfg = prepare_config(
        base_config_path=str(base_config_path),
        user_override_config={}, # 无覆盖
        run_dir="./tmp_test_runs/run_init_objects",
        start_step=0,
        end_step=1000
    )
    # 为了测试，强制使用 CPU
    cfg.policy.device = "cpu"
    
    # 2. 使用 Mocking "伪造"重量级函数
    mock_calls = []
    
    class MockFactory:
        def __init__(self, name):
            self.name = name
        def __call__(self, *args, **kwargs):
            mock_calls.append(f"Called {self.name}")
            # 返回一个可以调用 .to() 的简单对象
            mock_obj = lambda: None
            mock_obj.to = lambda device: None
            # 对于 make_dataset，需要返回一个有 meta 属性的对象
            mock_obj.meta = {} 
            return mock_obj
            
    # "猴子补丁"：在运行时替换真实函数
    original_make_dataset = sys.modules['lerobot.common.datasets.factory'].make_dataset
    original_make_policy = sys.modules['lerobot.common.policies.factory'].make_policy
    sys.modules['lerobot.common.datasets.factory'].make_dataset = MockFactory("make_dataset")
    sys.modules['lerobot.common.policies.factory'].make_policy = MockFactory("make_policy")
    
    # 3. 执行待测试函数
    print("[*] Calling initialize_training_objects...")
    device = torch.device("cpu")
    try:
        initialize_training_objects(cfg, device, start_step=0)
        print("[OK] initialize_training_objects executed.")
    except Exception as e:
        print(f"[FAIL] initialize_training_objects raised an unexpected exception: {e}")
    finally:
        # 无论成功失败，都恢复原始函数
        sys.modules['lerobot.common.datasets.factory'].make_dataset = original_make_dataset
        sys.modules['lerobot.common.policies.factory'].make_policy = original_make_policy

    # 4. 验证结果
    try:
        assert "Called make_dataset" in mock_calls
        print("[PASS] make_dataset was called.")
        assert "Called make_policy" in mock_calls
        print("[PASS] make_policy was called.")
        print("\n[SUCCESS] All checks for initialize_training_objects passed!")
    except AssertionError as e:
        print(f"\n[FAIL] Assertion failed for initialize_training_objects: {e}")
    finally:
        cleanup_temp_dir(Path("./tmp_test_runs"))
        print("--- Test for initialize_training_objects finished ---")


def test_execute_training_loop_integration():
    """
    集成测试第三部分：execute_training_loop (短循环)
    这次使用真实的配置、真实的数据集（自动下载）和真实的模型，
    验证整个流程能否在 CPU 上跑通一个完整的训练步骤。
    """
    logging.basicConfig(
        level=logging.INFO, # 设置日志级别为 INFO
        format='%(asctime)s - %(levelname)s - %(message)s' # 定义日志格式
    )
    print("\n--- Testing: execute_training_loop() with a short, real run (integration) ---")
    
    # 1. 准备真实的配置
    # 我们将使用一个真实的、可下载的数据集
    base_config_path = project_root / "config" / "act_aloha_config.json"
    
    # 强制在 CPU 上运行，并且只跑2步以节省时间
    user_overrides = {
        "num_workers": 0, # 在测试中用主进程加载数据
    }
    
    run_dir = "./tmp_test_runs/run_integration_loop"
    start_step = 0
    end_step = 2 # 只跑2步

    cfg = prepare_config(
        base_config_path=str(base_config_path),
        user_override_config=user_overrides,
        run_dir=run_dir,
        start_step=start_step,
        end_step=end_step
    )
    device = torch.device("cuda")

    # 2. 初始化真实的训练对象 (不再 mock)
    # 第一次运行时，这里会自动从 Hugging Face Hub 下载数据集
    print("[*] Initializing real training objects (this may download the dataset)...")
    try:
        training_objects = initialize_training_objects(cfg, device, start_step=0)
        print("[OK] All real objects initialized successfully.")
    except Exception as e:
        print(f"[FAIL] Failed to initialize real objects: {e}")
        # 打印更详细的错误信息
        import traceback
        traceback.print_exc()
        cleanup_temp_dir(Path(run_dir))
        return # 测试失败，提前退出
        
    # 3. 准备回调函数和记录器
    log_calls = []
    save_calls = []
    cfg.log_freq = 1 # 每一步都记录
    cfg.save_freq = 2 # 在第2步保存
    cfg.steps = end_step # 任务总步数也是2

    def log_callback(step, metrics):
        print(f"  Log callback triggered at step {step} with loss: {metrics.get('loss', 'N/A'):.4f}")
        log_calls.append(step)
    def save_callback(step, directory):
        print(f"  Save callback triggered at step {step}")
        save_calls.append(step)
        
    # 4. 执行真实的训练循环
    print(f"[*] Calling execute_training_loop for a {end_step}-step run...")
    final_step = -1
    try:
        final_step = execute_training_loop(
            cfg, device, start_step, end_step,
            training_objects=training_objects, 
            log_callback=log_callback, 
            save_callback=save_callback
        )
        print("[OK] execute_training_loop executed without errors.")
    except Exception as e:
        print(f"[FAIL] execute_training_loop failed during run: {e}")
        import traceback
        traceback.print_exc()

    # 5. 验证结果
    try:
        assert final_step == end_step
        print(f"[PASS] Loop finished at the correct step: {final_step}")

        assert log_calls == [1, 2]
        print(f"[PASS] log_callback was called at correct steps: {log_calls}")
        
        assert save_calls == [2]
        print(f"[PASS] save_callback was called at correct steps: {save_calls}")
        
        # 检查 checkpoint 文件是否真的被创建了
        checkpoint_dir = Path(run_dir) / "checkpoints" / f"{end_step:06d}"
        assert checkpoint_dir.exists() and (checkpoint_dir / "policy.safetensors").exists()
        print(f"[PASS] Checkpoint directory and file were created at: {checkpoint_dir}")
        
        print("\n[SUCCESS] All checks for the integration test passed!")
    except AssertionError as e:
        print(f"\n[FAIL] Assertion failed for integration test: {e}")
    finally:
        cleanup_temp_dir(Path(run_dir))
        print("--- Test for execute_training_loop finished ---")
# --- 脚本主入口 ---
if __name__ == '__main__':
    # 确保 lerobot 的所有子类都被注册
    import lerobot.common.envs.factory
    import lerobot.common.policies.factory
    
    # 按顺序运行所有测试
    # test_prepare_config()
    # test_initialize_training_objects()
    test_execute_training_loop_integration()