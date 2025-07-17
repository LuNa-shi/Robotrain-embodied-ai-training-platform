# training_platform/evaluator/lerobot_evaluate_actor.py

import logging
import ray
import asyncio
import os
import shutil
import json
import time
import re
from pathlib import Path
from typing import Dict, Any, Optional

from training_platform.configs.settings import settings
from training_platform.common.task_models import EvaluationTask
from training_platform.common.rabbitmq_utils import (
    init_rabbitmq, 
    send_eval_status_message
)
from training_platform.common.minio_utils import (
    get_minio_client, 
    download_file_from_minio,
    upload_file_to_minio,
    list_objects_with_prefix
)

# 导入评估逻辑
from training_platform.evaluator.evaluator_logic import run_lerobot_evaluation_sync

logger = logging.getLogger(__name__)

@ray.remote
class EvaluatorActor:
    """
    LeRobot 评估器 Actor，负责执行模型评估任务。
    
    参考 TrainerActor 的设计，提供类似的接口和功能：
    1. 从 MinIO 下载模型
    2. 执行评估
    3. 上传评估结果
    4. 发送状态更新
    
    新增功能：
    - 自动从解压缩的模型中获取训练参数
    - 支持从JSON文件读取评估配置
    """
    
    def __init__(self, task: EvaluationTask):
        self.task = task
        self.run_dir = os.path.join(settings.RUN_DIR_BASE, f"eval_{self.task.eval_task_id}")
        os.makedirs(self.run_dir, exist_ok=True)
        
        # 获取当前actor的事件循环，用于线程安全的回调
        self.loop = asyncio.get_running_loop()
        
        # 存储评估结果
        self.eval_results: Optional[Dict[str, Any]] = None
        
        # Manager 模式确保在 Actor 启动时，异步地准备好连接
        asyncio.create_task(init_rabbitmq())
        
        logger.info(f"[{self.task.eval_task_id}] Evaluator Actor initialized for model evaluation.")
        print(f"[{self.task.eval_task_id}] Evaluator Actor initialized for model evaluation.")

    # async def _publish_status(self, status: str, message: str):
        # """发布评估状态更新消息到 RabbitMQ 评估状态队列"""
        # try:
            # await send_eval_status_message(
                # eval_task_id=self.task.eval_task_id,
                # status=status,
                # message=message
            # )
        # except Exception as e:
            # logger.error(f"[{self.task.eval_task_id}] Failed to publish eval status: {e}")

    # async def _publish_eval_results(self):
    #     """发布评估结果消息到 RabbitMQ"""
    #     try:
    #         if self.eval_results:
    #             await publish_eval_result_message(
    #                 task_id=self.task.eval_task_id,
    #                 user_id=self.task.user_id,
    #                 train_task_id=self.task.train_task_id,
    #                 eval_results=self.eval_results
    #             )
    #             logger.info(f"[{self.task.eval_task_id}] Evaluation results published to RabbitMQ")
    #     except Exception as e:
    #         logger.error(f"[{self.task.eval_task_id}] Failed to publish eval results: {e}")

    async def _find_checkpoint_by_stage(self, train_task_id: str, eval_stage: int) -> Optional[str]:
        """
        根据 eval_stage 在 MinIO 中查找指定训练任务的对应 checkpoint
        
        Args:
            train_task_id: 训练任务 ID
            eval_stage: 评估阶段（决定选择第几大的checkpoint）
            
        Returns:
            对应 checkpoint 的对象名称，如果没找到则返回 None
        """
        task_id = self.task.eval_task_id
        
        try:
            minio_client = await get_minio_client()
            
            # 构建搜索前缀 - 使用新的路径格式
            prefix = f"{settings.MINIO_CKPT_DIR}/{train_task_id}/"
            
            logger.info(f"[{task_id}] Searching for checkpoints with prefix: {prefix}")
            
            # 列出所有符合前缀的对象
            success, objects = await list_objects_with_prefix(
                client=minio_client,
                bucket_name=settings.MINIO_BUCKET,
                prefix=prefix
            )
            
            if not success:
                logger.warning(f"[{task_id}] Failed to list objects with prefix: {prefix}")
                return None
            
            # print(f"[{task_id}] Objects: {objects}")
            # 过滤出 checkpoint 文件并解析 step 号
            checkpoint_pattern = re.compile(rf"{settings.MINIO_CKPT_DIR}/{re.escape(train_task_id)}/checkpoint_step_(\d+)\.zip$")
            checkpoints = []
            
            for obj_name in objects:
                match = checkpoint_pattern.match(obj_name)
                if match:
                    step = int(match.group(1))
                    checkpoints.append((step, obj_name))
            
            if not checkpoints:
                logger.warning(f"[{task_id}] No checkpoint files found for task {train_task_id}")
                return None
            
            # 按 step 排序，根据 eval_stage 选择对应大小的checkpoint
            checkpoints.sort(key=lambda x: x[0], reverse=True)
            
            # eval_stage 为1表示最大的，为2表示第二大的，以此类推
            if eval_stage <= 0 or eval_stage > len(checkpoints):
                logger.warning(f"[{task_id}] Invalid eval_stage {eval_stage}, available checkpoints: {len(checkpoints)}")
                # 如果eval_stage无效，使用最大的checkpoint
                selected_step, selected_checkpoint = checkpoints[0]
                logger.info(f"[{task_id}] Using largest checkpoint: step {selected_step}")
            else:
                selected_step, selected_checkpoint = checkpoints[eval_stage - 1]
                logger.info(f"[{task_id}] Using {eval_stage}th largest checkpoint: step {selected_step}")
            
            logger.info(f"[{task_id}] Found {len(checkpoints)} checkpoints for task {train_task_id}")
            logger.info(f"[{task_id}] Selected checkpoint: step {selected_step}, object: {selected_checkpoint}")
            
            return selected_checkpoint
            
        except Exception as e:
            logger.error(f"[{task_id}] Error finding checkpoint by stage: {e}")
            return None

    async def _get_model_path(self) -> str:
        """
        获取模型路径。基于训练任务ID自动查找最新的checkpoint。
        
        Returns:
            模型路径（本地路径）
        """
        task_id = self.task.eval_task_id
        train_task_id = str(self.task.train_task_id)
        
        logger.info(f"[{task_id}] Getting model path for training task: {train_task_id}")
        # await self._publish_status("running", f"正在查找训练任务 {train_task_id} 的最新模型...")
        
        # 根据 eval_stage 查找对应的 checkpoint
        selected_checkpoint = await self._find_checkpoint_by_stage(train_task_id, self.task.eval_stage)
        
        if not selected_checkpoint:
            raise RuntimeError(f"No checkpoints found for training task {train_task_id}")
        
        # 从 MinIO 下载模型
        try:
            logger.info(f"[{task_id}] Starting model download from MinIO...")
            # await self._publish_status("running", "开始从 MinIO 下载模型...")
            
            minio_client = await get_minio_client()
            
            # 创建模型目录
            model_dir = os.path.join(self.run_dir, "model")
            os.makedirs(model_dir, exist_ok=True)
            
            # 下载模型文件
            model_zip_path = os.path.join(model_dir, os.path.basename(selected_checkpoint))
            
            print(f"[{task_id}] Downloading model: {selected_checkpoint}")
            success, message = await download_file_from_minio(
                client=minio_client,
                local_file_path=model_zip_path,
                object_name=selected_checkpoint,
                bucket_name=settings.MINIO_BUCKET,
                object_dir=""  # 不添加额外前缀，因为selected_checkpoint已经包含完整路径
            )
            
            if not success:
                raise RuntimeError(f"Failed to download model: {message}")
            
            # 解压模型文件
            print(f"[{task_id}] Extracting model...")
            model_extract_dir = os.path.join(model_dir, "checkpoint")
            shutil.unpack_archive(model_zip_path, model_extract_dir)
            
            # 删除压缩文件
            os.remove(model_zip_path)
            
            # 验证模型目录结构，寻找pretrained_model目录
            pretrained_model_dir = os.path.join(model_extract_dir, "pretrained_model")
            if os.path.exists(pretrained_model_dir):
                # 如果存在pretrained_model目录，使用它作为模型路径
                logger.info(f"[{task_id}] Found pretrained_model directory: {pretrained_model_dir}")
                model_path = pretrained_model_dir
            elif os.path.exists(model_extract_dir):
                # 否则使用解压根目录
                logger.info(f"[{task_id}] Using extracted directory: {model_extract_dir}")
                model_path = model_extract_dir
            else:
                raise RuntimeError(f"Model extraction failed: no valid model directory found")
            
            # 检查并修复配置文件中的 type 字段
            config_path = os.path.join(model_path, "config.json")
            if os.path.exists(config_path):
                try:
                    with open(config_path, 'r', encoding='utf-8') as f:
                        config_content = json.load(f)
                    
                    # 检查是否包含 'type' 字段
                    if 'type' not in config_content:
                        logger.warning(f"[{task_id}] 配置文件缺少 'type' 字段，尝试推断策略类型")
                        
                        # 尝试从配置内容推断策略类型
                        if 'chunk_size' in config_content and 'n_action_steps' in config_content:
                            config_content['type'] = 'act'
                            logger.info(f"[{task_id}] 基于配置特征推断为 ACT 策略")
                        elif 'horizon' in config_content and 'num_train_timesteps' in config_content:
                            config_content['type'] = 'diffusion'
                            logger.info(f"[{task_id}] 基于配置特征推断为 Diffusion 策略")
                        elif 'n_heads' in config_content and 'dim_model' in config_content:
                            config_content['type'] = 'act'
                            logger.info(f"[{task_id}] 基于配置特征推断为 ACT 策略")
                        else:
                            # 默认使用 ACT
                            config_content['type'] = 'act'
                            logger.info(f"[{task_id}] 使用默认策略类型: ACT")
                        
                        # 保存修改后的配置
                        with open(config_path, 'w', encoding='utf-8') as f:
                            json.dump(config_content, f, indent=2)
                        
                        logger.info(f"[{task_id}] 已修复配置文件，添加 type 字段: {config_content['type']}")
                    else:
                        logger.info(f"[{task_id}] 配置文件已包含 type 字段: {config_content['type']}")
                        
                except Exception as e:
                    logger.warning(f"[{task_id}] 无法读取或修改配置文件: {e}")
            
            return model_path
            
        except Exception as e:
            error_msg = f"Model download failed: {str(e)}"
            logger.error(f"[{task_id}] {error_msg}")
            # await self._publish_status("failed", error_msg)
            raise

    async def _upload_eval_results(self) -> bool:
        """
        上传评估结果文件到 MinIO。
        
        Returns:
            上传是否成功
        """
        task_id = self.task.eval_task_id
        train_task_id = self.task.train_task_id
        
        try:
            logger.info(f"[{task_id}] Starting result upload...")
            # await self._publish_status("running", "开始上传评估结果...")
            
            minio_client = await get_minio_client()
            
            # 上传评估信息文件 (JSON)
            eval_info_file = os.path.join(self.run_dir, "eval_output", "eval_info.json")
            # if os.path.exists(eval_info_file):
                # eval_info_object_name = f"eval_results/eval_info_train_{train_task_id}_eval_{task_id}.json"
                # 
                # success, message = await upload_file_to_minio(
                    # client=minio_client,
                    # upload_file_local_path=eval_info_file,
                    # filename=eval_info_object_name,
                    # bucket_name=settings.MINIO_BUCKET,
                    # object_dir="eval_results"
                # )
                # 
                # if success:
                    # logger.info(f"[{task_id}] Evaluation info uploaded: {eval_info_object_name}")
                # else:
                    # logger.warning(f"[{task_id}] Failed to upload eval info: {message}")
            
            # 上传视频文件
            videos_dir = os.path.join(self.run_dir, "eval_output", "videos")
            if os.path.exists(videos_dir):
                video_files = list(Path(videos_dir).glob("*.mp4"))
                logger.info(f"[{task_id}] Found {len(video_files)} video files to upload")
                
                for video_file in video_files:
                    video_object_name = f"{task_id}/{video_file.name}"
                    
                    success, message = await upload_file_to_minio(
                        client=minio_client,
                        upload_file_local_path=str(video_file),
                        filename=video_object_name,
                        bucket_name=settings.MINIO_BUCKET,
                        object_dir=settings.MINIO_EVAL_DIR 
                    )
                    
                    if success:
                        logger.info(f"[{task_id}] Video uploaded: {video_object_name}")
                    else:
                        logger.warning(f"[{task_id}] Failed to upload video {video_file.name}: {message}")
            
            logger.info(f"[{task_id}] All result files uploaded successfully")
            return True
            
        except Exception as e:
            error_msg = f"Result upload failed: {str(e)}"
            logger.error(f"[{task_id}] {error_msg}")
            # await self._publish_status("failed", error_msg)
            return False

    async def _run_evaluation(self, model_path: str) -> Dict[str, Any]:
        """
        运行模型评估。
        
        Args:
            model_path: 本地模型路径
            
        Returns:
            评估结果字典
        """
        task_id = self.task.eval_task_id
        
        try:
            logger.info(f"[{task_id}] Starting model evaluation...")
            # await self._publish_status("running", "开始执行模型评估...")
            
            # 创建输出目录
            output_dir = os.path.join(self.run_dir, "eval_output")
            os.makedirs(output_dir, exist_ok=True)
            
            # 准备评估配置 - 使用新的自动配置功能
            env_config = None
            eval_config = None
            
            # 如果任务中提供了配置，则使用任务配置；否则使用自动检测
            if hasattr(self.task, 'env_config') and self.task.env_config:
                env_config = self.task.env_config.copy()
                logger.info(f"[{task_id}] Using provided env_config: {env_config}")
            else:
                logger.info(f"[{task_id}] Will auto-detect env_config from model")
            
            if hasattr(self.task, 'eval_config') and self.task.eval_config:
                eval_config = self.task.eval_config.copy()
                logger.info(f"[{task_id}] Using provided eval_config: {eval_config}")
            else:
                logger.info(f"[{task_id}] Will auto-detect eval_config from model")
            
            print(f"[{task_id}] Evaluation configuration:")
            print(f"  Model path: {model_path}")
            print(f"  Environment config: {'Auto-detect' if env_config is None else env_config}")
            print(f"  Evaluation config: {'Auto-detect' if eval_config is None else eval_config}")
            print(f"  Output directory: {output_dir}")
            print(f"  Max episodes rendered: {self.task.max_episodes_rendered}")
            
            # 运行评估 - 在单独线程中执行以避免阻塞 Actor
            results = await asyncio.to_thread(
                run_lerobot_evaluation_sync,
                model_path=model_path,
                env_config=env_config,
                eval_config=eval_config,
                output_dir=output_dir,
                seed=self.task.seed,
                max_episodes_rendered=self.task.max_episodes_rendered,
                return_episode_data=self.task.return_episode_data,
                eval_task_id=str(self.task.eval_task_id),
            )
            
            logger.info(f"[{task_id}] Evaluation completed successfully")
            print(f"[{task_id}] Evaluation results: {results['aggregated']}")
            
            return results
            
        except Exception as e:
            error_msg = f"Evaluation execution failed: {str(e)}"
            logger.error(f"[{task_id}] {error_msg}")
            # await self._publish_status("failed", error_msg)
            raise

    async def evaluate(self) -> Dict[str, Any]:
        """
        执行完整的评估流程。
        
        Returns:
            评估结果字典
        """
        task_id = self.task.eval_task_id
        start_time = time.time()
        
        try:
            logger.info(f"[{task_id}] Starting evaluation pipeline...")
            # 发送开始状态
            # await self._publish_status("running", "评估任务开始")
            
            # 1. 获取模型路径
            model_path = await self._get_model_path()
            
            # 2. 运行评估
            self.eval_results = await self._run_evaluation(model_path)
            
            # 3. 上传结果
            upload_success = await self._upload_eval_results()
            
            if upload_success:
                # 4. 发布评估结果
                # await self._publish_eval_results()
                
                # 5. 更新任务状态为完成
                elapsed_time = time.time() - start_time
                completion_msg = f"评估任务完成，耗时 {elapsed_time:.2f} 秒"
                # await self._publish_status("completed", completion_msg)
                
                logger.info(f"[{task_id}] Evaluation pipeline completed successfully")
                print(f"[{task_id}] {completion_msg}")
                
                return self.eval_results
            else:
                raise RuntimeError("Failed to upload evaluation results")
                
        except Exception as e:
            elapsed_time = time.time() - start_time
            error_msg = f"评估任务失败: {str(e)} (耗时 {elapsed_time:.2f} 秒)"
            logger.error(f"[{task_id}] {error_msg}")
            # await self._publish_status("failed", error_msg)
            raise

    async def cleanup(self):
        """清理临时文件和资源"""
        task_id = self.task.eval_task_id
        
        try:
            if os.path.exists(self.run_dir):
                shutil.rmtree(self.run_dir)
                logger.info(f"[{task_id}] Cleaned up run directory: {self.run_dir}")
        except Exception as e:
            logger.warning(f"[{task_id}] Failed to cleanup: {e}")

    def get_status(self) -> Dict[str, Any]:
        """获取当前评估状态"""
        return {
            "eval_task_id": self.task.eval_task_id,
            "train_task_id": self.task.train_task_id,
            "user_id": self.task.user_id,
            "status": self.task.status,
            "eval_results": self.eval_results,
        }


