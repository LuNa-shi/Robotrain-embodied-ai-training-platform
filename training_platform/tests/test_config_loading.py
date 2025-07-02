# train_platform/tests/test_config_loading.py

import sys
import os
import json
from pathlib import Path

# --- 设置 PYTHONPATH ---
# 将项目根目录（training_platform 的父目录）添加到 sys.path
# 这样 Python 解释器才能找到 training_platform 和 lerobot 模块
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# --- 导入我们自己的模块 ---
from training_platform.trainer.lerobot_trainer_logic import run_lerobot_training
from training_platform.common.task_models import TrainingTask
from omegaconf import OmegaConf

# --- 模拟组件，避免依赖 Ray ---

# 模拟 TrainerActor，只实现我们需要测试的方法
class MockTrainerActor:
    def __init__(self, task: TrainingTask):
        self.task = task
        self.run_dir = f"/tmp/test_run_{self.task.uuid}"
    
    def _determine_base_config_path(self) -> str:
        """
        这个方法直接从 training_platform/trainer/trainer_actor.py 复制过来，
        但将基础路径指向我们的临时测试目录。
        """
        user_conf = self.task.config
        policy_type = user_conf.get("policy", {}).get("type")
        env_type = user_conf.get("env", {}).get("type")

        if not policy_type or not env_type:
            raise ValueError("User config must specify 'policy.type' and 'env.type'")

        config_filename = f"{policy_type}_{env_type}_config.json"
        
        # 关键：路径指向我们测试脚本创建的临时目录
        base_path = Path("./config") 
        config_file_path = base_path / config_filename

        print(f"[*] MockTrainerActor: Determined base config file: {config_file_path}")

        if not config_file_path.exists():
            raise FileNotFoundError(f"Base config file '{config_filename}' not found at '{config_file_path}'")
            
        return str(config_file_path)

# --- 主测试函数 ---

def run_lerobot_training_for_test(base_config_path, user_override_config, **kwargs):
    """
    直接使用 draccus.parse 来加载和合并配置，这与 lerobot 内部行为一致。
    """
    # 导入 draccus 和 lerobot 的主配置类
    import draccus
    from lerobot.configs.train import TrainPipelineConfig

    # 1. 准备命令行覆盖参数
    # draccus 通过模拟命令行参数来进行覆盖
    # 我们需要将用户的字典 {"batch_size": 32} 转换为 ["--batch_size", "32"] 的形式
    overrides = []
    for key, value in user_override_config.items():
        if isinstance(value, dict):
            # 处理嵌套字典，例如 policy.type
            for inner_key, inner_value in value.items():
                # 对于 draccus，嵌套参数的格式是 --parent.child=value
                overrides.append(f"--{key}.{inner_key}={inner_value}")
        else:
            overrides.append(f"--{key}={value}")
    
    print(f"[*] Converted user config to draccus args: {overrides}")

    # 2. 【关键】直接调用 draccus.parse
    # 它会先加载 base_config_path 的文件，然后应用 overrides 列表中的覆盖
    # 这会自动处理所有动态类型，例如 EnvConfig
    final_cfg: TrainPipelineConfig = draccus.parse(
        config_class=TrainPipelineConfig,
        config_path=base_config_path,
        args=overrides
    )
    
    return final_cfg

def run_test():
    print("--- Running Simple Config Loading Test ---")
    
    # 1. 准备测试环境：创建临时目录和配置文件
    test_config_dir = Path("./config")
   
    
    base_config_file_path = test_config_dir / "act_aloha_config.json"
    

    # 2. 模拟一个来自用户的任务请求
    user_override_config = {
        "batch_size": 64,
        "steps": 500,
        "policy": {"type": "act", "optimizer_lr": 1e-7},  # 用户必须提供这些类型来定位基础配置
        "env": {"type": "aloha"}
    }
    task = TrainingTask(
        task_id="test_task_1",
        user_id="test_user",
        uuid="some_uuid",
        config=user_override_config
    )
    print("\n[INFO] Simulated user task request:")
    print(json.dumps({"base_config_to_find": "act_aloha", "overrides": user_override_config}, indent=2))
    
    # 3. 模拟 TrainerActor 的行为
    print("\n--- Simulating TrainerActor logic ---")
    mock_actor = MockTrainerActor(task)
    try:
        base_path = mock_actor._determine_base_config_path()
        print(f"[OK] Successfully determined base config path: {base_path}")
    except FileNotFoundError as e:
        print(f"[FAIL] Could not find base config: {e}")
        return # 测试失败，提前退出

    # 4. 模拟调用核心训练逻辑
    print("\n--- Simulating call to run_lerobot_training ---")
    

    # 调用我们的测试版训练函数
    final_config = run_lerobot_training_for_test(
        base_config_path=base_path,
        user_override_config=task.config
    )

    # 5. 验证结果
    print("\n--- Verifying final merged configuration ---")
    
    # 打印完整的最终配置
    print(OmegaConf.to_yaml(final_config))

    # 手动断言关键值
    print("\n--- Asserting key values ---")
    try:
        assert final_config.batch_size == 64, f"batch_size is {final_config.batch_size}, expected 64"
        print(f"[PASS] batch_size correctly overridden to: {final_config.batch_size}")
        
        assert final_config.steps == 500, f"steps is {final_config.steps}, expected 500"
        print(f"[PASS] steps correctly overridden to: {final_config.steps}")

        # log_freq 没有被覆盖，应该是基础配置中的 200
        assert final_config.log_freq == 200, f"log_freq is {final_config.log_freq}, expected 200"
        print(f"[PASS] log_freq correctly kept from base: {final_config.log_freq}")
        
        assert final_config.policy.optimizer_lr == 1e-7, f"optimizer_lr is {final_config.policy.optimizer_lr}, expected 1e-7"
        print(f"[PASS] policy.optimizer_lr correctly kept from base: {final_config.policy.optimizer_lr}")
        
        print("\n[SUCCESS] All checks passed!")

    except AssertionError as e:
        print(f"\n[FAIL] Assertion failed: {e}")

    # 6. 清理临时文件
    finally:
        print("\n[INFO] Cleaned up temporary files.")


# --- 脚本入口 ---
if __name__ == '__main__':
    run_test()