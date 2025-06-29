from typing import Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from app.models.user import AppUser
from app.models.train_log import TrainLog
from app.schemas.train_log import TrainLogCreate, TrainLogCreateDB 
from app.crud import crud_train_log

class TrainLogService:
    def __init__(self, db_session: AsyncSession):
        self.db_session = db_session

    async def create_train_log_for_task(self, user: AppUser, train_log_create: TrainLogCreate) -> Optional[TrainLog]:
        """
        创建训练日志的业务逻辑。
        - 检查用户是否存在
        - 构建 TrainLogCreateDB 对象
        - 调用 CRUD 层保存训练日志
        """
        # 1. 检查用户是否存在 (业务逻辑)
        if not user:
            print("用户不存在，无法创建训练日志")
            return None
        
        # 2. 构建 TrainLogCreateDB 对象传递给 CRUD 层
        train_log_create_db = TrainLogCreateDB(
            train_task_id=train_log_create.train_task_id,
            log_message=train_log_create.log_message
        )
        
        # 3. 调用 CRUD 层创建训练日志
        train_log = await crud_train_log.create_train_log(
            db_session=self.db_session,
            train_log_create_db=train_log_create_db
        )
        await self.db_session.commit()  # 提交事务以保存更改
        # 刷新训练日志对象以获取最新数据
        await self.db_session.refresh(train_log)
        
        return train_log
    
    async def get_train_logs_by_task_id(self, train_task_id: int) -> list[TrainLog]:
        """
        根据训练任务 ID 获取所有相关的训练日志。
        """
        train_logs = await crud_train_log.get_train_logs_by_task_id(
            db_session=self.db_session,
            train_task_id=train_task_id
        )
        return train_logs