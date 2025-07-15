#!/usr/bin/env python3
"""
示例：如何使用不同的调度器模式

这个文件展示了如何使用统一调度器和分离调度器来处理训练和评估任务。
"""

import json
import pika
import asyncio
import ray
from training_platform.configs.settings import settings

def send_training_task():
    """发送训练任务请求"""
    print("📤 发送训练任务请求...")
    
    training_message = {
        "task_type": "training",
        "task_id": 1001,
        "user_id": 1,
        "dataset_uuid": "lerobot/aloha_sim_insertion_human",
        "model_type": "act",
        "config": {
            "policy": {"type": "act"},
            "env": {"type": "aloha"},
            "dataset": {"repo_id": "lerobot/aloha_sim_insertion_human"},
            "steps": 1000,
            "save_freq": 250,
            "batch_size": 8,
        }
    }
    
    connection = pika.BlockingConnection(pika.ConnectionParameters(settings.RABBITMQ_SERVER))
    channel = connection.channel()
    
    channel.basic_publish(
        exchange=settings.RABBIT_EXCHANGE_NAME,
        routing_key=settings.RABBIT_REQUEST_BINDING_KEY,
        body=json.dumps(training_message)
    )
    
    connection.close()
    print("✅ 训练任务已发送")

def send_evaluation_task():
    """发送评估任务请求"""
    print("📤 发送评估任务请求...")
    
    evaluation_message = {
        "task_type": "evaluation",
        "task_id": 2001,
        "user_id": 1,
        "model_uuid": "lerobot/act_aloha_sim_insertion_human",
        "model_type": "act",
        "env_config": {
            "type": "aloha",
            "task": "AlohaInsertion-v0",
            "fps": 50,
            "episode_length": 400,
            "obs_type": "pixels_agent_pos",
            "render_mode": "rgb_array"
        },
        "eval_config": {
            "n_episodes": 10,
            "batch_size": 1,
            "use_async_envs": False
        },
        "seed": 1000,
        "max_episodes_rendered": 5,
        "return_episode_data": False
    }
    
    connection = pika.BlockingConnection(pika.ConnectionParameters(settings.RABBITMQ_SERVER))
    channel = connection.channel()
    
    channel.basic_publish(
        exchange=settings.RABBIT_EXCHANGE_NAME,
        routing_key=settings.RABBIT_REQUEST_BINDING_KEY,
        body=json.dumps(evaluation_message)
    )
    
    connection.close()
    print("✅ 评估任务已发送")

async def test_unified_scheduler():
    """测试统一调度器"""
    print("\n🧪 测试统一调度器模式")
    print("=" * 50)
    
    # 初始化 Ray
    if not ray.is_initialized():
        ray.init()
    
    # 启动统一调度器
    from training_platform.scheduler.scheduler_actor import Scheduler
    scheduler = Scheduler.options(name="TestUnifiedScheduler").remote()
    scheduler.run.remote()
    
    # 等待调度器启动
    await asyncio.sleep(2)
    
    # 发送混合任务
    print("📤 发送混合任务到统一调度器...")
    
    # 发送训练任务
    training_task = {
        "task_type": "training",
        "task_id": 3001,
        "user_id": 1,
        "dataset_uuid": "lerobot/aloha_sim_insertion_human",
        "model_type": "act",
        "config": {
            "policy": {"type": "act"},
            "env": {"type": "aloha"},
            "dataset": {"repo_id": "lerobot/aloha_sim_insertion_human"},
            "steps": 100,
            "save_freq": 25,
            "batch_size": 8,
        }
    }
    
    await scheduler.add_task.remote(training_task)
    
    # 发送评估任务
    evaluation_task = {
        "task_type": "evaluation",
        "task_id": 3002,
        "user_id": 1,
        "model_uuid": "lerobot/act_aloha_sim_insertion_human",
        "model_type": "act",
        "env_config": {
            "type": "aloha",
            "task": "AlohaInsertion-v0",
            "fps": 50,
            "episode_length": 400,
            "obs_type": "pixels_agent_pos",
            "render_mode": "rgb_array"
        },
        "eval_config": {
            "n_episodes": 5,
            "batch_size": 1,
            "use_async_envs": False
        },
        "seed": 42,
        "max_episodes_rendered": 3,
        "return_episode_data": False
    }
    
    await scheduler.add_task.remote(evaluation_task)
    
    print("✅ 混合任务已发送到统一调度器")
    
    # 等待一段时间让任务执行
    await asyncio.sleep(10)
    
    # 清理
    ray.kill(scheduler)

