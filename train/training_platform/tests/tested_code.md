现在我在做一个训练服务平台，要负责训练器的部分。大概分为三个大类。一个是scheduler类，负责接受后端的任务请求。后端通过RabbitMQ发送一个新的任务给scheduler，包括taskid,userid,config,uuid等一系列内容。scheduler主要维护一个任务队列，通过FIFO的方式维护里面的训练任务，记录每个任务训练的多少步。到达一定step之后切换下一个任务并扔到队尾。当队列状态改变：A任务开始训练/ A任务被删除/ A任务在排队训练。都需要用RabbitMQ发给后端进行状态修改。接下来scheduler选中的任务会进入Trainer 进行训练。可以使用类似ray的框架，支持分布式训练，主要使用ray Train以便于部署到多卡上。trainer的代码主要参考lerobot中train的代码，会依赖lerobot中很多库的内容。在训练的过程中，Logger负责实时将训练进展（当前step，loss等）通过rabbitMQ发送给后端，以便于前端页面的实时更新。最后训练结束后，或者间隔一段时间，会把ckpt放在minIO存储中。我现在已经写了trainActor和trainlogic的基本实现，现在要测试一下TrainActor的基本功能（在ray环境中）。暂时不会测试scheduler的实现。但是我会把scheduler的调用给你。测试大概分为这么几个部分。测试一：预先在minio中存储一个dataset，actor从中得到数据集之后开始训练，然后再minio中save ckpt。 测试二：检测是否能从中断点继续进行训练。（本阶段不做要求）。数据集的下载使用huggingface lerobot，存储到minio中作为初始dataset（测试预处理）具体路径在接下来我给你的config中有体现。trainActor接受一个TrainingTask作为输入，你可以进行一些自定义，但是具体字段需要负责我给你的这个config。这个config的路径在./config/act_aloha_config.json
{
"dataset": {
"repo_id": "lerobot/aloha_sim_insertion_human",
"episodes": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
"video_backend": "pyav",
"image_transforms": {
"enable": true
}
},
"env": {
"type": "aloha",
"task": "AlohaInsertion-v0",
"fps": 50,
"episode_length": 400,
"obs_type": "pixels_agent_pos",
"render_mode": "rgb_array"
},
"policy": {
"type": "act",
"device": "cuda",
"use_amp": true,
"n_obs_steps": 1,
"chunk_size": 100,
"n_action_steps": 100,
"vision_backbone": "resnet18",
"pretrained_backbone_weights": "ResNet18_Weights.IMAGENET1K_V1",
"replace_final_stride_with_dilation": false,
"pre_norm": false,
"dim_model": 512,
"n_heads": 8,
"dim_feedforward": 3200,
"feedforward_activation": "relu",
"n_encoder_layers": 4,
"n_decoder_layers": 1,
"use_vae": true,
"latent_dim": 32,
"n_vae_encoder_layers": 4,
"temporal_ensemble_coeff": null,
"dropout": 0.1,
"kl_weight": 10.0,
"optimizer_lr": 1e-5,
"optimizer_weight_decay": 1e-4,
"optimizer_lr_backbone": 1e-5
},
"output_dir": null,
"job_name": null,
"resume": false,
"seed": 1000,
"num_gpus": 1,
"num_workers": 4,
"batch_size": 8,
"steps": 100000,
"eval_freq": 20000,
"log_freq": 200,
"save_checkpoint": true,
"save_freq": 20000,
"use_policy_training_preset": true,
"optimizer": null,
"scheduler": null,
"eval": {
"n_episodes": 10,
"batch_size": 4
},
"wandb": {
"enable": false,
"disable_artifact": false,
"project": "lerobot",
"entity": null,
"notes": null,
"run_id": null
}
}

