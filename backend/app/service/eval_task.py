from typing import Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from app.core.rabbitmq_utils import send_task_message
from app.core.minio_utils import download_model_from_minio, get_minio_client
from datetime import datetime, timezone

from app.models.user import AppUser
from app.models.eval_task import EvalTask
from app.models.train_task import TrainTask
from app.schemas.eval_task import EvalTaskCreate, EvalTaskCreateDB, EvalTaskUpdate
from app.crud import crud_eval_task, crud_train_task

class EvalTaskService:
    def __init__(self, db_session: AsyncSession): # 接收同步 Session
        self.db_session = db_session
        
    async def create_eval_task_for_user(self, user: AppUser, eval_task_create: EvalTaskCreate) -> Optional[EvalTask]:
        if not user:
            print("用户不存在，无法创建评估任务")
            return None
        train_task: TrainTask = await crud_train_task.get_train_task_by_id(self.db_session, eval_task_create.train_task_id)
        if not train_task:
            print("训练任务不存在，无法创建评估任务")
            return None

        eval_task_create_db = EvalTaskCreateDB(
            train_task_id=eval_task_create.train_task_id,
            eval_stage=eval_task_create.eval_stage,
            owner_id=user.id
        )
        # 调用 CRUD 层创建评估任务
        eval_task = await crud_eval_task.create_eval_task(
            db_session=self.db_session,
            eval_task_create_db=eval_task_create_db
        )
        
        await self.db_session.refresh(eval_task)
        # 进行rabbitmq的消息发送
        from app.core.rabbitmq_utils import send_eval_task_message
        try:
            await send_eval_task_message(eval_task.id, eval_task.owner_id, eval_task.train_task_id, eval_task.eval_stage)
            print(f"发送评估任务消息成功: {eval_task.id}")
        except Exception as e:
            print(f"发送评估任务消息失败: {e}")
            return None
        await self.db_session.commit()
        await self.db_session.refresh(eval_task)
        return eval_task
    
    async def download_eval_task_result(self, eval_task_id: int, current_user: AppUser) -> Optional[str]:
        """
        下载评估任务结果。
        - 检查评估任务是否存在
        - 检查用户是否有权限下载该任务结果
        - 调用 MinIO 客户端下载文件
        """
        eval_task = await crud_eval_task.get_eval_task_by_id(self.db_session, eval_task_id)
        if not eval_task:
            print(f"评估任务 ID {eval_task_id} 不存在，无法下载结果")
            return None
        if eval_task.owner_id != current_user.id:
            print(f"用户 {current_user.id} 无权下载评估任务 ID {eval_task_id} 的结果")
            return None
        # 使用 MinIO 客户端下载文件
        success, file_path = await download_model_from_minio(
            eval_task_id=eval_task.id,
            user_id=current_user.id
        )
        if not success:
            print(f"下载评估任务结果失败: {eval_task_id}")
            return None
        
        return file_path
        
    async def delete_eval_task_for_user(self, eval_task_id: int, user: AppUser) -> bool:
        """
        删除用户评估任务的业务逻辑。
        - 检查评估任务是否存在
        - 检查用户是否有权限删除该任务
        - 调用 CRUD 层删除评估任务
        """
        # 1. 检查评估任务是否存在 (业务逻辑)
        eval_task = await crud_eval_task.get_eval_task_by_id(self.db_session, eval_task_id)
        if not eval_task:
            print(f"训练任务 ID {eval_task_id} 不存在，无法删除")
            return False
        
        # 2. 检查用户是否有权限删除该任务
        if eval_task.owner_id != user.id:
            print(f"用户 {user.id} 无权删除训练任务 ID {eval_task_id}")
            return False
        
        # 3. 调用 CRUD 层删除训练任务
        success = await crud_eval_task.delete_eval_task(self.db_session, eval_task_id)
        
        if not success:
            print(f"删除训练任务 ID {eval_task_id} 失败")
            return False

        # 记得在minio中删除视频文件
        
        # 提交事务
        await self.db_session.commit()
        await self.db_session.refresh(user)
        
        return True
        
    async def get_eval_task_by_id(self, eval_task_id: int) -> Optional[EvalTask]:
        """
        根据评估任务 ID 获取评估任务。
        """
        return await crud_eval_task.get_eval_task_by_id(self.db_session, eval_task_id)
    
    async def get_eval_tasks_by_user(self, user_id: int) -> list[EvalTask]:
        """
        获取指定用户的所有评估任务。
        """
        return await crud_eval_task.get_eval_tasks_by_user_id(self.db_session, user_id)
    
    async def update_eval_task(self, eval_task_id: int, eval_task_update: EvalTaskUpdate) -> Optional[EvalTask]:
        """
        更新指定 ID 的评估任务。
        """
        # 检查评估任务是否存在
        eval_task = await crud_eval_task.get_eval_task_by_id(self.db_session, eval_task_id)
        if not eval_task:
            print(f"评估任务 ID {eval_task_id} 不存在，无法更新")
            return None
        
        updated_eval_task = await crud_eval_task.update_eval_task(self.db_session, eval_task_id, eval_task_update)
        
        await self.db_session.commit()
        await self.db_session.refresh(updated_eval_task)

        if not updated_eval_task:
            print(f"更新评估任务 ID {eval_task_id} 失败")
            return None
    
        return updated_eval_task