async def test_separate_schedulers():
    """测试分离调度器"""
    print("\n🧪 测试分离调度器模式")
    print("=" * 50)
    
    # 初始化 Ray
    if not ray.is_initialized():
        ray.init()
    
    # 启动分离的调度器
    from training_platform.scheduler.scheduler_actor import TrainingScheduler, EvaluationScheduler
    
    training_scheduler = TrainingScheduler.options(name="TestTrainingScheduler").remote()
    evaluation_scheduler = EvaluationScheduler.options(name="TestEvaluationScheduler").remote()
    
    training_scheduler.run.remote()
    evaluation_scheduler.run.remote()
    
    # 等待调度器启动
    await asyncio.sleep(2)
    
    # 发送任务到各自的调度器
    print("📤 发送任务到分离调度器...")
    
    # 训练任务
    training_task = {
        "task_id": 4001,
        "user_id": 1,
        "dataset_uuid": "lerobot/aloha_sim_insertion_human",
        "model_type": "act",
        "config": {
            "policy": {"type": "act"},
            "env": {"type": "aloha"},
            "dataset": {"repo_id": "lerobot/aloha_sim_insertion_human"},
            "steps": 100,
            "save_freq": 25,
            "batch_size": 8,
        }
    }
    
    await training_scheduler.add_task.remote(training_task)
    
    # 评估任务
    evaluation_task = {
        "task_id": 4002,
        "user_id": 1,
        "model_uuid": "lerobot/act_aloha_sim_insertion_human",
        "model_type": "act",
        "env_config": {
            "type": "aloha",
            "task": "AlohaInsertion-v0",
            "fps": 50,
            "episode_length": 400,
            "obs_type": "pixels_agent_pos",
            "render_mode": "rgb_array"
        },
        "eval_config": {
            "n_episodes": 5,
            "batch_size": 1,
            "use_async_envs": False
        },
        "seed": 42,
        "max_episodes_rendered": 3,
        "return_episode_data": False
    }
    
    await evaluation_scheduler.add_task.remote(evaluation_task)
    
    print("✅ 任务已发送到分离调度器")
    
    # 等待一段时间让任务执行
    await asyncio.sleep(10)
    
    # 清理
    ray.kill(training_scheduler)
    ray.kill(evaluation_scheduler)

def main():
    """主函数"""
    print("🚀 调度器使用示例")
    print("=" * 50)
    
    # 测试基本消息发送
    print("\n📤 测试基本消息发送...")
    send_training_task()
    send_evaluation_task()
    
    # 测试统一调度器
    asyncio.run(test_unified_scheduler())
    
    # 测试分离调度器
    asyncio.run(test_separate_schedulers())
    
    print("\n📋 调度器模式说明：")
    print("1. 统一调度器 (Unified Scheduler):")
    print("   - 同时处理训练和评估任务")
    print("   - 并行执行，资源共享")
    print("   - 适合资源有限的环境")
    print()
    print("2. 分离调度器 (Separate Schedulers):")
    print("   - 训练和评估任务分别处理")
    print("   - 独立资源分配")
    print("   - 适合大规模部署")
    print()
    print("3. 消息格式：")
    print("   - 训练任务：需要 dataset_uuid, model_type, config")
    print("   - 评估任务：需要 model_uuid, model_type, env_config, eval_config")
    print("   - task_type 字段用于区分任务类型")

if __name__ == "__main__":
    main() 