以下是一些你可能需要的文件，在以下training platform目录里可以找到
.
├── init.py
├── pycache
│   └── init.cpython-310.pyc
├── common
│   ├── init.py
│   ├── pycache
│   │   ├── init.cpython-310.pyc
│   │   ├── minio_utils.cpython-310.pyc
│   │   ├── rabbitmq_utils.cpython-310.pyc
│   │   └── task_models.cpython-310.pyc
│   ├── minio_utils.py
│   ├── rabbitmq_utils.py
│   └── task_models.py
├── configs
│   ├── pycache
│   │   └── settings.cpython-310.pyc
│   └── settings.py
├── pyproject.toml
├── requirements.txt
├── scheduler
│   ├── init.py
│   ├── pycache
│   │   ├── init.cpython-310.pyc
│   │   └── scheduler_actor.cpython-310.pyc
│   └── scheduler_actor.py
├── tests
│   ├── init.py
│   ├── pycache
│   │   ├── init.cpython-310.pyc
│   │   ├── minio_data_prepare.cpython-310.pyc
│   │   ├── state_fixture.cpython-310.pyc
│   │   ├── test_config_loading.cpython-310.pyc
│   │   ├── test_pipeline.cpython-310-pytest-8.4.1.pyc
│   │   └── test_pipeline.cpython-310.pyc
│   ├── full_integration_test.py
│   ├── minio_data_prepare.py
│   ├── state_fixture.py
│   ├── test_config_loading.py
│   ├── test_logic_modules.py
│   └── test_pipeline.py
└── trainer
├── init.py
├── pycache
│   ├── init.cpython-310.pyc
│   ├── lerobot_trainer_logic.cpython-310.pyc
│   └── trainer_actor.cpython-310.pyc
├── lerobot_train_actor.py
├── lerobot_trainer_logic.py
└── trainer_actor.py
项目完整结构如下
.
├── benchmarks
│   └── video
├── config
├── docker
│   ├── lerobot-cpu
│   ├── lerobot-gpu
│   └── lerobot-gpu-dev
├── examples
│   ├── advanced
│   └── port_datasets
├── lerobot
│   ├── pycache
│   ├── common
│   │   ├── pycache
│   │   ├── datasets
│   │   │   ├── pycache
│   │   │   ├── push_dataset_to_hub
│   │   │   │   └── aloha_raw_urls
│   │   │   ├── v2
│   │   │   └── v21
│   │   ├── envs
│   │   │   └── pycache
│   │   ├── optim
│   │   │   └── pycache
│   │   ├── policies
│   │   │   ├── pycache
│   │   │   ├── act
│   │   │   │   └── pycache
│   │   │   ├── diffusion
│   │   │   │   └── pycache
│   │   │   ├── pi0
│   │   │   │   ├── pycache
│   │   │   │   └── conversion_scripts
│   │   │   ├── tdmpc
│   │   │   │   └── pycache
│   │   │   └── vqbet
│   │   │       └── pycache
│   │   ├── robot_devices
│   │   │   ├── cameras
│   │   │   │   └── pycache
│   │   │   ├── motors
│   │   │   │   └── pycache
│   │   │   └── robots
│   │   │       └── pycache
│   │   └── utils
│   │       └── pycache
│   ├── configs
│   │   └── pycache
│   ├── scripts
│   │   └── pycache
│   └── templates
├── media
│   ├── aloha
│   ├── gym
│   ├── koch
│   ├── lekiwi
│   ├── moss
│   ├── so100
│   └── tutorial
├── tests
│   ├── pycache
│   ├── artifacts
│   │   ├── datasets
│   │   │   └── lerobot
│   │   │       ├── aloha_sim_insertion_human
│   │   │       ├── pusht
│   │   │       └── xarm_lift_medium
│   │   ├── image_transforms
│   │   └── policies
│   │       ├── aloha_sim_insertion_human_act
│   │       ├── aloha_sim_insertion_human_act_1000_steps
│   │       ├── pusht_diffusion_
│   │       ├── xarm_lift_medium_tdmpc_use_mpc
│   │       └── xarm_lift_medium_tdmpc_use_policy
│   ├── cameras
│   ├── configs
│   ├── datasets
│   ├── envs
│   ├── examples
│   ├── fixtures
│   │   └── pycache
│   ├── motors
│   ├── optim
│   ├── policies
│   ├── robots
│   └── utils
├── tmp_test_config_dir
├── tmp_test_runs
└── training_platform
├── pycache
├── common
│   └── pycache
├── configs
│   └── pycache
├── scheduler
│   └── pycache
├── tests
│   └── pycache
└── trainer
└── pycache

你需要的文件如下

import ray
import asyncio
from collections import deque
from typing import Deque, Optional

from training_platform.configs.settings import settings
from training_platform.common.task_models import TrainingTask
from training_platform.common.rabbitmq_utils import init_rabbitmq, send_status_message
from training_platform.trainer.trainer_actor import TrainerActor