# 便捷函数
async def run_evaluation_actor(
    eval_task_id: int,
    train_task_id: int,
    eval_stage: int,
    user_id: int,
    env_config: Optional[Dict[str, Any]] = None,
    eval_config: Optional[Dict[str, Any]] = None,
    seed: int = 1000,
    max_episodes_rendered: int = 10,
    return_episode_data: bool = False,
) -> Dict[str, Any]:
    """
    创建并运行评估 Actor 的便捷函数。
    
    Args:
        eval_task_id: 评估任务 ID
        train_task_id: 训练任务 ID
        eval_stage: 评估阶段
        user_id: 用户 ID
        env_config: 环境配置（可选，如果不提供则自动检测）
        eval_config: 评估配置（可选，如果不提供则自动检测）
        seed: 随机种子
        max_episodes_rendered: 最大渲染剧集数
        return_episode_data: 是否返回剧集数据
        
    Returns:
        评估结果字典
    """
    # 创建评估任务
    eval_task = EvaluationTask(
        eval_task_id=eval_task_id,
        train_task_id=train_task_id,
        eval_stage=eval_stage,
        user_id=user_id,
        env_config=env_config,
        eval_config=eval_config,
        seed=seed,
        max_episodes_rendered=max_episodes_rendered,
        return_episode_data=return_episode_data,
    )
    
    # 创建并运行评估 Actor
    evaluator = EvaluatorActor.remote(eval_task)
    
    try:
        # 执行评估 - 使用类型忽略来避免 Ray 类型检查问题
        results = ray.get(evaluator.evaluate.remote())  # type: ignore
        # 确保返回的是字典类型
        if isinstance(results, dict):
            return results
        else:
            raise TypeError(f"Expected dict result from evaluation, got {type(results)}")
    finally:
        # 清理资源 - 使用类型忽略来避免 Ray 类型检查问题
        ray.get(evaluator.cleanup.remote())  # type: ignore


