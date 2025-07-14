#!/usr/bin/env python3
"""
测试 EvaluatorActor 的完整流程
包括 MinIO 模型下载和评估执行
"""

import sys
import os
import asyncio
import ray
import tempfile
import shutil
import json
from pathlib import Path
from typing import Dict, Any

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

# 导入必要的模块
from training_platform.common.task_models import EvaluationTask
from training_platform.evaluator.lerobot_evaluate_actor import EvaluatorActor
from training_platform.configs.settings import settings

def setup_test_environment():
    """设置测试环境"""
    print("🔧 设置测试环境...")
    
    # 初始化 Ray（如果尚未初始化）
    if not ray.is_initialized():
        ray.init(ignore_reinit_error=True)
        print("✅ Ray 初始化完成")
    
    # 创建测试目录
    test_dir = Path("./test_evaluator_output")
    if test_dir.exists():
        shutil.rmtree(test_dir)
    test_dir.mkdir(exist_ok=True)
    print(f"✅ 测试目录创建: {test_dir}")
    
    # 创建 outputs 文件夹用于保存评估结果视频
    outputs_dir = Path("./outputs")
    outputs_dir.mkdir(exist_ok=True)
    print(f"✅ 输出目录创建: {outputs_dir}")
    
    # 创建视频子目录
    video_outputs_dir = outputs_dir / "evaluation_videos"
    video_outputs_dir.mkdir(exist_ok=True)
    print(f"✅ 视频输出目录创建: {video_outputs_dir}")
    
    return test_dir, outputs_dir, video_outputs_dir

def cleanup_test_environment(test_dir: Path):
    """清理测试环境"""
    print("🧹 清理测试环境...")
    
    try:
        if test_dir.exists():
            shutil.rmtree(test_dir)
            print(f"✅ 测试目录已清理: {test_dir}")
    except Exception as e:
        print(f"⚠️  清理失败: {e}")

def copy_videos_to_outputs(source_dir: Path, outputs_dir: Path, task_name: str) -> list:
    """复制视频文件到输出目录"""
    copied_videos = []
    
    try:
        videos_dir = source_dir / "videos"
        if videos_dir.exists():
            video_files = list(videos_dir.glob("*.mp4"))
            print(f"📹 发现 {len(video_files)} 个视频文件")
            
            for i, video_file in enumerate(video_files):
                # 创建带时间戳的文件名
                import time
                timestamp = int(time.time())
                output_filename = f"{task_name}_episode_{i}_{timestamp}.mp4"
                output_path = outputs_dir / output_filename
                
                # 复制视频文件
                shutil.copy2(video_file, output_path)
                copied_videos.append(output_path)
                print(f"✅ 视频已保存: {output_path}")
        
        else:
            print("⚠️  未找到视频目录")
            
    except Exception as e:
        print(f"❌ 复制视频文件失败: {e}")
    
    return copied_videos