@ray.remote
class Scheduler:
def init(self):
self.task_queue: Deque[TrainingTask] = deque()
self.running_task: Optional[TrainingTask] = None
self.trainer_actor: Optional["ray.actor.ActorHandle"] = None

Generated code
self.steps_per_timeslice = settings.SCHEDULER_STEPS_PER_TIMESLICE
    self.num_gpus_per_trainer = settings.SCHEDULER_GPUS_PER_TRAINER
    
    # Actor 启动时，调用一次 init_rabbitmq 来确保连接
    # Manager 模式会处理重复调用的问题
    asyncio.create_task(init_rabbitmq())
    
    print("[Scheduler] Actor initialized.")

async def add_task(self, task_data: dict):
    task = TrainingTask(**task_data)
    self.task_queue.append(task)
    await send_status_message(task_id=int(task.task_id), status="queued", uuid=task.uuid)
    print(f"[Scheduler] Task {task.task_id} added to queue.")

async def run(self):
    print("[Scheduler] Main loop started.")
    while True:
        if self.running_task is None and self.task_queue:
            self.running_task = self.task_queue.popleft()
            
            print(f"[Scheduler] Starting training for task: {self.running_task.task_id}")
            
            trainer_options = {"num_gpus": self.num_gpus_per_trainer}
            self.trainer_actor = TrainerActor.options(**trainer_options).remote(self.running_task)
            
            total_epochs = self.running_task.config.get('epochs', 10)
            start_epoch = self.running_task.current_step
            end_epoch = min(start_epoch + self.steps_per_timeslice, total_epochs)
            
            await send_status_message(task_id=int(self.running_task.task_id), status="training", uuid=self.running_task.uuid)
            
            try:
                final_epoch = await self.trainer_actor.train.remote(start_epoch, end_epoch)
                self.running_task.current_step = final_epoch
                
                if final_epoch >= total_epochs:
                    await send_status_message(task_id=int(self.running_task.task_id), status="completed", uuid=self.running_task.uuid)
                else:
                    self.task_queue.append(self.running_task)
                    await send_status_message(task_id=int(self.running_task.task_id), status="paused", uuid=self.running_task.uuid)
            except Exception as e:
                print(f"❌ [Scheduler] Training failed for task {self.running_task.task_id}: {e}")
                await send_status_message(task_id=int(self.running_task.task_id), status="failed", uuid=self.running_task.uuid)
            finally:
                if self.trainer_actor: ray.kill(self.trainer_actor)
                self.trainer_actor, self.running_task = None, None
        
        await asyncio.sleep(1)

Pydantic models for task definitions # common/task_models.py

from pydantic import BaseModel, Field
from typing import Dict, Any, Optional

class TrainingTask(BaseModel):
task_id: str
user_id: str
uuid: str
config: Dict[str, Any]  # 对应 lerobot 的 TrainPipelineConfig 内容

Generated code
# 由 Scheduler 维护的状态
current_step: int = 0
status: str = "queued" # queued, training, paused, completed, failed
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
IGNORE_WHEN_COPYING_END

import os
import mimetypes
import asyncio
from typing import Optional, Tuple
from miniopy_async.api import Minio
from miniopy_async.error import S3Error

导入 settings

from training_platform.configs.settings import settings

class _MinIOManager:
_instance: Optional['_MinIOManager'] = None
_lock = asyncio.Lock()

Generated code
def __init__(self):
    self.client: Optional[Minio] = None
    self._is_connecting = False

@classmethod
async def get_instance(cls) -> '_MinIOManager':
    # (这个方法保持不变)
    if cls._instance is None:
        async with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
    return cls._instance

