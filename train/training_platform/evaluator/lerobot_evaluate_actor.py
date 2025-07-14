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
    publish_status_message,
    publish_eval_result_message
)
from training_platform.common.minio_utils import (
    get_minio_client, 
    download_ckpt_from_minio,
    upload_file_to_minio,
    list_objects_with_prefix
)

# 导入评估逻辑
from training_platform.evaluator.evaluator_logic import run_lerobot_evaluation

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
    """
    
    def __init__(self, task: EvaluationTask):
        self.task = task
        self.run_dir = os.path.join(settings.RUN_DIR_BASE, f"eval_{self.task.task_id}")
        os.makedirs(self.run_dir, exist_ok=True)
        
        # 获取当前actor的事件循环，用于线程安全的回调
        self.loop = asyncio.get_running_loop()
        
        # 存储评估结果
        self.eval_results: Optional[Dict[str, Any]] = None
        
        # Manager 模式确保在 Actor 启动时，异步地准备好连接
        asyncio.create_task(init_rabbitmq())
        
        logger.info(f"[{self.task.task_id}] Evaluator Actor initialized for model evaluation.")
        print(f"[{self.task.task_id}] Evaluator Actor initialized for model evaluation.")

    async def _publish_status(self, status: str, message: str):
        """发布状态更新消息到 RabbitMQ"""
        try:
            await publish_status_message(
                task_id=self.task.task_id,
                user_id=self.task.user_id,
                status=status,
                message=message
            )
        except Exception as e:
            logger.error(f"[{self.task.task_id}] Failed to publish status: {e}")

    async def _publish_eval_results(self):
        """发布评估结果消息到 RabbitMQ"""
        try:
            if self.eval_results:
                await publish_eval_result_message(
                    task_id=self.task.task_id,
                    user_id=self.task.user_id,
                    model_uuid=self.task.model_uuid,
                    eval_results=self.eval_results
                )
        except Exception as e:
            logger.error(f"[{self.task.task_id}] Failed to publish eval results: {e}")

    async def _find_latest_checkpoint(self, train_task_id: str) -> Optional[str]:
        """
        在 MinIO 中查找指定训练任务的最新 checkpoint
        
        Args:
            train_task_id: 训练任务 ID
            
        Returns:
            最新 checkpoint 的对象名称，如果没找到则返回 None
        """
        task_id = self.task.task_id
        
        try:
            minio_client = await get_minio_client()
            
            # 构建搜索前缀
            from training_platform.configs.settings import settings
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
            
            # 过滤出 checkpoint 文件并解析 step 号
            checkpoint_pattern = re.compile(rf"{re.escape(settings.MINIO_CKPT_DIR)}/{re.escape(train_task_id)}/checkpoint_step_(\d+)\.zip$")
            checkpoints = []
            
            for obj_name in objects:
                match = checkpoint_pattern.match(obj_name)
                if match:
                    step = int(match.group(1))
                    checkpoints.append((step, obj_name))
            
            if not checkpoints:
                logger.warning(f"[{task_id}] No checkpoint files found for task {train_task_id}")
                return None
            
            # 按 step 排序，取最大的
            checkpoints.sort(key=lambda x: x[0], reverse=True)
            latest_step, latest_checkpoint = checkpoints[0]
            
            logger.info(f"[{task_id}] Found {len(checkpoints)} checkpoints for task {train_task_id}")
            logger.info(f"[{task_id}] Latest checkpoint: step {latest_step}, object: {latest_checkpoint}")
            
            return latest_checkpoint
            
        except Exception as e:
            logger.error(f"[{task_id}] Error finding latest checkpoint: {e}")
            return None

    async def _get_model_path(self) -> str:
        """
        获取模型路径。支持以下格式：
        1. Hugging Face 模型 ID（username/model_name）
        2. 训练任务 ID（纯数字，自动查找最新 checkpoint）
        3. 完整的 checkpoint 路径
        4. 简单的模型名称（向后兼容）
        
        Returns:
            模型路径（HF 模型 ID 或本地路径）
        """
        task_id = self.task.task_id
        model_uuid = self.task.model_uuid
        
        # 检查是否是 Hugging Face 模型 ID（格式：username/model_name）
        if "/" in model_uuid and not os.path.exists(model_uuid) and not model_uuid.startswith("checkpoint_"):
            logger.info(f"[{task_id}] Using Hugging Face model: {model_uuid}")
            await self._publish_status("running", f"准备使用 Hugging Face 模型: {model_uuid}")
            return model_uuid
        
        # 检查是否是训练任务 ID（纯数字）
        if model_uuid.isdigit():
            logger.info(f"[{task_id}] Model UUID appears to be a training task ID: {model_uuid}")
            await self._publish_status("running", f"正在查找训练任务 {model_uuid} 的最新模型...")
            
            # 自动查找最新的 checkpoint
            latest_checkpoint = await self._find_latest_checkpoint(model_uuid)
            
            if latest_checkpoint:
                logger.info(f"[{task_id}] Found latest checkpoint: {latest_checkpoint}")
                # 使用找到的最新 checkpoint 作为模型对象名称
                model_object_name = latest_checkpoint
            else:
                raise RuntimeError(f"No checkpoints found for training task {model_uuid}")
        else:
            # 否则从 MinIO 下载模型
            logger.info(f"[{task_id}] Processing explicit model identifier: {model_uuid}")
            
            # 构建模型对象名称，参考trainer的存储逻辑
            # model_uuid 可能是以下格式之一：
            # 1. "task_id/checkpoint_step_xxx.zip" (完整路径)
            # 2. "checkpoint_step_xxx" (需要添加task_id前缀)
            # 3. 简单的模型名称 (向后兼容)
            if "/" in model_uuid:
                # 格式1：已包含完整路径
                model_object_name = model_uuid
                if not model_object_name.endswith('.zip'):
                    model_object_name += '.zip'
            elif model_uuid.startswith("checkpoint_step_"):
                # 格式2：需要添加task_id前缀，假设使用训练任务的ID
                # 这里我们假设model_uuid格式为 "checkpoint_step_{step}" 
                # 或者 "task_{train_task_id}_checkpoint_step_{step}"
                if model_uuid.startswith("task_"):
                    # 提取训练任务ID
                    parts = model_uuid.split("_")
                    if len(parts) >= 4:  # task_{id}_checkpoint_step_{step}
                        train_task_id = parts[1]
                        step_part = "_".join(parts[2:])  # checkpoint_step_{step}
                        model_object_name = f"{train_task_id}/{step_part}.zip"
                    else:
                        raise ValueError(f"Invalid model_uuid format: {model_uuid}")
                else:
                    # 需要知道训练任务ID，这里假设有一个映射或使用当前task_id
                    # 在实际应用中，可能需要从数据库查询对应的训练任务ID
                    model_object_name = f"{task_id}/{model_uuid}.zip"
            else:
                # 格式3：简单名称，向后兼容
                model_object_name = f"{model_uuid}.zip"
        
        # 从 MinIO 下载模型
        try:
            logger.info(f"[{task_id}] Starting model download from MinIO...")
            await self._publish_status("running", "开始从 MinIO 下载模型...")
            
            minio_client = await get_minio_client()
            
            # 创建模型目录
            model_dir = os.path.join(self.run_dir, "model")
            os.makedirs(model_dir, exist_ok=True)
            
            # 下载模型文件
            model_zip_path = os.path.join(model_dir, os.path.basename(model_object_name))
            
            print(f"[{task_id}] Downloading model: {model_object_name}")
            success, message = await download_ckpt_from_minio(
                client=minio_client,
                download_local_path=model_zip_path,
                ckpt_name=model_object_name
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
                return pretrained_model_dir
            elif os.path.exists(model_extract_dir):
                # 否则使用解压根目录
                logger.info(f"[{task_id}] Using extracted directory: {model_extract_dir}")
                return model_extract_dir
            else:
                raise RuntimeError(f"Model extraction failed: no valid model directory found")
            
        except Exception as e:
            error_msg = f"Model download failed: {str(e)}"
            logger.error(f"[{task_id}] {error_msg}")
            await self._publish_status("failed", error_msg)
            raise

    async def _upload_eval_results(self) -> bool:
        """
        上传评估结果文件到 MinIO。
        
        Returns:
            上传是否成功
        """
        task_id = self.task.task_id
        model_uuid = self.task.model_uuid
        
        try:
            logger.info(f"[{task_id}] Starting result upload...")
            await self._publish_status("running", "开始上传评估结果...")
            
            minio_client = await get_minio_client()
            
            # 上传评估信息文件 (JSON)
            eval_info_file = os.path.join(self.run_dir, "eval_output", "eval_info.json")
            if os.path.exists(eval_info_file):
                eval_info_object_name = f"eval_results/eval_info_{model_uuid}_{task_id}.json"
                
                success, message = await upload_file_to_minio(
                    client=minio_client,
                    upload_file_local_path=eval_info_file,
                    filename=eval_info_object_name,
                    bucket_name=settings.MINIO_BUCKET,
                    object_dir="eval_results"
                )
                
                if success:
                    logger.info(f"[{task_id}] Evaluation info uploaded: {eval_info_object_name}")
                else:
                    logger.warning(f"[{task_id}] Failed to upload eval info: {message}")
            
            # 上传视频文件
            videos_dir = os.path.join(self.run_dir, "eval_output", "videos")
            if os.path.exists(videos_dir):
                video_files = list(Path(videos_dir).glob("*.mp4"))
                logger.info(f"[{task_id}] Found {len(video_files)} video files to upload")
                
                for video_file in video_files:
                    video_object_name = f"eval_videos/{model_uuid}_{task_id}_{video_file.name}"
                    
                    success, message = await upload_file_to_minio(
                        client=minio_client,
                        upload_file_local_path=str(video_file),
                        filename=video_object_name,
                        bucket_name=settings.MINIO_BUCKET,
                        object_dir="eval_videos"
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
            await self._publish_status("failed", error_msg)
            return False

    async def _run_evaluation(self, model_path: str) -> Dict[str, Any]:
        """
        运行模型评估。
        
        Args:
            model_path: 本地模型路径
            
        Returns:
            评估结果字典
        """
        task_id = self.task.task_id
        
        try:
            logger.info(f"[{task_id}] Starting model evaluation...")
            await self._publish_status("running", "开始执行模型评估...")
            
            # 创建输出目录
            output_dir = os.path.join(self.run_dir, "eval_output")
            os.makedirs(output_dir, exist_ok=True)
            
            # 准备评估配置
            env_config = self.task.env_config.copy()
            eval_config = self.task.eval_config.copy()
            
            print(f"[{task_id}] Evaluation configuration:")
            print(f"  Model path: {model_path}")
            print(f"  Environment config: {env_config}")
            print(f"  Evaluation config: {eval_config}")
            print(f"  Output directory: {output_dir}")
            print(f"  Max episodes rendered: {self.task.max_episodes_rendered}")
            
            # 运行评估 - 在单独线程中执行以避免阻塞 Actor
            results = await asyncio.to_thread(
                run_lerobot_evaluation,
                model_path=model_path,
                env_config=env_config,
                eval_config=eval_config,
                output_dir=output_dir,
                seed=self.task.seed,
                max_episodes_rendered=self.task.max_episodes_rendered,
                return_episode_data=self.task.return_episode_data,
            )
            
            logger.info(f"[{task_id}] Evaluation completed successfully")
            print(f"[{task_id}] Evaluation results: {results['aggregated']}")
            
            return results
            
        except Exception as e:
            error_msg = f"Evaluation execution failed: {str(e)}"
            logger.error(f"[{task_id}] {error_msg}")
            await self._publish_status("failed", error_msg)
            raise

    async def evaluate(self) -> Dict[str, Any]:
        """
        执行完整的评估流程。
        
        Returns:
            评估结果字典
        """
        task_id = self.task.task_id
        start_time = time.time()
        
        try:
            logger.info(f"[{task_id}] Starting evaluation pipeline...")
            await self._publish_status("running", "评估任务开始")
            
            # 1. 获取模型路径
            model_path = await self._get_model_path()
            
            # 2. 运行评估
            self.eval_results = await self._run_evaluation(model_path)
            
            # 3. 上传结果
            upload_success = await self._upload_eval_results()
            
            if upload_success:
                # 4. 发布评估结果
                await self._publish_eval_results()
                
                # 5. 更新任务状态为完成
                elapsed_time = time.time() - start_time
                completion_msg = f"评估任务完成，耗时 {elapsed_time:.2f} 秒"
                await self._publish_status("completed", completion_msg)
                
                logger.info(f"[{task_id}] Evaluation pipeline completed successfully")
                print(f"[{task_id}] {completion_msg}")
                
                return self.eval_results
            else:
                raise RuntimeError("Failed to upload evaluation results")
                
        except Exception as e:
            elapsed_time = time.time() - start_time
            error_msg = f"评估任务失败: {str(e)} (耗时 {elapsed_time:.2f} 秒)"
            logger.error(f"[{task_id}] {error_msg}")
            await self._publish_status("failed", error_msg)
            raise

    async def cleanup(self):
        """清理临时文件和资源"""
        task_id = self.task.task_id
        
        try:
            if os.path.exists(self.run_dir):
                shutil.rmtree(self.run_dir)
                logger.info(f"[{task_id}] Cleaned up run directory: {self.run_dir}")
        except Exception as e:
            logger.warning(f"[{task_id}] Failed to cleanup: {e}")

    def get_status(self) -> Dict[str, Any]:
        """获取当前评估状态"""
        return {
            "task_id": self.task.task_id,
            "user_id": self.task.user_id,
            "model_uuid": self.task.model_uuid,
            "status": self.task.status,
            "eval_results": self.eval_results,
        }


# 便捷函数
async def run_evaluation_actor(
    task_id: int,
    user_id: int,
    model_uuid: str,
    model_type: str,
    env_config: Dict[str, Any],
    eval_config: Dict[str, Any],
    seed: int = 1000,
    max_episodes_rendered: int = 10,
    return_episode_data: bool = False,
) -> Dict[str, Any]:
    """
    创建并运行评估 Actor 的便捷函数。
    
    Args:
        task_id: 评估任务 ID
        user_id: 用户 ID
        model_uuid: 模型 UUID
        model_type: 模型类型
        env_config: 环境配置
        eval_config: 评估配置
        seed: 随机种子
        max_episodes_rendered: 最大渲染剧集数
        return_episode_data: 是否返回剧集数据
        
    Returns:
        评估结果字典
    """
    # 创建评估任务
    eval_task = EvaluationTask(
        task_id=task_id,
        user_id=user_id,
        model_uuid=model_uuid,
        model_type=model_type,
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