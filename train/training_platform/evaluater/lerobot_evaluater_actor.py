# training_platform/evaluater/lerobot_evaluater_actor.py

import asyncio
import json
import logging
import os
import shutil
import tempfile
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

from training_platform.common.minio_utils import (
    connect_minio,
    download_ckpt_from_minio,
    upload_file_to_minio,
)
from training_platform.common.rabbitmq_utils import (
    connect_rabbitmq,
    publish_status_message,
    publish_eval_result_message,
)
from training_platform.configs.settings import settings
from training_platform.evaluater.evaluater_logic import run_lerobot_evaluation

logger = logging.getLogger(__name__)


class LerobotEvaluaterActor:
    """
    LeRobot 评估器 Actor，负责执行模型评估任务。
    
    这个类封装了评估的完整流程，包括：
    1. 从 MinIO 下载模型
    2. 执行评估
    3. 上传评估结果
    4. 发送状态更新
    """
    
    def __init__(self, task_id: int, user_id: int):
        self.task_id = task_id
        self.user_id = user_id
        self.run_dir = Path(settings.RUN_DIR_BASE) / f"eval_{task_id}"
        self.eval_results: Optional[Dict[str, Any]] = None
        
    async def run_evaluation(
        self,
        model_uuid: str,
        env_config: Dict[str, Any],
        eval_config: Dict[str, Any],
        seed: int = 1000,
        max_episodes_rendered: int = 10,
        return_episode_data: bool = False,
    ) -> Tuple[bool, str]:
        """
        运行完整的评估流程。
        
        Args:
            model_uuid: 要评估的模型 UUID
            env_config: 环境配置
            eval_config: 评估配置
            seed: 随机种子
            max_episodes_rendered: 最大渲染剧集数
            return_episode_data: 是否返回剧集数据
            
        Returns:
            (成功标志, 消息)
        """
        try:
            # 创建运行目录
            self.run_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"评估任务 {self.task_id} 开始，运行目录: {self.run_dir}")
            
            # 发送开始状态
            await self._publish_status("running", "开始下载模型...")
            
            # 下载模型
            model_path = await self._download_model(model_uuid)
            if not model_path:
                return False, "模型下载失败"
            
            await self._publish_status("running", "模型下载完成，开始评估...")
            
            # 执行评估
            self.eval_results = await self._execute_evaluation(
                model_path=model_path,
                env_config=env_config,
                eval_config=eval_config,
                seed=seed,
                max_episodes_rendered=max_episodes_rendered,
                return_episode_data=return_episode_data,
            )
            
            if self.eval_results is None:
                return False, "评估执行失败"
            
            await self._publish_status("running", "评估完成，开始上传结果...")
            
            # 上传评估结果
            success = await self._upload_eval_results(model_uuid)
            if not success:
                return False, "评估结果上传失败"
            
            await self._publish_status("completed", "评估任务完成")
            
            # 发送评估结果消息
            await self._publish_eval_results(model_uuid)
            
            return True, "评估任务成功完成"
            
        except Exception as e:
            error_msg = f"评估任务失败: {str(e)}"
            logger.error(error_msg, exc_info=True)
            await self._publish_status("failed", error_msg)
            return False, error_msg
        
        finally:
            # 清理临时文件
            await self._cleanup()
    
    async def _download_model(self, model_uuid: str) -> Optional[str]:
        """
        从 MinIO 下载模型。
        
        Args:
            model_uuid: 模型 UUID
            
        Returns:
            本地模型路径，如果失败则返回 None
        """
        try:
            client = await connect_minio()
            if not client:
                logger.error("无法连接到 MinIO")
                return None
            
            # 创建模型目录
            model_dir = self.run_dir / "model"
            model_dir.mkdir(exist_ok=True)
            
            # 下载模型文件
            model_file = model_dir / f"{model_uuid}.tar.gz"
            success, message = await download_ckpt_from_minio(
                client=client,
                download_local_path=str(model_file),
                ckpt_name=f"{model_uuid}.tar.gz"
            )
            
            if not success:
                logger.error(f"模型下载失败: {message}")
                return None
            
            # 解压模型文件
            import tarfile
            with tarfile.open(model_file, 'r:gz') as tar:
                tar.extractall(path=model_dir)
            
            # 删除压缩文件
            model_file.unlink()
            
            # 返回模型目录路径
            model_path = model_dir / model_uuid
            if not model_path.exists():
                logger.error(f"解压后的模型路径不存在: {model_path}")
                return None
            
            logger.info(f"模型下载完成: {model_path}")
            return str(model_path)
            
        except Exception as e:
            logger.error(f"模型下载过程中发生错误: {e}", exc_info=True)
            return None
    
    async def _execute_evaluation(
        self,
        model_path: str,
        env_config: Dict[str, Any],
        eval_config: Dict[str, Any],
        seed: int,
        max_episodes_rendered: int,
        return_episode_data: bool,
    ) -> Optional[Dict[str, Any]]:
        """
        执行评估。
        
        Args:
            model_path: 模型路径
            env_config: 环境配置
            eval_config: 评估配置
            seed: 随机种子
            max_episodes_rendered: 最大渲染剧集数
            return_episode_data: 是否返回剧集数据
            
        Returns:
            评估结果字典，如果失败则返回 None
        """
        try:
            # 创建输出目录
            output_dir = self.run_dir / "eval_output"
            output_dir.mkdir(exist_ok=True)
            
            # 执行评估
            results = run_lerobot_evaluation(
                model_path=model_path,
                env_config=env_config,
                eval_config=eval_config,
                output_dir=str(output_dir),
                seed=seed,
                max_episodes_rendered=max_episodes_rendered,
                return_episode_data=return_episode_data,
            )
            
            logger.info(f"评估完成，结果: {results['aggregated']}")
            return results
            
        except Exception as e:
            logger.error(f"评估执行过程中发生错误: {e}", exc_info=True)
            return None
    
    async def _upload_eval_results(self, model_uuid: str) -> bool:
        """
        上传评估结果到 MinIO。
        
        Args:
            model_uuid: 模型 UUID
            
        Returns:
            上传是否成功
        """
        try:
            client = await connect_minio()
            if not client:
                logger.error("无法连接到 MinIO")
                return False
            
            # 上传评估信息文件
            eval_info_file = self.run_dir / "eval_output" / "eval_info.json"
            if eval_info_file.exists():
                success, message = await upload_file_to_minio(
                    client=client,
                    upload_file_local_path=str(eval_info_file),
                    filename=f"eval_info_{model_uuid}.json",
                    bucket_name=settings.MINIO_BUCKET,
                    object_dir="eval_results"
                )
                
                if not success:
                    logger.error(f"评估信息上传失败: {message}")
                    return False
            
            # 上传视频文件（如果存在）
            videos_dir = self.run_dir / "eval_output" / "videos"
            if videos_dir.exists():
                for video_file in videos_dir.glob("*.mp4"):
                    video_name = f"{model_uuid}_{video_file.name}"
                    success, message = await upload_file_to_minio(
                        client=client,
                        upload_file_local_path=str(video_file),
                        filename=video_name,
                        bucket_name=settings.MINIO_BUCKET,
                        object_dir="eval_videos"
                    )
                    
                    if not success:
                        logger.warning(f"视频文件上传失败: {video_file.name} - {message}")
            
            logger.info("评估结果上传完成")
            return True
            
        except Exception as e:
            logger.error(f"评估结果上传过程中发生错误: {e}", exc_info=True)
            return False
    
    async def _publish_status(self, status: str, message: str):
        """
        发布状态更新消息。
        
        Args:
            status: 状态
            message: 消息
        """
        try:
            connection = await connect_rabbitmq()
            if connection:
                await publish_status_message(
                    connection=connection,
                    task_id=self.task_id,
                    user_id=self.user_id,
                    status=status,
                    message=message
                )
                await connection.close()
        except Exception as e:
            logger.error(f"发布状态消息失败: {e}")
    
    async def _publish_eval_results(self, model_uuid: str):
        """
        发布评估结果消息。
        
        Args:
            model_uuid: 模型 UUID
        """
        try:
            connection = await connect_rabbitmq()
            if connection and self.eval_results:
                await publish_eval_result_message(
                    connection=connection,
                    task_id=self.task_id,
                    user_id=self.user_id,
                    model_uuid=model_uuid,
                    eval_results=self.eval_results
                )
                await connection.close()
        except Exception as e:
            logger.error(f"发布评估结果消息失败: {e}")
    
    async def _cleanup(self):
        """
        清理临时文件。
        """
        try:
            if self.run_dir.exists():
                shutil.rmtree(self.run_dir)
                logger.info(f"清理运行目录: {self.run_dir}")
        except Exception as e:
            logger.error(f"清理过程中发生错误: {e}")


async def run_evaluater_actor(
    task_id: int,
    user_id: int,
    model_uuid: str,
    env_config: Dict[str, Any],
    eval_config: Dict[str, Any],
    seed: int = 1000,
    max_episodes_rendered: int = 10,
    return_episode_data: bool = False,
) -> Tuple[bool, str]:
    """
    运行评估器 Actor 的便捷函数。
    
    Args:
        task_id: 任务 ID
        user_id: 用户 ID
        model_uuid: 模型 UUID
        env_config: 环境配置
        eval_config: 评估配置
        seed: 随机种子
        max_episodes_rendered: 最大渲染剧集数
        return_episode_data: 是否返回剧集数据
        
    Returns:
        (成功标志, 消息)
    """
    actor = LerobotEvaluaterActor(task_id=task_id, user_id=user_id)
    return await actor.run_evaluation(
        model_uuid=model_uuid,
        env_config=env_config,
        eval_config=eval_config,
        seed=seed,
        max_episodes_rendered=max_episodes_rendered,
        return_episode_data=return_episode_data,
    ) 