async def get_client_internal(self) -> Minio:
    # 检查连接是否已关闭或不存在
    client_is_invalid = self.client is None
    if self.client and hasattr(self.client, '_http') and self.client._http:
         client_is_invalid = self.client._http.is_closed()
    
    if client_is_invalid:
        async with self._lock:
            # 再次检查，防止在等待锁时连接已被其他协程建立
            client_is_invalid_again = self.client is None
            if self.client and hasattr(self.client, '_http') and self.client._http:
                client_is_invalid_again = self.client._http.is_closed()
            
            if client_is_invalid_again:
                if self._is_connecting:
                    while self._is_connecting:
                        await asyncio.sleep(0.1)
                    # 在等待后，另一个协程可能已经成功连接，直接返回
                    if self.client and not self.client._http.is_closed():
                        return self.client
                    else:
                        # 如果等待后仍然连接失败，则抛出异常
                        raise ConnectionError("另一个协程尝试连接失败。")

                self._is_connecting = True
                try:
                    print(f"💡 正在连接到 MinIO 服务器: {settings.MINIO_URL} ...")
                    client = Minio(
                        endpoint=settings.MINIO_URL,
                        access_key=settings.MINIO_ACCESS_KEY,
                        secret_key=settings.MINIO_SECRET_KEY,
                        secure=False
                    )
                    # 使用一个轻量级的操作作为健康检查
                    await client.bucket_exists("health-check-bucket-that-may-not-exist")
                    self.client = client
                    print("✅ 成功连接到 MinIO 服务器！")
                except Exception as e:
                    print(f"❌ 连接 MinIO 失败。原始错误: {e}")
                    self.client = None
                    # --- 关键修改：直接抛出异常 ---
                    raise ConnectionError(f"无法连接到 MinIO 服务器 at {settings.MINIO_URL}") from e
                finally:
                    self._is_connecting = False
    
    # 能走到这里，self.client 一定是一个有效的对象
    return self.client
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
IGNORE_WHEN_COPYING_END
--- 函数接口 ---
--- 关键修改：让函数在失败时抛出异常，而不是返回 None ---

async def get_minio_client() -> Minio:
"""
获取一个保证可用的 MinIO 客户端。如果无法连接，则抛出 ConnectionError。
"""
manager = await _MinIOManager.get_instance()
return await manager.get_client_internal()

async def connect_minio() -> Minio:
"""
连接到 MinIO。这是 get_minio_client 的别名。
"""
return await get_minio_client()

其他函数保持完全不变，因为它们依赖传入的 client 对象

async def upload_model_to_minio(
client: Minio,
dataset_file_local_path: str,
filename: str,
) -> Tuple[bool, str]:
from training_platform.configs.settings import settings # 在函数内导入以避免循环依赖
return await upload_file_to_minio(
client=client,
upload_file_local_path=dataset_file_local_path,
filename=filename,
bucket_name=settings.MINIO_MODEL_BUCKET,
object_prefix="models/"
)

async def download_file_from_minio(
client: Minio,
bucket_name: str,
object_name: str,
local_file_path: str
) -> Tuple[bool, str]:
if not isinstance(client, Minio):
return False, "传入的 MinIO 客户端无效或未初始化。"
try:
found = await client.bucket_exists(bucket_name)
if not found:
return False, f"桶 '{bucket_name}' 不存在。"
await client.fget_object(bucket_name, object_name, local_file_path)
print(f"⬇️ 文件 '{object_name}' 已成功下载到 '{local_file_path}'。")
return True, local_file_path
except S3Error as e:
error_msg = f"MinIO 下载失败: {e}"
print(f"❌ {error_msg}")
return False, error_msg
except Exception as e:
error_msg = f"文件下载时发生意外错误: {e}"
print(f"❌ {error_msg}")
return False, error_msg

async def upload_file_to_minio(
client: Minio,
upload_file_local_path: str,
filename: str,
bucket_name: str,
object_prefix: str = "",
) -> Tuple[bool, str]:
if not isinstance(client, Minio):
return False, "传入的 MinIO 客户端无效或未初始化。"
try:
found = await client.bucket_exists(bucket_name)
if not found:
await client.make_bucket(bucket_name)
print(f"Bucket '{bucket_name}' 不存在，已自动创建。")

Generated code
object_name = f"{object_prefix}{filename}"
    content_type, _ = mimetypes.guess_type(upload_file_local_path)
    content_type = content_type or 'application/octet-stream'

    await client.fput_object(bucket_name, object_name, upload_file_local_path, content_type=content_type)
    print(f"✅ 文件 '{upload_file_local_path}' 已成功上传到 '{bucket_name}/{object_name}'。")
    return True, f"s3://{bucket_name}/{object_name}"
except S3Error as e:
    error_msg = f"MinIO 上传失败: {e}"
    print(f"❌ {error_msg}")
    return False, error_msg
except Exception as e:
    error_msg = f"文件上传时发生意外错误: {e}"
    print(f"❌ {error_msg}")
    return False, error_msg
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
IGNORE_WHEN_COPYING_END

import asyncio
import json
from typing import Optional, Callable
import aio_pika
from aio_pika.abc import AbstractRobustConnection, AbstractChannel, AbstractExchange, AbstractQueue

from training_platform.configs.settings import settings

