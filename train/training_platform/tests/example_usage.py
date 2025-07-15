#!/usr/bin/env python3
"""
示例：如何发送训练和评估请求到 run_platform

这个文件展示了如何构造不同类型的消息来触发训练或评估任务。
"""

import json
import pika
from training_platform.configs.settings import settings

def send_training_task():
    """发送训练任务请求"""
    print("📤 发送训练任务请求...")
    
    # 训练任务消息格式
    training_message = {
        "task_type": "training",  # 指定任务类型为训练
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
    
    # 发送到 RabbitMQ
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
    
    # 评估任务消息格式
    evaluation_message = {
        "task_type": "evaluation",  # 指定任务类型为评估
        "task_id": 2001,
        "user_id": 1,
        "model_uuid": "lerobot/act_aloha_sim_insertion_human",  # 可以是 HF 模型 ID
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
    
    # 发送到 RabbitMQ
    connection = pika.BlockingConnection(pika.ConnectionParameters(settings.RABBITMQ_SERVER))
    channel = connection.channel()
    
    channel.basic_publish(
        exchange=settings.RABBIT_EXCHANGE_NAME,
        routing_key=settings.RABBIT_REQUEST_BINDING_KEY,
        body=json.dumps(evaluation_message)
    )
    
    connection.close()
    print("✅ 评估任务已发送")

def send_evaluation_task_with_trained_model():
    """发送使用训练任务 ID 的评估任务请求"""
    print("📤 发送基于训练任务的评估请求...")
    
    # 使用训练任务 ID 的评估任务消息格式
    evaluation_message = {
        "task_type": "evaluation",
        "task_id": 2002,
        "user_id": 1,
        "model_uuid": "1001",  # 训练任务 ID，会自动查找最新 checkpoint
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
        "return_episode_data": True
    }
    
    # 发送到 RabbitMQ
    connection = pika.BlockingConnection(pika.ConnectionParameters(settings.RABBITMQ_SERVER))
    channel = connection.channel()
    
    channel.basic_publish(
        exchange=settings.RABBIT_EXCHANGE_NAME,
        routing_key=settings.RABBIT_REQUEST_BINDING_KEY,
        body=json.dumps(evaluation_message)
    )
    
    connection.close()
    print("✅ 基于训练任务的评估任务已发送")

if __name__ == "__main__":
    print("🚀 示例：发送不同类型的任务请求")
    print("=" * 50)
    
    # 发送训练任务
    send_training_task()
    print()
    
    # 发送评估任务（使用 HF 模型）
    send_evaluation_task()
    print()
    
    # 发送评估任务（使用训练任务 ID）
    send_evaluation_task_with_trained_model()
    print()
    
    print("📋 消息格式说明：")
    print("1. 训练任务：需要 dataset_uuid, model_type, config")
    print("2. 评估任务：需要 model_uuid, model_type, env_config, eval_config")
    print("3. model_uuid 可以是：")
    print("   - Hugging Face 模型 ID（如：lerobot/act_aloha_sim_insertion_human）")
    print("   - 训练任务 ID（如：1001，会自动查找最新 checkpoint）")
    print("   - 完整的 checkpoint 路径")
    print("4. task_type 字段用于区分任务类型：")
    print("   - 'training' 或省略：训练任务")
    print("   - 'evaluation'：评估任务") 