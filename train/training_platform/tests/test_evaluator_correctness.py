#!/usr/bin/env python3
"""
修正后的 evaluator_logic 模块测试脚本
使用 lerobot/act_aloha_sim_insertion_human 模型进行测试
"""

import sys
import os
import json
import tempfile
import shutil
import time
import logging
from pathlib import Path
from typing import Dict, Any, Optional

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def test_imports():
    """测试必要的模块导入"""
    print("\n🧪 测试模块导入...")
    
    try:
        # 测试核心模块导入
        from training_platform.evaluator.evaluator_logic import (
            run_lerobot_evaluation,
            prepare_eval_config,
            eval_policy,
            rollout
        )
        
        # 测试 LeRobot 模块导入
        from lerobot.common.policies.factory import make_policy
        from lerobot.common.envs.factory import make_env, make_env_config
        from lerobot.common.policies.act.modeling_act import ACTPolicy
        from lerobot.configs.eval import EvalPipelineConfig
        
        print("✅ 所有必要模块导入成功")
        return True
        
    except Exception as e:
        print(f"❌ 模块导入失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_model_loading():
    """测试指定预训练模型的加载"""
    print("\n🧪 测试模型加载...")
    
    try:
        from lerobot.common.policies.act.modeling_act import ACTPolicy
        
        model_id = "lerobot/act_aloha_sim_insertion_human"
        print(f"尝试加载模型: {model_id}")
        
        # 测试模型是否可以成功加载
        policy = ACTPolicy.from_pretrained(model_id)
        
        print(f"✅ 模型加载成功: {type(policy)}")
        print(f"模型设备: {next(policy.parameters()).device}")
        print(f"模型参数数量: {sum(p.numel() for p in policy.parameters() if p.requires_grad):,}")
        
        return True
        
    except Exception as e:
        print(f"❌ 模型加载失败: {e}")
        print("这可能是因为网络问题或模型不可用")
        return False

def test_environment_creation():
    """测试环境创建"""
    print("\n🧪 测试环境创建...")
    
    try:
        from lerobot.common.envs.factory import make_env, make_env_config
        
        # 使用正确的环境配置方式
        env_cfg = make_env_config(
            env_type="aloha",
            task="AlohaInsertion-v0",
            fps=50,
            episode_length=400,
            obs_type="pixels_agent_pos",
            render_mode="rgb_array"
        )
        
        # 创建环境
        env = make_env(env_cfg, n_envs=2, use_async_envs=False)
        
        print(f"✅ 环境创建成功: {type(env)}")
        print(f"环境数量: {env.num_envs}")
        
        # 测试环境重置
        obs, info = env.reset()
        print(f"观察形状类型: {type(obs)}")
        if isinstance(obs, dict):
            for key, value in obs.items():
                if hasattr(value, 'shape'):
                    print(f"  {key}: {value.shape}")
                else:
                    print(f"  {key}: {type(value)}")
        
        env.close()
        return True
        
    except Exception as e:
        print(f"❌ 环境创建失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def run_evaluator_logic_test():
    """运行完整的评估逻辑测试"""
    print("\n🧪 运行完整评估逻辑测试...")
    
    try:
        from training_platform.evaluator.evaluator_logic import run_lerobot_evaluation
        
        # 配置
        model_path = "lerobot/act_aloha_sim_insertion_human"
        
        # 修正后的环境配置 - 必须包含 type 字段
        env_config = {
            "type": "aloha",
            "task": "AlohaInsertion-v0",
            "fps": 50,
            "episode_length": 400,
            "obs_type": "pixels_agent_pos",
            "render_mode": "rgb_array"
        }
        
        eval_config = {
            "n_episodes": 4,  # 较少的剧集数用于快速测试
            "batch_size": 2,
            "use_async_envs": False
        }
        
        # 创建临时输出目录
        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = str(Path(temp_dir) / "eval_output")
            
            print(f"开始评估，输出目录: {output_dir}")
            start_time = time.time()
            
            # 运行评估
            results = run_lerobot_evaluation(
                model_path=model_path,
                env_config=env_config,
                eval_config=eval_config,
                output_dir=output_dir,
                seed=1000,
                max_episodes_rendered=2,  # 渲染少量视频进行测试
                return_episode_data=False
            )
            
            end_time = time.time()
            eval_duration = end_time - start_time
            
            # 验证结果
            assert "aggregated" in results, "结果中缺少 'aggregated' 键"
            assert "per_episode" in results, "结果中缺少 'per_episode' 键"
            
            aggregated = results["aggregated"]
            required_keys = ["avg_sum_reward", "avg_max_reward", "pc_success", "eval_s", "eval_ep_s"]
            
            for key in required_keys:
                assert key in aggregated, f"聚合结果中缺少 '{key}' 键"
            
            print("✅ 评估完成！")
            print(f"总耗时: {eval_duration:.2f} 秒")
            print("\n📊 评估结果:")
            print(f"  平均总奖励: {aggregated['avg_sum_reward']:.4f}")
            print(f"  平均最大奖励: {aggregated['avg_max_reward']:.4f}")
            print(f"  成功率: {aggregated['pc_success']:.2f}%")
            print(f"  评估时间: {aggregated['eval_s']:.2f} 秒")
            print(f"  每剧集平均时间: {aggregated['eval_ep_s']:.2f} 秒")
            
            print(f"\n📋 各剧集详细结果:")
            for i, episode in enumerate(results["per_episode"]):
                print(f"  剧集 {i}: 总奖励={episode['sum_reward']:.4f}, "
                      f"最大奖励={episode['max_reward']:.4f}, "
                      f"成功={episode['success']}")
            
            # 检查输出文件
            eval_info_file = Path(output_dir) / "eval_info.json"
            if eval_info_file.exists():
                print(f"\n📁 评估信息已保存: {eval_info_file}")
                with open(eval_info_file) as f:
                    saved_results = json.load(f)
                    print("✅ 保存的结果文件格式正确")
            
            # 检查视频文件
            videos_dir = Path(output_dir) / "videos"
            if videos_dir.exists():
                video_files = list(videos_dir.glob("*.mp4"))
                print(f"📹 生成的视频文件: {len(video_files)} 个")
                for video_file in video_files:
                    print(f"  - {video_file.name}")
            
            return True
            
    except Exception as e:
        print(f"❌ 评估逻辑测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def run_simple_test():
    """基于提供的测试文件的简化测试"""
    print("\n🧪 运行简化测试（基于提供的测试文件）...")
    
    try:
        from training_platform.evaluator.evaluator_logic import run_lerobot_evaluation
        
        # 基于附件测试文件，但修正配置
        model_path = "lerobot/act_aloha_sim_insertion_human"
        output_dir = Path("./outputs/eval/aloha_sim_insertion_human")
        
        # 清理之前的输出
        if output_dir.exists():
            shutil.rmtree(output_dir)
        
        # 修正后的配置
        env_config = {
            "type": "aloha",  # 添加必需的 type 字段
            "task": "AlohaInsertion-v0",  # 使用正确的任务名
            "fps": 50,
            "episode_length": 400,
            "obs_type": "pixels_agent_pos", 
            "render_mode": "rgb_array"
        }
        
        eval_config = {
            "n_episodes": 4,
            "batch_size": 2,
            "use_async_envs": False
        }
        
        print(f"运行评估：模型 {model_path}")
        print(f"环境：{env_config['task']}")
        print(f"剧集数：{eval_config['n_episodes']}")
        
        # 运行评估
        eval_results = run_lerobot_evaluation(
            model_path=model_path,
            env_config=env_config,
            eval_config=eval_config,
            output_dir=str(output_dir),
            max_episodes_rendered=2,
            seed=42
        )
        
        print("\n--- 评估完成 ---")
        print("\n聚合结果:")
        for key, value in eval_results.get("aggregated", {}).items():
            print(f"  {key}: {value}")
        
        print("\n各剧集结果:")
        for i, episode in enumerate(eval_results.get("per_episode", [])[:2]):
            print(f"  剧集 {i}: {episode}")
        
        # 验证文件
        eval_info_file = output_dir / "eval_info.json"
        assert eval_info_file.exists(), "评估信息文件未创建"
        print(f"✅ 评估信息文件已保存：{eval_info_file}")
        
        video_dir = output_dir / "videos"
        if video_dir.exists():
            videos = list(video_dir.glob("*.mp4"))
            print(f"✅ 生成了 {len(videos)} 个视频文件")
        
        return True
        
    except Exception as e:
        print(f"❌ 简化测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def run_comprehensive_test():
    """运行综合测试"""
    print("🚀 开始 evaluator_logic 模块正确性测试")
    print("=" * 60)
    
    tests = [
        ("模块导入", test_imports),
        ("预训练模型加载", test_model_loading),
        ("环境创建", test_environment_creation),
        ("完整评估流程", run_evaluator_logic_test),
        ("简化测试", run_simple_test),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        
        try:
            if test_func():
                passed += 1
                print(f"✅ {test_name} 测试通过")
            else:
                print(f"❌ {test_name} 测试失败")
                # 如果核心测试失败，可能需要跳过后续测试
                if test_name in ["模块导入", "预训练模型加载"]:
                    print("⚠️  核心功能测试失败，跳过后续测试")
                    break
        except Exception as e:
            print(f"❌ {test_name} 测试异常: {e}")
            if test_name in ["模块导入", "预训练模型加载"]:
                print("⚠️  核心功能测试失败，跳过后续测试")
                break
    
    print(f"\n{'='*60}")
    print(f"测试结果: {passed}/{total} 通过")
    print(f"{'='*60}")
    
    if passed == total:
        print("🎉 所有测试通过！evaluator_logic 模块工作正常。")
        print("\n📋 测试总结:")
        print("✅ 模块导入正常")
        print("✅ 预训练模型加载成功")
        print("✅ 环境创建和配置正确") 
        print("✅ 完整评估流程运行成功")
        print("✅ 评估结果格式正确")
        print("✅ 输出文件保存正常")
        
        print("\n🎯 模型评估结果表明:")
        print("• evaluator_logic 模块的核心功能正常")
        print("• 能够成功加载和使用预训练模型")
        print("• 评估流程完整，结果可信")
        print("• 可以用于生产环境的模型评估")
        
    else:
        print("⚠️  部分测试失败，请检查相关功能。")
        print("\n🔧 可能的解决方案:")
        print("1. 检查网络连接，确保能访问 Hugging Face Hub")
        print("2. 确保安装了所有必要的依赖包")
        print("3. 检查 LeRobot 环境配置是否正确")
        print("4. 验证模型 ID 是否存在和可访问")
    
    return passed == total

if __name__ == "__main__":
    success = run_comprehensive_test()
    
    if success:
        print("\n🎊 evaluator_logic 模块验证完成，功能正常！")
    else:
        print("\n❌ evaluator_logic 模块验证失败，需要进一步调试。")
    
    sys.exit(0 if success else 1)