class _RabbitMQManager:
"""
一个内部单例类，用于管理 RabbitMQ 连接的生命周期。
对外部调用者透明。
"""
_instance: Optional['_RabbitMQManager'] = None
_lock = asyncio.Lock()

Generated code
def __init__(self):
    self.connection: Optional[AbstractRobustConnection] = None
    self.channel: Optional[AbstractChannel] = None
    self.exchange: Optional[AbstractExchange] = None
    self.queues: dict[str, AbstractQueue] = {}

@classmethod
async def get_instance(cls) -> '_RabbitMQManager':
    if cls._instance is None:
        async with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
    return cls._instance

async def initialize_internal(self):
    if self.channel and not self.channel.is_closed:
        return

    async with self._lock:
        if self.channel and not self.channel.is_closed:
            return

        try:
            print(f"💡 正在连接 RabbitMQ 并声明所有实体...")
            self.connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
            self.channel = await self.connection.channel()
            self.exchange = await self.channel.declare_exchange(
                settings.RABBIT_EXCHANGE_NAME, aio_pika.ExchangeType.DIRECT, durable=True
            )
            self.fanout_exchange = await self.channel.declare_exchange(
                "platform.fanout.status", # 一个新的、专门用于测试广播的交换机
                aio_pika.ExchangeType.FANOUT,
                durable=True
            )

            queue_configs = {
                settings.RABBIT_REQUEST_QUEUE_NAME: settings.RABBIT_REQUEST_BINDING_KEY,
                settings.RABBIT_STATUS_QUEUE_NAME: settings.RABBIT_STATUS_BINDING_KEY,
                settings.RABBIT_TRAIN_LOG_QUEUE_NAME: settings.RABBIT_TRAIN_LOG_BINDING_KEY,
            }
            for q_name, r_key in queue_configs.items():
                queue = await self.channel.declare_queue(q_name, durable=True)
                await queue.bind(self.exchange, routing_key=r_key)
                self.queues[q_name] = queue

            print("✅ RabbitMQ 初始化成功！")
        except Exception as e:
            print(f"❌ RabbitMQ 初始化失败: {e}")
            if self.connection: await self.connection.close()
            self.connection = self.channel = self.exchange = None; self.queues = {}
            raise

async def close_internal(self):
    if self.connection and not self.connection.is_closed:
        await self.connection.close()
        self.connection = None
        print("👋 RabbitMQ 连接已关闭。")
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
IGNORE_WHEN_COPYING_END
--- 以下是你原有的函数，我们保持接口不变，但内部实现调用Manager ---

async def init_rabbitmq():
manager = await _RabbitMQManager.get_instance()
await manager.initialize_internal()

async def close_rabbitmq():
manager = await _RabbitMQManager.get_instance()
await manager.close_internal()

async def get_rabbit_exchange() -> Optional[AbstractExchange]:
manager = await _RabbitMQManager.get_instance()
await manager.initialize_internal() # 确保已初始化
return manager.exchange

async def _send_message(routing_key: str, message_body: dict):
try:
exchange = await get_rabbit_exchange()
if not exchange:
print(f"发送消息失败: 交换机未就绪。")
return
message = aio_pika.Message(
body=json.dumps(message_body).encode('utf-8'),
delivery_mode=aio_pika.DeliveryMode.PERSISTENT
)
await exchange.publish(message, routing_key=routing_key)
except Exception as e:
print(f"发送消息到 {routing_key} 失败: {e}")

async def send_status_message(task_id: int, status: str, uuid: Optional[str] = None):
manager = await _RabbitMQManager.get_instance()
await manager.initialize_internal()
message_body = {"task_id": task_id, "status": status, "model_uuid": uuid}
if manager.fanout_exchange and manager.fanout_exchange.name == "platform.fanout.status":
try:
message = aio_pika.Message(
body=json.dumps(message_body).encode('utf-8')
# fanout exchange 的消息不需要持久化
)
# 发送到 fanout exchange, routing_key 为空
await manager.fanout_exchange.publish(message, routing_key="")
except Exception as e:
print(f"广播状态消息失败: {e}")

async def send_log_message(epoch: int, loss: float, accuracy: float, log_message: str):
message_body = {"epoch": epoch, "loss": loss, "accuracy": accuracy, "log_message": log_message}
await _send_message(settings.RABBIT_TRAIN_LOG_BINDING_KEY, message_body)

