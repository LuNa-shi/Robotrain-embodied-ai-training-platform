#!/usr/bin/env python3
"""
测试 run_lerobot_evaluation 函数的脚本

使用官方的 lerobot/act_aloha_sim_insertion_human 模型进行测试
配置：batch_size=50, n_episodes=50

使用方法:
    python test_run_evaluation.py
"""

import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path

# 添加项目根目录到Python路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from training_platform.evaluator.evaluator_logic import run_lerobot_evaluation

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('test_run_evaluation.log')
    ]
)

logger = logging.getLogger(__name__)


async def test_run_evaluation():
    """测试 run_lerobot_evaluation 函数"""
    
    # 使用官方的 LeRobot ACT ALOHA 模型
    model_path = "lerobot/act_aloha_sim_insertion_human"
    
    # 配置参数
    env_config = {
        "type": "aloha",
        "task": "AlohaInsertion-v0",
        "fps": 50,
        "episode_length": 400,
        "obs_type": "pixels_agent_pos",
        "render_mode": "rgb_array"
    }
    
    eval_config = {
        "n_episodes": 50,
        "batch_size": 50,
        "use_async_envs": False
    }
    
    # 输出目录
    output_dir = "./test_evaluation_output"
    
    logger.info("=" * 60)
    logger.info("开始测试 run_lerobot_evaluation 函数")
    logger.info("=" * 60)
    logger.info(f"模型路径: {model_path}")
    logger.info(f"环境配置: {json.dumps(env_config, indent=2)}")
    logger.info(f"评估配置: {json.dumps(eval_config, indent=2)}")
    logger.info(f"输出目录: {output_dir}")
    
    try:
        # 记录开始时间
        start_time = time.time()
        
        # 运行评估
        logger.info("开始执行评估...")
        results = await run_lerobot_evaluation(
            model_path=model_path,
            env_config=env_config,
            eval_config=eval_config,
            output_dir=output_dir,
            seed=1000,
            max_episodes_rendered=5,  # 渲染5个视频用于验证
            return_episode_data=False,
            eval_task_id="test_eval_001"
        )
        
        # 记录结束时间
        end_time = time.time()
        duration = end_time - start_time
        
        # 输出结果
        logger.info("=" * 60)
        logger.info("评估完成！")
        logger.info("=" * 60)
        logger.info(f"总耗时: {duration:.2f} 秒")
        logger.info(f"平均每episode耗时: {duration/50:.2f} 秒")
        logger.info(f"每秒处理episodes: {50/duration:.2f}")
        
        # 输出聚合结果
        aggregated = results.get('aggregated', {})
        logger.info("聚合结果:")
        logger.info(f"  平均总奖励: {aggregated.get('avg_sum_reward', 'N/A'):.2f}")
        logger.info(f"  平均最大奖励: {aggregated.get('avg_max_reward', 'N/A'):.2f}")
        logger.info(f"  成功率: {aggregated.get('pc_success', 'N/A'):.1f}%")
        logger.info(f"  评估耗时: {aggregated.get('eval_s', 'N/A'):.2f} 秒")
        logger.info(f"  每episode评估耗时: {aggregated.get('eval_ep_s', 'N/A'):.2f} 秒")
        
        # 检查输出文件
        output_path = Path(output_dir)
        if output_path.exists():
            logger.info("输出文件检查:")
            
            # 检查评估信息文件
            eval_info_path = output_path / "eval_info.json"
            if eval_info_path.exists():
                logger.info(f"  ✓ 评估信息文件: {eval_info_path}")
                # 读取并显示部分内容
                with open(eval_info_path, 'r') as f:
                    eval_info = json.load(f)
                logger.info(f"    文件大小: {eval_info_path.stat().st_size} 字节")
                logger.info(f"    包含 {len(eval_info.get('per_episode', []))} 个episode数据")
            else:
                logger.warning("  ✗ 评估信息文件未生成")
            
            # 检查视频文件
            videos_dir = output_path / "videos"
            if videos_dir.exists():
                video_files = list(videos_dir.glob("*.mp4"))
                logger.info(f"  ✓ 视频目录: {videos_dir}")
                logger.info(f"    生成了 {len(video_files)} 个视频文件")
                for i, video_file in enumerate(video_files[:3]):  # 只显示前3个
                    size_mb = video_file.stat().st_size / (1024 * 1024)
                    logger.info(f"    {i+1}. {video_file.name} ({size_mb:.1f} MB)")
                if len(video_files) > 3:
                    logger.info(f"    ... 还有 {len(video_files) - 3} 个视频文件")
            else:
                logger.warning("  ✗ 视频目录未生成")
        
        # 输出详细的episode结果（前5个）
        per_episode = results.get('per_episode', [])
        if per_episode:
            logger.info("前5个episode结果:")
            for i, episode in enumerate(per_episode[:5]):
                logger.info(f"  Episode {i+1}: "
                           f"总奖励={episode.get('sum_reward', 'N/A'):.2f}, "
                           f"最大奖励={episode.get('max_reward', 'N/A'):.2f}, "
                           f"成功={episode.get('success', 'N/A')}")
        
        # 性能分析
        logger.info("=" * 60)
        logger.info("性能分析")
        logger.info("=" * 60)
        
        # 计算理论性能
        theoretical_batches = 50 // 50  # n_episodes // batch_size
        logger.info(f"理论批次数: {theoretical_batches}")
        logger.info(f"实际批次数: {theoretical_batches} (应该等于1)")
        
        # 计算吞吐量
        episodes_per_second = 50 / duration
        logger.info(f"吞吐量: {episodes_per_second:.2f} episodes/秒")
        
        # 与预期性能对比
        expected_duration = 50 / 50  # 假设每秒50个episodes的理想情况
        efficiency = expected_duration / duration * 100
        logger.info(f"效率: {efficiency:.1f}% (相对于理想情况)")
        
        return results
        
    except Exception as e:
        logger.error(f"评估失败: {e}")
        import traceback
        logger.error(f"详细错误信息: {traceback.format_exc()}")
        return None


async def main():
    """主函数"""
    logger.info("开始测试 run_lerobot_evaluation 函数")
    logger.info("使用官方模型: lerobot/act_aloha_sim_insertion_human")
    logger.info("配置: batch_size=50, n_episodes=50")
    
    # 检查是否在正确的环境中
    try:
        import torch
        logger.info(f"PyTorch版本: {torch.__version__}")
        logger.info(f"CUDA可用: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            logger.info(f"CUDA设备数量: {torch.cuda.device_count()}")
            logger.info(f"当前CUDA设备: {torch.cuda.current_device()}")
    except ImportError:
        logger.warning("PyTorch未安装")
    
    # 运行测试
    results = await test_run_evaluation()
    
    if results:
        logger.info("测试成功完成！")
    else:
        logger.error("测试失败！")
    
    logger.info("测试结束")


if __name__ == "__main__":
    asyncio.run(main()) 