async def run_evaluation_actor_from_task_data(task_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    从任务数据字典直接创建并运行评估 Actor 的便捷函数。
    
    Args:
        task_data: 包含评估任务信息的字典
        
    Returns:
        评估结果字典
    """
    # 提取评估任务参数
    eval_task_id = task_data.get("eval_task_id")
    train_task_id = task_data.get("train_task_id")
    eval_stage = task_data.get("eval_stage")
    user_id = task_data.get("user_id")
    env_config = task_data.get("env_config", None)  # 改为可选
    eval_config = task_data.get("eval_config", None)  # 改为可选
    seed = task_data.get("seed", 1000)
    max_episodes_rendered = task_data.get("max_episodes_rendered", 10)
    return_episode_data = task_data.get("return_episode_data", False)
    
    # 验证必需参数
    if not all([eval_task_id, train_task_id, eval_stage, user_id]):
        raise ValueError("Missing required parameters for evaluation task")
    
    # 确保类型正确
    eval_task_id = int(eval_task_id) if eval_task_id is not None else 0
    train_task_id = int(train_task_id) if train_task_id is not None else 0
    eval_stage = int(eval_stage) if eval_stage is not None else 0
    user_id = int(user_id) if user_id is not None else 0
    
    # 再次验证转换后的参数
    if not all([eval_task_id, train_task_id, eval_stage, user_id]):
        raise ValueError("Invalid parameters after type conversion")
    
    logger.info(f"[{eval_task_id}] Creating evaluation task from task data")
    print(f"[{eval_task_id}] Creating evaluation task from task data")
    
    # 调用原有的便捷函数
    return await run_evaluation_actor(
        eval_task_id=eval_task_id,
        train_task_id=train_task_id,
        eval_stage=eval_stage,
        user_id=user_id,
        env_config=env_config,
        eval_config=eval_config,
        seed=seed,
        max_episodes_rendered=max_episodes_rendered,
        return_episode_data=return_episode_data
    )