async def start_task_queue_consumer(on_message_callback: Callable):
try:
manager = await _RabbitMQManager.get_instance()
await manager.initialize_internal() # 确保已初始化
queue = manager.queues.get(settings.RABBIT_REQUEST_QUEUE_NAME)
if not queue:
print(f"❌ 无法启动消费者：队列 '{settings.RABBIT_REQUEST_QUEUE_NAME}' 未找到。")
return
print(f"[*] 开始监听队列 '{queue.name}'.")
await queue.consume(on_message_callback, no_ack=False)
except Exception as e:
print(f"❌ 启动消费者失败: {e}")

training_platform/trainer/lerobot_trainer_logic.py (模块化版本)

import logging
from pathlib import Path
from pprint import pformat
from typing import Callable, Dict, Any, Tuple

import torch
from torch.amp import GradScaler
import draccus

导入所有 lerobot 的依赖

from lerobot.common.datasets.factory import make_dataset
from lerobot.common.datasets.sampler import EpisodeAwareSampler
from lerobot.common.datasets.utils import cycle
from lerobot.common.policies.factory import make_policy
from lerobot.common.optim.factory import make_optimizer_and_scheduler
from lerobot.common.utils.logging_utils import AverageMeter, MetricsTracker
from lerobot.common.utils.train_utils import (
get_step_checkpoint_dir,
load_training_state,
save_checkpoint,
update_last_checkpoint,
)
from lerobot.common.utils.utils import get_safe_torch_device
from lerobot.scripts.train import update_policy
from lerobot.configs.train import TrainPipelineConfig

在模块加载时，确保所有 lerobot 的插件都被注册

import lerobot.common.envs.factory
import lerobot.common.policies.factory

def prepare_config(
base_config_path: str,
user_override_config: Dict[str, Any],
run_dir: str,
start_step: int,
end_step: int,
) -> TrainPipelineConfig:
"""
第一阶段：加载、合并并准备最终的训练配置对象。
"""
logging.info(f"Loading base config from: {base_config_path}")
logging.info(f"Applying user override config: {user_override_config}")

Generated code
# 将用户覆盖字典转换为 draccus 能理解的命令行参数列表
overrides = []
for key, value in user_override_config.items():
    if isinstance(value, dict):
        for inner_key, inner_value in value.items():
            overrides.append(f"--{key}.{inner_key}={inner_value}")
    else:
        overrides.append(f"--{key}={value}")

# 直接调用 draccus.parse 来加载和合并
cfg: TrainPipelineConfig = draccus.parse(
    config_class=TrainPipelineConfig,
    config_path=base_config_path,
    args=overrides
)

# 强制覆盖平台管理的参数
cfg.resume = start_step > 0
cfg.steps = user_override_config.get('steps', cfg.steps) # 任务总步数应来自用户配置

# 如果数据集已经下载到本地，则覆盖 repo_id
local_dataset_dir = Path(run_dir) / "dataset"
if local_dataset_dir.exists():
    cfg.dataset.repo_id = str(local_dataset_dir)

# 手动触发 lerobot 的核心配置后处理逻辑

cfg.validate()

logging.info("Successfully created final training configuration.")
logging.info(pformat(cfg.to_dict()))
return cfg
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
IGNORE_WHEN_COPYING_END
TODO resume the previous training state

def initialize_training_objects(
cfg: TrainPipelineConfig,
device: torch.device,
start_step: int,
) -> Tuple:
"""
第二阶段：根据配置初始化所有训练所需的对象。
"""
logging.info("Creating dataset...")
dataset = make_dataset(cfg)

Generated code
logging.info("Creating policy...")
policy = make_policy(cfg=cfg.policy, ds_meta=dataset.meta)
policy.to(device)

logging.info("Creating optimizer and scheduler...")
optimizer, lr_scheduler = make_optimizer_and_scheduler(cfg, policy)
grad_scaler = GradScaler(device.type, enabled=cfg.policy.use_amp)

# 加载 Checkpoint (如果断点续练)
if start_step > 0:
    checkpoint_path = Path(cfg.output_dir) / "checkpoints" / "last"
    if checkpoint_path.is_symlink() or checkpoint_path.exists():
        logging.info(f"Resuming training from checkpoint: {checkpoint_path.resolve()}")
        loaded_step, optimizer, lr_scheduler = load_training_state(
            checkpoint_path, optimizer, lr_scheduler, policy=policy, device=device
        )
        logging.info(f"Checkpoint loaded, was at step {loaded_step}. Starting from {start_step}.")
    else:
        logging.warning(f"Expected a checkpoint at {checkpoint_path} for resuming, but not found.")

