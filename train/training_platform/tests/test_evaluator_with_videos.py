#!/usr/bin/env python3
"""
专门用于生成评估视频的测试脚本
会将生成的视频保存到 outputs 文件夹中
"""

import sys
import os
import asyncio
import tempfile
import shutil
import json
import time
from pathlib import Path
from typing import Dict, Any, Optional

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

def setup_video_environment():
    """设置视频生成环境"""
    print("🎬 设置视频生成环境...")
    
    # 创建 outputs 文件夹
    outputs_dir = Path("./outputs")
    outputs_dir.mkdir(exist_ok=True)
    print(f"✅ 输出目录创建: {outputs_dir}")
    
    # 创建评估视频子目录
    evaluation_videos_dir = outputs_dir / "evaluation_videos"
    evaluation_videos_dir.mkdir(exist_ok=True)
    print(f"✅ 评估视频目录创建: {evaluation_videos_dir}")
    
    # 创建评估结果子目录
    evaluation_results_dir = outputs_dir / "evaluation_results"
    evaluation_results_dir.mkdir(exist_ok=True)
    print(f"✅ 评估结果目录创建: {evaluation_results_dir}")
    
    return outputs_dir, evaluation_videos_dir, evaluation_results_dir

def copy_videos_to_outputs(source_dir: Path, target_dir: Path, task_name: str) -> list:
    """复制视频文件到输出目录"""
    copied_videos = []
    
    try:
        videos_dir = source_dir / "videos"
        if videos_dir.exists():
            video_files = list(videos_dir.glob("*.mp4"))
            print(f"📹 发现 {len(video_files)} 个视频文件")
            
            for i, video_file in enumerate(video_files):
                # 创建带时间戳的文件名
                timestamp = int(time.time())
                output_filename = f"{task_name}_episode_{i}_{timestamp}.mp4"
                output_path = target_dir / output_filename
                
                # 复制视频文件
                shutil.copy2(video_file, output_path)
                copied_videos.append(output_path)
                print(f"✅ 视频已保存: {output_path}")
                
        else:
            print("⚠️  未找到视频目录")
            
    except Exception as e:
        print(f"❌ 复制视频文件失败: {e}")
    
    return copied_videos