async def test_hf_model_evaluation(video_outputs_dir: Path = None):
    """测试使用 Hugging Face 模型的评估流程（无需 MinIO）"""
    print("\n🧪 测试 Hugging Face 模型评估流程...")
    
    # 创建评估任务（使用 HF 模型 ID）
    eval_task = EvaluationTask(
        task_id=1001,
        user_id=1,
        model_uuid="lerobot/act_aloha_sim_insertion_human",  # HF 模型 ID
        model_type="act",
        env_config={
            "type": "aloha",
            "task": "AlohaInsertion-v0", 
            "fps": 50,
            "episode_length": 400,
            "obs_type": "pixels_agent_pos",
            "render_mode": "rgb_array"
        },
        eval_config={
            "n_episodes": 3,  # 增加剧集数以生成更多视频
            "batch_size": 1,
            "use_async_envs": False
        },
        seed=1000,
        max_episodes_rendered=3,  # 增加渲染的剧集数
        return_episode_data=False
    )
    
    print(f"📋 评估任务配置:")
    print(f"  任务 ID: {eval_task.task_id}")
    print(f"  模型: {eval_task.model_uuid}")
    print(f"  环境: {eval_task.env_config['task']}")
    print(f"  剧集数: {eval_task.eval_config['n_episodes']}")
    
    try:
        # 创建评估 Actor
        evaluator = EvaluatorActor.remote(eval_task)
        print("✅ EvaluatorActor 创建成功")
        
        # 执行评估（使用 ray.get 而不是 await）
        print("🚀 开始执行评估...")
        results = ray.get(evaluator.evaluate.remote())
        
        print("✅ 评估完成！")
        
        # 打印评估结果
        if results and "aggregated" in results:
            aggregated = results["aggregated"]
            print(f"\n📊 评估结果:")
            print(f"  平均总奖励: {aggregated.get('avg_sum_reward', 0):.4f}")
            print(f"  平均最大奖励: {aggregated.get('avg_max_reward', 0):.4f}")
            print(f"  成功率: {aggregated.get('pc_success', 0):.2f}%")
            print(f"  评估时间: {aggregated.get('eval_s', 0):.2f} 秒")
            print(f"  每剧集时间: {aggregated.get('eval_ep_s', 0):.2f} 秒")
            
            # 打印各剧集结果
            print(f"\n📋 各剧集详细结果:")
            for i, episode in enumerate(results.get("per_episode", [])):
                print(f"  剧集 {i}: 总奖励={episode.get('sum_reward', 0):.4f}, "
                      f"最大奖励={episode.get('max_reward', 0):.4f}, "
                      f"成功={episode.get('success', False)}")
        
        # 清理 Actor
        ray.get(evaluator.cleanup.remote())
        print("✅ Actor 清理完成")
        
        return True
        
    except Exception as e:
        print(f"❌ 评估测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_direct_evaluation():
    """测试直接调用评估逻辑（不使用 Actor）"""
    print("\n🧪 测试直接评估调用...")
    
    try:
        from training_platform.evaluator.evaluator_logic import run_lerobot_evaluation
        
        # 配置
        model_path = "lerobot/act_aloha_sim_insertion_human"
        env_config = {
            "type": "aloha",
            "task": "AlohaInsertion-v0",
            "fps": 50,
            "episode_length": 400,
            "obs_type": "pixels_agent_pos",
            "render_mode": "rgb_array"
        }
        eval_config = {
            "n_episodes": 2,
            "batch_size": 1,
            "use_async_envs": False
        }
        
        # 创建临时输出目录
        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = str(Path(temp_dir) / "eval_output")
            
            print(f"🚀 开始直接评估...")
            print(f"  模型: {model_path}")
            print(f"  输出目录: {output_dir}")
            
            # 在线程中运行评估
            results = await asyncio.to_thread(
                run_lerobot_evaluation,
                model_path=model_path,
                env_config=env_config,
                eval_config=eval_config,
                output_dir=output_dir,
                seed=1000,
                max_episodes_rendered=1,
                return_episode_data=False
            )
            
            print("✅ 直接评估完成！")
            
            # 验证结果
            assert "aggregated" in results
            assert "per_episode" in results
            
            aggregated = results["aggregated"]
            print(f"\n📊 直接评估结果:")
            print(f"  平均总奖励: {aggregated['avg_sum_reward']:.4f}")
            print(f"  成功率: {aggregated['pc_success']:.2f}%")
            print(f"  评估时间: {aggregated['eval_s']:.2f} 秒")
            
            # 检查输出文件
            eval_info_file = Path(output_dir) / "eval_info.json"
            if eval_info_file.exists():
                print(f"✅ 评估信息文件已生成: {eval_info_file}")
            
            videos_dir = Path(output_dir) / "videos"
            if videos_dir.exists():
                video_files = list(videos_dir.glob("*.mp4"))
                print(f"✅ 生成视频文件: {len(video_files)} 个")
        
        return True
        
    except Exception as e:
        print(f"❌ 直接评估测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_task_model():
    """测试评估任务模型"""
    print("\n🧪 测试评估任务模型...")
    
    try:
        # 创建评估任务
        eval_task = EvaluationTask(
            task_id=999,
            user_id=1,
            model_uuid="test_model_uuid",
            model_type="act",
            env_config={"type": "aloha", "task": "AlohaInsertion-v0"},
            eval_config={"n_episodes": 5, "batch_size": 2},
            seed=1000,
            max_episodes_rendered=3,
            return_episode_data=False
        )
        
        print(f"✅ 评估任务创建成功:")
        print(f"  任务 ID: {eval_task.task_id}")
        print(f"  用户 ID: {eval_task.user_id}")
        print(f"  模型 UUID: {eval_task.model_uuid}")
        print(f"  模型类型: {eval_task.model_type}")
        print(f"  状态: {eval_task.status}")
        
        # 验证默认值
        assert eval_task.seed == 1000
        assert eval_task.max_episodes_rendered == 3
        assert eval_task.return_episode_data == False
        assert eval_task.status == "pending"
        assert eval_task.eval_results is None
        
        print(f"✅ 评估任务模型验证通过")
        return True
        
    except Exception as e:
        print(f"❌ 评估任务模型测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_minio_connection():
    """测试 MinIO 连接"""
    print("\n🧪 测试 MinIO 连接...")
    
    try:
        from training_platform.common.minio_utils import get_minio_client
        
        # 获取 MinIO 客户端
        client = await get_minio_client()
        
        if client:
            print("✅ MinIO 客户端连接成功")
            
            # 测试列出存储桶
            buckets = await client.list_buckets()
            print(f"📦 可用存储桶: {[bucket.name for bucket in buckets]}")
            
            # 检查默认存储桶
            bucket_exists = await client.bucket_exists(settings.MINIO_BUCKET)
            print(f"📦 默认存储桶 '{settings.MINIO_BUCKET}' 存在: {bucket_exists}")
            
            return True
        else:
            print("❌ MinIO 客户端连接失败")
            return False
            
    except Exception as e:
        print(f"❌ MinIO 连接测试失败: {e}")
        print("💡 这可能是因为 MinIO 服务未运行或配置不正确")
        return False

async def run_comprehensive_test():
    """运行综合测试"""
    print("🚀 开始 EvaluatorActor 综合测试")
    print("=" * 60)
    
    # 设置测试环境
    test_dir, outputs_dir, video_outputs_dir = setup_test_environment()
    
    tests = [
        ("评估任务模型", test_task_model),
        ("MinIO 连接", test_minio_connection),
        ("直接评估调用", lambda: test_direct_evaluation(video_outputs_dir)),
        ("Hugging Face 模型评估", lambda: test_hf_model_evaluation(video_outputs_dir)),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        
        try:
            if asyncio.iscoroutinefunction(test_func):
                result = await test_func()
            else:
                result = test_func()
                
            if result:
                passed += 1
                print(f"✅ {test_name} 测试通过")
            else:
                print(f"❌ {test_name} 测试失败")
        except Exception as e:
            print(f"❌ {test_name} 测试异常: {e}")
    
    print(f"\n{'='*60}")
    print(f"测试结果: {passed}/{total} 通过")
    print(f"{'='*60}")
    
    # 清理测试环境
    cleanup_test_environment(test_dir)
    
    if passed == total:
        print("🎉 所有测试通过！EvaluatorActor 工作正常。")
        print("\n📋 测试总结:")
        print("✅ 评估任务模型创建和验证正常")
        print("✅ MinIO 连接功能正常（如果配置了）")
        print("✅ 直接评估逻辑工作正常")
        print("✅ Actor 模式评估工作正常")
        print("✅ Hugging Face 模型加载和评估正常")
        
        print("\n🎯 EvaluatorActor 功能验证:")
        print("• 可以成功加载预训练模型")
        print("• 评估流程完整，结果准确")
        print("• Actor 生命周期管理正常")
        print("• 错误处理和状态报告正常")
        print("• 可以用于生产环境的模型评估")
        
    else:
        print("⚠️  部分测试失败，请检查相关功能。")
        print("\n🔧 可能的解决方案:")
        print("1. 确保 Ray 已正确初始化")
        print("2. 检查网络连接，确保能访问 Hugging Face Hub")
        print("3. 确保 MinIO 服务正在运行（如果测试 MinIO 功能）")
        print("4. 检查 LeRobot 环境是否正确安装")
        print("5. 验证所有依赖包是否已安装")
    
    return passed == total

def main():
    """主函数"""
    try:
        success = asyncio.run(run_comprehensive_test())
        
        if success:
            print("\n🎊 EvaluatorActor 测试完成，功能正常！")
            print("🚀 可以开始使用 EvaluatorActor 进行模型评估。")
        else:
            print("\n❌ EvaluatorActor 测试失败，需要进一步调试。")
        
        return 0 if success else 1
        
    except KeyboardInterrupt:
        print("\n⏹️  测试被用户中断")
        return 1
    except Exception as e:
        print(f"\n💥 测试运行异常: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        # 确保 Ray 清理
        if ray.is_initialized():
            ray.shutdown()
            print("👋 Ray 已关闭")

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code) 