return dataset, policy, optimizer, lr_scheduler, grad_scaler
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
IGNORE_WHEN_COPYING_END

def execute_training_loop(
cfg: TrainPipelineConfig,
device: torch.device,
start_step: int,
end_step: int,
training_objects: Tuple,
log_callback: Callable,
save_callback: Callable,
):
"""
第三阶段：执行核心的训练循环。
"""
dataset, policy, optimizer, lr_scheduler, grad_scaler = training_objects

Generated code
# Dataloader 和训练准备
if hasattr(cfg.policy, "drop_n_last_frames"):
    sampler = EpisodeAwareSampler(
        dataset.episode_data_index, drop_n_last_frames=cfg.policy.drop_n_last_frames, shuffle=True
    )
    shuffle = False
else:
    sampler = None
    shuffle = True
    
dataloader = torch.utils.data.DataLoader(
    dataset, 
    num_workers=cfg.num_workers,
    batch_size=cfg.batch_size, 
    shuffle=shuffle, 
    sampler=sampler, 
    pin_memory=device.type != "cpu", 
    drop_last=False
)
dl_iter = cycle(dataloader)

if start_step > 0:
    logging.info(f"Fast-forwarding dataloader by {start_step} steps...")
    for _ in range(start_step):
        next(dl_iter)

policy.train()

train_metrics = {
    "loss": AverageMeter("loss", ":.3f"), "grad_norm": AverageMeter("grdn", ":.3f"), "lr": AverageMeter("lr", ":0.1e"),
    "update_s": AverageMeter("updt_s", ":.3f"), "dataloading_s": AverageMeter("data_s", ":.3f"),
}
train_tracker = MetricsTracker(
    cfg.batch_size, dataset.num_frames, dataset.num_episodes, train_metrics, initial_step=start_step
)

logging.info(f"Entering training loop from step {start_step} to {end_step}...")
for step in range(start_step, end_step):
    batch = next(dl_iter)

    for key in batch:
        if isinstance(batch[key], torch.Tensor):
            batch[key] = batch[key].to(device, non_blocking=True)

    train_tracker, output_dict = update_policy(
        train_tracker,
        policy,
        batch,
        optimizer,
        cfg.optimizer.grad_clip_norm,
        grad_scaler=grad_scaler,
        lr_scheduler=lr_scheduler,
        use_amp=cfg.policy.use_amp,
    )
    current_step = step + 1

    is_log_step = cfg.log_freq > 0 and current_step % cfg.log_freq == 0
    is_saving_step = current_step % cfg.save_freq == 0 or current_step == cfg.steps

    if is_log_step:
        log_callback(current_step, train_tracker.to_dict())
        train_tracker.reset_averages() 

    if cfg.save_checkpoint and is_saving_step:
        logging.info(f"Saving checkpoint at step {current_step}")
        checkpoint_dir = get_step_checkpoint_dir(cfg.output_dir, cfg.steps, current_step)
        logging.info(f"Saving checkpoint to: {checkpoint_dir}")
        save_checkpoint(checkpoint_dir, current_step, cfg, policy, optimizer, lr_scheduler)
        update_last_checkpoint(checkpoint_dir)
        
        save_callback(current_step, str(checkpoint_dir))

logging.info(f"Finished training slice. Final step for this slice: {end_step}")
return end_step
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
IGNORE_WHEN_COPYING_END

def run_lerobot_training(
base_config_path: str,
user_override_config: Dict[str, Any],
run_dir: str,
start_step: int,
end_step: int,
log_callback: Callable,
save_callback: Callable,
):
"""
主入口函数，编排整个训练流程。
"""
# 阶段一：准备配置
cfg = prepare_config(base_config_path, user_override_config, run_dir, start_step, end_step)

Generated code
# 设置设备
device = get_safe_torch_device(cfg.policy.device, log=True)
torch.backends.cudnn.benchmark = True
torch.backends.cuda.matmul.allow_tf32 = True

# 阶段二：初始化所有对象
training_objects = initialize_training_objects(cfg, device, start_step)

# 阶段三：执行训练循环
final_step = execute_training_loop(
    cfg, device, start_step, end_step,
    training_objects, log_callback, save_callback
)