def save_evaluation_results(results: Dict[str, Any], target_dir: Path, task_name: str):
    """保存评估结果到JSON文件"""
    try:
        timestamp = int(time.time())
        results_filename = f"{task_name}_results_{timestamp}.json"
        results_path = target_dir / results_filename
        
        # 保存评估结果
        with open(results_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        
        print(f"✅ 评估结果已保存: {results_path}")
        return results_path
        
    except Exception as e:
        print(f"❌ 保存评估结果失败: {e}")
        return None

async def test_direct_evaluation_with_videos():
    """测试直接评估调用并生成视频"""
    print("\n🎬 测试直接评估调用（生成视频）...")
    
    try:
        from training_platform.evaluator.evaluator_logic import run_lerobot_evaluation
        
        # 设置环境
        outputs_dir, video_dir, results_dir = setup_video_environment()
        
        # 配置 - 增加剧集数和渲染数量
        model_path = "lerobot/act_aloha_sim_insertion_human"
        env_config = {
            "type": "aloha",
            "task": "AlohaInsertion-v0",
            "fps": 50,
            "episode_length": 400,
            "obs_type": "pixels_agent_pos",
            "render_mode": "rgb_array"  # 确保渲染模式正确
        }
        eval_config = {
            "n_episodes": 5,  # 增加剧集数
            "batch_size": 1,
            "use_async_envs": False
        }
        
        # 创建临时输出目录
        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = str(Path(temp_dir) / "eval_output")
            
            print(f"🚀 开始评估并生成视频...")
            print(f"  模型: {model_path}")
            print(f"  剧集数: {eval_config['n_episodes']}")
            print(f"  渲染剧集数: 5")
            print(f"  临时输出目录: {output_dir}")
            
            # 在线程中运行评估
            results = await asyncio.to_thread(
                run_lerobot_evaluation,
                model_path=model_path,
                env_config=env_config,
                eval_config=eval_config,
                output_dir=output_dir,
                seed=1000,
                max_episodes_rendered=5,  # 渲染所有剧集
                return_episode_data=False
            )
            
            print("✅ 评估完成！")
            
            # 保存评估结果
            save_evaluation_results(results, results_dir, "direct_evaluation")
            
            # 复制视频到输出目录
            copied_videos = copy_videos_to_outputs(
                Path(output_dir), video_dir, "direct_evaluation"
            )
            
            # 打印评估结果
            if "aggregated" in results:
                aggregated = results["aggregated"]
                print(f"\n📊 评估结果:")
                print(f"  平均总奖励: {aggregated['avg_sum_reward']:.4f}")
                print(f"  成功率: {aggregated['pc_success']:.2f}%")
                print(f"  评估时间: {aggregated['eval_s']:.2f} 秒")
                print(f"  生成视频数量: {len(copied_videos)}")
                
                # 打印各剧集结果
                print(f"\n📋 各剧集详细结果:")
                for i, episode in enumerate(results.get("per_episode", [])):
                    print(f"  剧集 {i}: 总奖励={episode.get('sum_reward', 0):.4f}, "
                          f"最大奖励={episode.get('max_reward', 0):.4f}, "
                          f"成功={episode.get('success', False)}")
            
            # 检查其他输出文件
            eval_info_file = Path(output_dir) / "eval_info.json"
            if eval_info_file.exists():
                print(f"✅ 评估信息文件已生成: {eval_info_file}")
                # 也复制评估信息文件
                eval_info_target = results_dir / f"direct_evaluation_info_{int(time.time())}.json"
                shutil.copy2(eval_info_file, eval_info_target)
                print(f"✅ 评估信息已保存: {eval_info_target}")
        
        return True, copied_videos, results
        
    except Exception as e:
        print(f"❌ 评估测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False, [], {}

def test_task_model():
    """测试评估任务模型"""
    print("\n🧪 测试评估任务模型...")
    
    try:
        from training_platform.common.task_models import EvaluationTask
        
        # 创建评估任务
        eval_task = EvaluationTask(
            task_id=999,
            user_id=1,
            model_uuid="lerobot/act_aloha_sim_insertion_human",
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
                "n_episodes": 5,
                "batch_size": 1,
                "use_async_envs": False
            },
            seed=1000,
            max_episodes_rendered=5,
            return_episode_data=False
        )
        
        print(f"✅ 评估任务创建成功:")
        print(f"  任务 ID: {eval_task.task_id}")
        print(f"  模型: {eval_task.model_uuid}")
        print(f"  环境: {eval_task.env_config['task']}")
        print(f"  剧集数: {eval_task.eval_config['n_episodes']}")
        print(f"  渲染剧集数: {eval_task.max_episodes_rendered}")
        
        return True
        
    except Exception as e:
        print(f"❌ 评估任务模型测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def display_video_info(video_outputs_dir: Path):
    """显示生成的视频信息"""
    print(f"\n📹 生成的评估视频:")
    print(f"视频保存位置: {video_outputs_dir}")
    
    video_files = list(video_outputs_dir.glob("*.mp4"))
    if video_files:
        print(f"📊 视频统计:")
        print(f"  总视频数量: {len(video_files)}")
        
        total_size = 0
        for video_file in video_files:
            file_size = video_file.stat().st_size
            total_size += file_size
            size_mb = file_size / (1024 * 1024)
            print(f"  📄 {video_file.name} ({size_mb:.2f} MB)")
        
        total_size_mb = total_size / (1024 * 1024)
        print(f"  📊 总大小: {total_size_mb:.2f} MB")
        
        print(f"\n💡 使用方法:")
        print(f"  可以使用视频播放器打开这些文件观看评估过程")
        print(f"  文件路径: {video_outputs_dir.absolute()}")
        
    else:
        print("⚠️  未找到生成的视频文件")

async def run_video_evaluation_test():
    """运行视频评估测试"""
    print("🎬 开始评估视频生成测试")
    print("=" * 60)
    
    outputs_dir, video_dir, results_dir = setup_video_environment()
    
    tests = [
        ("评估任务模型", test_task_model),
        ("直接评估调用（生成视频）", test_direct_evaluation_with_videos),
    ]
    
    passed = 0
    total = len(tests)
    all_videos = []
    all_results = {}
    
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        
        try:
            if asyncio.iscoroutinefunction(test_func):
                result = await test_func()
                if isinstance(result, tuple):
                    success, videos, results = result
                    if success:
                        passed += 1
                        all_videos.extend(videos)
                        all_results.update(results)
                    result = success
                else:
                    if result:
                        passed += 1
            else:
                result = test_func()
                if result:
                    passed += 1
                
            if result:
                print(f"✅ {test_name} 测试通过")
            else:
                print(f"❌ {test_name} 测试失败")
        except Exception as e:
            print(f"❌ {test_name} 测试异常: {e}")
    
    print(f"\n{'='*60}")
    print(f"测试结果: {passed}/{total} 通过")
    print(f"{'='*60}")
    
    # 显示视频信息
    display_video_info(video_dir)
    
    if passed >= 1:  # 至少有一个测试通过
        print("\n🎉 视频评估测试完成！")
        print("\n📋 测试总结:")
        if len(all_videos) > 0:
            print(f"✅ 成功生成 {len(all_videos)} 个评估视频")
            print(f"✅ 视频保存在: {video_dir}")
            print(f"✅ 结果保存在: {results_dir}")
        
        print("\n🎯 生成的内容:")
        print("• 评估过程视频文件 (.mp4)")
        print("• 评估结果数据 (.json)")
        print("• 详细的剧集统计信息")
        
        print(f"\n📁 输出目录结构:")
        print(f"outputs/")
        print(f"├── evaluation_videos/  # 评估视频文件")
        print(f"└── evaluation_results/ # 评估结果数据")
        
    else:
        print("⚠️  视频评估测试失败，请检查相关功能。")
        print("\n🔧 可能的解决方案:")
        print("1. 检查网络连接，确保能访问 Hugging Face Hub")
        print("2. 确保 LeRobot 环境正确安装")
        print("3. 验证评估环境配置")
    
    return passed >= 1

def main():
    """主函数"""
    try:
        success = asyncio.run(run_video_evaluation_test())
        
        if success:
            print("\n🎊 评估视频生成测试完成！")
            print("🎬 可以在 outputs/evaluation_videos/ 目录中查看生成的视频。")
        else:
            print("\n❌ 评估视频生成测试失败。")
        
        return 0 if success else 1
        
    except KeyboardInterrupt:
        print("\n⏹️  测试被用户中断")
        return 1
    except Exception as e:
        print(f"\n💥 测试运行异常: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code) 