import json
from typing import Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from app.models.user import AppUser
from app.models.train_task import TrainTask
from app.models.dataset import Dataset
from app.schemas.train_task import TrainTaskCreate, TrainTaskCreateDB, TrainTaskUpdate
from app.crud import crud_train_task, crud_dataset
from app.core.rabbitmq_utils import send_task_message

class TrainTaskService:
    def __init__(self, db_session: AsyncSession): # 接收同步 Session
        self.db_session = db_session
        
    async def create_train_task_for_user(self, user: AppUser, train_task_create: TrainTaskCreate) -> Optional[TrainTask]:
        """
        创建用户训练任务的业务逻辑。
        - 检查用户是否存在
        - 检查数据集是否存在
        - 构建 TrainTaskCreateDB 对象
        - 调用 CRUD 层保存训练任务
        - 用rabbitmq发送任务消息
        """
        # 1. 检查用户是否存在 (业务逻辑)
        if not user:
            print("用户不存在，无法创建训练任务")
            return None
        dataset: Dataset = await crud_dataset.get_dataset_by_id(train_task_create.dataset_id)
        if not dataset:
            print("数据集不存在，无法创建训练任务")
            return None
        # 2. 构建 DatasetCreateDB 对象传递给 CRUD 层
        train_task_create_db = TrainTaskCreateDB(
            dataset_id=train_task_create.dataset_id,
            model_type_id=train_task_create.model_type_id,
            hyperparameter=train_task_create.hyperparameter,
            owner_id=user.id
        )
        # 3. 调用 CRUD 层创建训练任务
        train_task = await crud_train_task.create_train_task(
            db_session=self.db_session,
            train_task_create_db=train_task_create_db
        )
        
        # 刷新训练任务对象以获取最新数据
        await self.db_session.refresh(train_task)

        # 4. 向 RabbitMQ 发送任务消息
        dataset_uuid: Dataset = dataset.dataset_uuid
        #将创建的任务写成一个json并转成字符串
        task_msg_json_str: str = json.dumps({
            "task_id": train_task.id,
            "dataset_uuid": str(dataset_uuid),
            "model_type_id": train_task_create.model_type_id,
            "hyperparameter": train_task_create.hyperparameter,
            "owner_id": user.id
        })
        # 发送训练任务消息到 RabbitMQ
        try:
            await send_task_message(task_msg_json_str)
        except Exception as e:
            # 处理发送消息错误
            print(f"发送训练任务消息到 RabbitMQ 失败: {e}")
            raise ValueError("训练任务消息发送失败，请稍后重试。")
        
        # 提交事务
        await self.db_session.commit()
        
        
        return train_task
    
    async def update_train_task(self, train_task_id: int, train_task_update: TrainTaskUpdate) -> Optional[TrainTask]:
        """
        更新训练任务的业务逻辑。
        - 检查训练任务是否存在
        - 调用 CRUD 层更新训练任务
        """
        # 1. 检查训练任务是否存在 (业务逻辑)
        train_task = await crud_train_task.get_train_task_by_id(self.db_session, train_task_id)
        if not train_task:
            print(f"训练任务 ID {train_task_id} 不存在，无法更新")
            return None
        # 2. 调用 CRUD 层更新训练任务
        updated_train_task = await crud_train_task.update_train_task(
            db_session=self.db_session,
            train_task_id=train_task_id,
            train_task_update=train_task_update
        )
        
        await self.db_session.commit()
        # 提交事务后刷新训练任务对象以获取最新数据
        await self.db_session.refresh(updated_train_task)

        if not updated_train_task:
            print(f"训练任务 ID {train_task_id} 更新失败")
            return None
        # 刷新训练任务对象以获取最新数据
    
        return updated_train_task