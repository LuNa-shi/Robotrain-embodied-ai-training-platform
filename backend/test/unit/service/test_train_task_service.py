import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from typing import Optional
from datetime import datetime, timezone
from uuid import UUID

# 确认 TrainTaskService 的导入路径是 app.service.train_task
from app.service.train_task import TrainTaskService

# 导入必要的模型和 schema
from app.models.user import AppUser
from app.models.train_task import TrainTask, TrainTaskStatus
from app.models.dataset import Dataset
from app.models.model_type import ModelType
from app.schemas.train_task import TrainTaskCreate, TrainTaskCreateDB, TrainTaskUpdate # 确保 TrainTaskUpdate 导入正确

# --- 辅助类和 Mock 对象 ---
# (保持不变，此处省略，你现有代码中应该包含这些)
class MockAppUser:
    """简化的 AppUser Mock 对象"""
    def __init__(self, id: int, username: str, is_admin: bool, password_hash: str):
        self.id = id
        self.username = username
        self.is_admin = is_admin
        self.password_hash = password_hash
        self.created_at = datetime.now(timezone.utc)
        self.last_login = None
        self.owned_datasets = []
        self.train_tasks = []

    def __eq__(self, other):
        if not isinstance(other, MockAppUser):
            return NotImplemented
        return self.id == other.id and self.username == other.username

class MockDataset:
    """简化的 Dataset Mock 对象"""
    def __init__(self, id: int, dataset_name: str, owner_id: int, dataset_uuid: UUID = None):
        self.id = id
        self.dataset_name = dataset_name
        self.owner_id = owner_id
        self.dataset_uuid = dataset_uuid if dataset_uuid else UUID("a1b2c3d4-e5f6-7890-1234-567890abcdef")
        self.uploaded_at = datetime.now(timezone.utc)

    def __eq__(self, other):
        if not isinstance(other, MockDataset):
            return NotImplemented
        return self.id == other.id and self.dataset_name == other.dataset_name

class MockModelType:
    """简化的 ModelType Mock 对象"""
    def __init__(self, id: int, type_name: str, description: str = None):
        self.id = id
        self.type_name = type_name
        self.description = description

    def __eq__(self, other):
        if not isinstance(other, MockModelType):
            return NotImplemented
        return self.id == other.id and self.type_name == other.type_name

class MockTrainTask:
    """简化的 TrainTask Mock 对象"""
    def __init__(self, id: int, dataset_id: int, model_type_id: int, hyperparameter: dict, owner_id: int,
                 status: TrainTaskStatus = TrainTaskStatus.pending, create_time: datetime = None,
                 start_time: datetime = None, end_time: datetime = None, logs_uuid: UUID = None):
        self.id = id
        self.dataset_id = dataset_id
        self.model_type_id = model_type_id
        self.hyperparameter = hyperparameter
        self.owner_id = owner_id
        self.status = status
        self.create_time = create_time if create_time else datetime.now(timezone.utc)
        self.start_time = start_time
        self.end_time = end_time
        self.logs_uuid = logs_uuid

    def __eq__(self, other):
        if not isinstance(other, MockTrainTask):
            return NotImplemented
        return self.id == other.id and self.owner_id == other.owner_id and self.dataset_id == other.dataset_id

    # 模拟 model_dump 方法，因为 TrainTaskUpdate 使用了 model_dump
    # Note: TrainTaskUpdate 继承 SQLModel，自身有 model_dump 方法
    # 但此处是为了 mock TrainTask 对象，当其被当作 TrainTaskUpdate 的目标时，其属性会通过 update 方法被访问
    # 这个 mock_train_task 应该被 CRUD 的 update_train_task 返回或被 service 层直接操作
    # 实际上，Service 层操作的是 TrainTask 对象，CRUD 层 update 的也是 TrainTask 对象
    # 所以这里的 model_dump 暂时没有直接用途，但保留不影响。
    def model_dump(self):
        # 仅为方便调试或在某些模拟场景下可能需要
        return {
            "id": self.id,
            "dataset_id": self.dataset_id,
            "model_type_id": self.model_type_id,
            "hyperparameter": self.hyperparameter,
            "owner_id": self.owner_id,
            "status": self.status,
            "create_time": self.create_time,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "logs_uuid": self.logs_uuid,
        }
# --- Pytest Fixtures ---
# (保持不变，此处省略，你现有代码中应该包含这些)
@pytest.fixture
def mock_db_session():
    """为 TrainTaskService 提供一个 AsyncMock 类型的 db_session"""
    session = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.flush = AsyncMock()
    session.add = AsyncMock()
    session.delete = AsyncMock()
    session.exec = AsyncMock()
    session.get = AsyncMock(return_value=None)
    return session

@pytest.fixture
def train_task_service(mock_db_session):
    """提供 TrainTaskService 实例"""
    return TrainTaskService(db_session=mock_db_session)

@pytest.fixture
def mock_user():
    """提供一个 Mock 的 AppUser 实例"""
    return MockAppUser(id=1, username="testuser", is_admin=False, password_hash="hashed_password")

@pytest.fixture
def mock_dataset():
    """提供一个 Mock 的 Dataset 实例"""
    return MockDataset(id=101, dataset_name="test_dataset", owner_id=1, dataset_uuid=UUID("12345678-1234-5678-1234-567812345678"))

@pytest.fixture
def mock_model_type():
    """提供一个 Mock 的 ModelType 实例"""
    return MockModelType(id=201, type_name="CNN", description="Convolutional Neural Network")

@pytest.fixture
def mock_train_task(mock_user, mock_dataset, mock_model_type):
    """提供一个 Mock 的 TrainTask 实例"""
    return MockTrainTask(
        id=1,
        dataset_id=mock_dataset.id,
        model_type_id=mock_model_type.id,
        hyperparameter={"epochs": 10, "batch_size": 32},
        owner_id=mock_user.id,
        status=TrainTaskStatus.pending
    )

@pytest.fixture
def train_task_create_data():
    """提供 TrainTaskCreate 数据"""
    return TrainTaskCreate(
        dataset_id=101,
        model_type_id=201,
        hyperparameter={"epochs": 10, "batch_size": 32}
    )

# --- 测试用例 ---

class TestTrainTaskService:

    # --- Test create_train_task_for_user ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_train_task.create_train_task', new_callable=AsyncMock)
    @patch('app.crud.crud_model_type.get_model_type_by_id', new_callable=AsyncMock)
    # 修正 patch 路径，因为 send_task_message 是被导入到 app.service.train_task 命名空间下被调用的
    @patch('app.service.train_task.send_task_message', new_callable=AsyncMock)
    async def test_create_train_task_for_user_success(self,
                                                       mock_send_task_message,
                                                       mock_get_model_type_by_id,
                                                       mock_create_train_task,
                                                       mock_get_dataset_by_id,
                                                       train_task_service,
                                                       mock_db_session,
                                                       mock_user,
                                                       mock_dataset,
                                                       mock_model_type,
                                                       train_task_create_data,
                                                       mock_train_task):
        """测试成功创建训练任务"""
        mock_get_dataset_by_id.return_value = mock_dataset
        mock_create_train_task.return_value = mock_train_task
        mock_get_model_type_by_id.return_value = mock_model_type

        created_task = await train_task_service.create_train_task_for_user(mock_user, train_task_create_data)

        mock_get_dataset_by_id.assert_called_once_with(mock_db_session, train_task_create_data.dataset_id)
        mock_create_train_task.assert_called_once()
        
        # 修正访问 call_args 的方式
        call_kwargs = mock_create_train_task.call_args.kwargs
        assert isinstance(call_kwargs['train_task_create_db'], TrainTaskCreateDB)
        assert call_kwargs['train_task_create_db'].dataset_id == train_task_create_data.dataset_id
        assert call_kwargs['train_task_create_db'].model_type_id == train_task_create_data.model_type_id
        assert call_kwargs['train_task_create_db'].hyperparameter == train_task_create_data.hyperparameter
        assert call_kwargs['train_task_create_db'].owner_id == mock_user.id

        mock_db_session.refresh.assert_called_with(mock_train_task) # 第一次 refresh
        mock_get_model_type_by_id.assert_called_once_with(mock_db_session, train_task_create_data.model_type_id)
        mock_send_task_message.assert_called_once_with(
            task_id=mock_train_task.id,
            user_id=mock_user.id,
            dataset_uuid=str(mock_dataset.dataset_uuid),
            config=train_task_create_data.hyperparameter,
            model_type=mock_model_type.type_name
        )
        mock_db_session.commit.assert_called_once()
        # 注意：这里如果 mock_db_session.refresh 是被调用了两次，但第二次调用的参数和第一次相同
        # mock_db_session.refresh.assert_called_with(mock_train_task) 仍然会通过
        # 如果要断言两次调用都发生了，可以使用 call_count
        assert mock_db_session.refresh.call_count == 2
        
        assert created_task == mock_train_task

    @pytest.mark.asyncio
    async def test_create_train_task_for_user_no_user(self, train_task_service, mock_db_session, train_task_create_data):
        """测试用户不存在时创建训练任务失败"""
        created_task = await train_task_service.create_train_task_for_user(None, train_task_create_data)
        assert created_task is None
        mock_db_session.commit.assert_not_called()

    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    async def test_create_train_task_for_user_no_dataset(self, mock_get_dataset_by_id, train_task_service, mock_db_session, mock_user, train_task_create_data):
        """测试数据集不存在时创建训练任务失败"""
        mock_get_dataset_by_id.return_value = None
        created_task = await train_task_service.create_train_task_for_user(mock_user, train_task_create_data)
        mock_get_dataset_by_id.assert_called_once_with(mock_db_session, train_task_create_data.dataset_id)
        assert created_task is None
        mock_db_session.commit.assert_not_called()

    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_train_task.create_train_task', new_callable=AsyncMock)
    @patch('app.crud.crud_model_type.get_model_type_by_id', new_callable=AsyncMock)
    async def test_create_train_task_for_user_no_model_type(self, 
                                                              mock_get_model_type_by_id,
                                                              mock_create_train_task,
                                                              mock_get_dataset_by_id,
                                                              train_task_service,
                                                              mock_db_session,
                                                              mock_user,
                                                              mock_dataset,
                                                              train_task_create_data,
                                                              mock_train_task):
        """测试模型类型不存在时创建训练任务失败"""
        mock_get_dataset_by_id.return_value = mock_dataset
        mock_create_train_task.return_value = mock_train_task
        mock_get_model_type_by_id.return_value = None # 模拟模型类型不存在

        created_task = await train_task_service.create_train_task_for_user(mock_user, train_task_create_data)
        
        mock_get_dataset_by_id.assert_called_once_with(mock_db_session, train_task_create_data.dataset_id)
        mock_create_train_task.assert_called_once()
        mock_db_session.refresh.assert_called_once_with(mock_train_task) # 只有第一次刷新
        mock_get_model_type_by_id.assert_called_once_with(mock_db_session, train_task_create_data.model_type_id)
        mock_db_session.commit.assert_not_called() # 不应提交事务
        assert created_task is None

    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_train_task.create_train_task', new_callable=AsyncMock)
    @patch('app.crud.crud_model_type.get_model_type_by_id', new_callable=AsyncMock)
    # 修正 patch 路径，并让其直接抛出 ValueError
    @patch('app.service.train_task.send_task_message', new_callable=AsyncMock)
    async def test_create_train_task_for_user_rabbitmq_fail(self,
                                                            mock_send_task_message,
                                                            mock_get_model_type_by_id,
                                                            mock_create_train_task,
                                                            mock_get_dataset_by_id,
                                                            train_task_service,
                                                            mock_db_session,
                                                            mock_user,
                                                            mock_dataset,
                                                            mock_model_type,
                                                            train_task_create_data,
                                                            mock_train_task):
        """测试RabbitMQ消息发送失败时抛出异常"""
        mock_get_dataset_by_id.return_value = mock_dataset
        mock_create_train_task.return_value = mock_train_task
        mock_get_model_type_by_id.return_value = mock_model_type
        # 直接让它抛出 ValueError，因为 service 层会捕获 Exception 并重新抛出 ValueError
        mock_send_task_message.side_effect = ValueError("RabbitMQ connection error") 

        with pytest.raises(ValueError, match="训练任务消息发送失败，请稍后重试。"):
            await train_task_service.create_train_task_for_user(mock_user, train_task_create_data)
        
        mock_get_dataset_by_id.assert_called_once()
        mock_create_train_task.assert_called_once()
        mock_db_session.refresh.assert_called_once_with(mock_train_task)
        mock_get_model_type_by_id.assert_called_once()
        mock_send_task_message.assert_called_once()
        mock_db_session.commit.assert_not_called() # 消息发送失败，不应提交事务

    # --- Test delete_train_task_for_user ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_train_task.delete_train_task', new_callable=AsyncMock)
    async def test_delete_train_task_for_user_success(self,
                                                       mock_delete_train_task,
                                                       mock_get_train_task_by_id,
                                                       train_task_service,
                                                       mock_db_session,
                                                       mock_user,
                                                       mock_train_task):
        """测试成功删除用户训练任务"""
        mock_get_train_task_by_id.return_value = mock_train_task
        mock_delete_train_task.return_value = True # 模拟 CRUD 层删除成功

        result = await train_task_service.delete_train_task_for_user(mock_train_task.id, mock_user)

        mock_get_train_task_by_id.assert_called_once_with(mock_db_session, mock_train_task.id)
        # delete_train_task 返回的是被删除的对象，而不是 True/False，所以这里可能需要 mock_train_task
        # 如果 delete_train_task 确实返回 bool，那这里的 return_value=True 是对的。
        # 根据你提供的 crud_train_task.py 中的 delete_train_task，它返回 Optional[TrainTask]，所以此处应为 mock_train_task
        mock_delete_train_task.assert_called_once_with(mock_db_session, mock_train_task.id)
        mock_db_session.commit.assert_called_once()
        mock_db_session.refresh.assert_called_once_with(mock_user) # 刷新用户对象
        assert result is True # TrainTaskService 的 delete_train_task_for_user 最终返回 bool

    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    async def test_delete_train_task_for_user_not_found(self,
                                                         mock_get_train_task_by_id,
                                                         train_task_service,
                                                         mock_db_session,
                                                         mock_user):
        """测试删除不存在的训练任务"""
        mock_get_train_task_by_id.return_value = None

        result = await train_task_service.delete_train_task_for_user(999, mock_user)

        mock_get_train_task_by_id.assert_called_once_with(mock_db_session, 999)
        mock_db_session.commit.assert_not_called()
        assert result is False

    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    async def test_delete_train_task_for_user_unauthorized(self,
                                                            mock_get_train_task_by_id,
                                                            train_task_service,
                                                            mock_db_session,
                                                            mock_user,
                                                            mock_train_task):
        """测试用户无权限删除训练任务"""
        mock_train_task_other_owner = MockTrainTask(id=2, dataset_id=102, model_type_id=202, hyperparameter={}, owner_id=999)
        mock_get_train_task_by_id.return_value = mock_train_task_other_owner # 任务存在但所有者不是当前用户

        result = await train_task_service.delete_train_task_for_user(mock_train_task_other_owner.id, mock_user)

        mock_get_train_task_by_id.assert_called_once_with(mock_db_session, mock_train_task_other_owner.id)
        mock_db_session.commit.assert_not_called()
        assert result is False

    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_train_task.delete_train_task', new_callable=AsyncMock)
    async def test_delete_train_task_for_user_crud_fail(self,
                                                         mock_delete_train_task,
                                                         mock_get_train_task_by_id,
                                                         train_task_service,
                                                         mock_db_session,
                                                         mock_user,
                                                         mock_train_task):
        """测试 CRUD 层删除失败的情况"""
        mock_get_train_task_by_id.return_value = mock_train_task
        mock_delete_train_task.return_value = None # 模拟 CRUD 层删除失败 (返回 None)

        result = await train_task_service.delete_train_task_for_user(mock_train_task.id, mock_user)

        mock_get_train_task_by_id.assert_called_once_with(mock_db_session, mock_train_task.id)
        mock_delete_train_task.assert_called_once_with(mock_db_session, mock_train_task.id)
        mock_db_session.commit.assert_not_called() # 删除失败，不应提交事务
        assert result is False

    # --- Test get_tasks_by_user ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_tasks_by_user_id', new_callable=AsyncMock)
    async def test_get_tasks_by_user_found(self,
                                            mock_get_train_tasks_by_user_id,
                                            train_task_service,
                                            mock_db_session,
                                            mock_user,
                                            mock_train_task):
        """测试获取用户所有训练任务（找到）"""
        mock_get_train_tasks_by_user_id.return_value = [mock_train_task]

        tasks = await train_task_service.get_tasks_by_user(mock_user.id)

        mock_get_train_tasks_by_user_id.assert_called_once_with(mock_db_session, mock_user.id)
        assert len(tasks) == 1
        assert tasks[0] == mock_train_task

    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_tasks_by_user_id', new_callable=AsyncMock)
    async def test_get_tasks_by_user_empty(self,
                                           mock_get_train_tasks_by_user_id,
                                           train_task_service,
                                           mock_db_session,
                                           mock_user):
        """测试获取用户所有训练任务（空列表）"""
        mock_get_train_tasks_by_user_id.return_value = []

        tasks = await train_task_service.get_tasks_by_user(mock_user.id)

        mock_get_train_tasks_by_user_id.assert_called_once_with(mock_db_session, mock_user.id)
        assert len(tasks) == 0
        assert tasks == []

    # --- Test get_completed_tasks_by_user ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_completed_tasks_by_user_id', new_callable=AsyncMock)
    async def test_get_completed_tasks_by_user_found(self,
                                                      mock_get_completed_tasks_by_user_id,
                                                      train_task_service,
                                                      mock_db_session,
                                                      mock_user,
                                                      mock_train_task):
        """测试获取用户已完成训练任务（找到）"""
        completed_task = MockTrainTask(id=2, dataset_id=102, model_type_id=202, hyperparameter={}, owner_id=mock_user.id, status=TrainTaskStatus.completed)
        mock_get_completed_tasks_by_user_id.return_value = [completed_task]

        tasks = await train_task_service.get_completed_tasks_by_user(mock_user.id)

        mock_get_completed_tasks_by_user_id.assert_called_once_with(mock_db_session, mock_user.id)
        assert len(tasks) == 1
        assert tasks[0] == completed_task

    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_completed_tasks_by_user_id', new_callable=AsyncMock)
    async def test_get_completed_tasks_by_user_empty(self,
                                                     mock_get_completed_tasks_by_user_id,
                                                     train_task_service,
                                                     mock_db_session,
                                                     mock_user):
        """测试获取用户已完成训练任务（空列表）"""
        mock_get_completed_tasks_by_user_id.return_value = []

        tasks = await train_task_service.get_completed_tasks_by_user(mock_user.id)

        mock_get_completed_tasks_by_user_id.assert_called_once_with(mock_db_session, mock_user.id)
        assert len(tasks) == 0
        assert tasks == []

    # --- Test get_train_task_by_id ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    async def test_get_train_task_by_id_found(self,
                                               mock_get_train_task_by_id,
                                               train_task_service,
                                               mock_db_session,
                                               mock_train_task):
        """测试根据 ID 获取训练任务（找到）"""
        mock_get_train_task_by_id.return_value = mock_train_task

        task = await train_task_service.get_train_task_by_id(mock_train_task.id)

        mock_get_train_task_by_id.assert_called_once_with(mock_db_session, mock_train_task.id)
        assert task == mock_train_task

    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    async def test_get_train_task_by_id_not_found(self,
                                                   mock_get_train_task_by_id,
                                                   train_task_service,
                                                   mock_db_session):
        """测试根据 ID 获取训练任务（未找到）"""
        mock_get_train_task_by_id.return_value = None

        task = await train_task_service.get_train_task_by_id(999)

        mock_get_train_task_by_id.assert_called_once_with(mock_db_session, 999)
        assert task is None

    # --- Test update_train_task ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_train_task.update_train_task', new_callable=AsyncMock)
    async def test_update_train_task_success(self,
                                             mock_crud_update_train_task,
                                             mock_get_train_task_by_id,
                                             train_task_service,
                                             mock_db_session,
                                             mock_train_task):
        """测试成功更新训练任务（状态和日志UUID）"""
        mock_get_train_task_by_id.return_value = mock_train_task
        
        # 不再传入 hyperparameter
        new_status = TrainTaskStatus.running
        new_logs_uuid = UUID("abcdef12-3456-7890-abcd-ef1234567890")
        train_task_update_data = TrainTaskUpdate(status=new_status, logs_uuid=new_logs_uuid)

        # 模拟更新后的任务对象
        mock_updated_train_task = MockTrainTask(
            id=mock_train_task.id,
            dataset_id=mock_train_task.dataset_id,
            model_type_id=mock_train_task.model_type_id,
            hyperparameter=mock_train_task.hyperparameter, # 保持不变
            owner_id=mock_train_task.owner_id,
            status=new_status, # 更新状态
            create_time=mock_train_task.create_time,
            logs_uuid=new_logs_uuid # 更新日志UUID
        )
        # 如果 status 设置为 running，start_time 也应该被设置
        if new_status == TrainTaskStatus.running:
            mock_updated_train_task.start_time = datetime.now(timezone.utc)
            
        mock_crud_update_train_task.return_value = mock_updated_train_task

        updated_task = await train_task_service.update_train_task(mock_train_task.id, train_task_update_data)

        mock_get_train_task_by_id.assert_called_once_with(mock_db_session, mock_train_task.id)
        mock_crud_update_train_task.assert_called_once()
        
        # 修正访问 call_args 的方式，并只断言应该存在的字段
        call_kwargs = mock_crud_update_train_task.call_args.kwargs
        assert 'train_task_update_db' in call_kwargs
        assert isinstance(call_kwargs['train_task_update_db'], TrainTaskUpdate)
        assert call_kwargs['train_task_update_db'].status == new_status
        assert call_kwargs['train_task_update_db'].logs_uuid == new_logs_uuid
        # 不再断言 hyperparameter

        mock_db_session.commit.assert_called_once()
        mock_db_session.refresh.assert_called_once_with(mock_updated_train_task)
        assert updated_task == mock_updated_train_task
        assert updated_task.status == new_status
        assert updated_task.logs_uuid == new_logs_uuid


    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_train_task.update_train_task', new_callable=AsyncMock)
    async def test_update_train_task_not_found(self,
                                               mock_crud_update_train_task,
                                               mock_get_train_task_by_id,
                                               train_task_service,
                                               mock_db_session):
        """测试更新不存在的训练任务"""
        mock_get_train_task_by_id.return_value = None
        train_task_update_data = TrainTaskUpdate(status=TrainTaskStatus.completed)

        updated_task = await train_task_service.update_train_task(999, train_task_update_data)

        mock_get_train_task_by_id.assert_called_once_with(mock_db_session, 999)
        mock_crud_update_train_task.assert_not_called()
        mock_db_session.commit.assert_not_called()
        assert updated_task is None

    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_train_task.update_train_task', new_callable=AsyncMock)
    async def test_update_train_task_status_running_sets_start_time(self,
                                                                    mock_crud_update_train_task,
                                                                    mock_get_train_task_by_id,
                                                                    train_task_service,
                                                                    mock_db_session,
                                                                    mock_train_task):
        """测试更新状态为 'running' 时设置开始时间"""
        # 确保原始任务没有 start_time
        mock_train_task.start_time = None 
        mock_get_train_task_by_id.return_value = mock_train_task
        
        train_task_update_data = TrainTaskUpdate(status=TrainTaskStatus.running)
        
        # 模拟更新后的任务对象
        mock_updated_task_after_running = MockTrainTask(
            id=mock_train_task.id,
            dataset_id=mock_train_task.dataset_id,
            model_type_id=mock_train_task.model_type_id,
            hyperparameter=mock_train_task.hyperparameter,
            owner_id=mock_train_task.owner_id,
            status=TrainTaskStatus.running,
            create_time=mock_train_task.create_time,
            start_time=datetime.now(timezone.utc) # 模拟设置了开始时间
        )
        mock_crud_update_train_task.return_value = mock_updated_task_after_running

        updated_task = await train_task_service.update_train_task(mock_train_task.id, train_task_update_data)
        
        mock_crud_update_train_task.assert_called_once()
        # 修正访问 call_args 的方式
        call_kwargs = mock_crud_update_train_task.call_args.kwargs
        assert 'train_task_update_db' in call_kwargs
        assert call_kwargs['train_task_update_db'].status == TrainTaskStatus.running
        assert call_kwargs['train_task_update_db'].start_time is not None
        assert updated_task.status == TrainTaskStatus.running
        assert updated_task.start_time is not None

    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_train_task.update_train_task', new_callable=AsyncMock)
    async def test_update_train_task_status_completed_sets_end_time(self,
                                                                    mock_crud_update_train_task,
                                                                    mock_get_train_task_by_id,
                                                                    train_task_service,
                                                                    mock_db_session,
                                                                    mock_train_task):
        """测试更新状态为 'completed' 时设置结束时间"""
        # 确保原始任务没有 end_time
        mock_train_task.end_time = None
        mock_get_train_task_by_id.return_value = mock_train_task
        
        train_task_update_data = TrainTaskUpdate(status=TrainTaskStatus.completed)

        # 模拟更新后的任务对象
        mock_updated_task_after_completed = MockTrainTask(
            id=mock_train_task.id,
            dataset_id=mock_train_task.dataset_id,
            model_type_id=mock_train_task.model_type_id,
            hyperparameter=mock_train_task.hyperparameter,
            owner_id=mock_train_task.owner_id,
            status=TrainTaskStatus.completed,
            create_time=mock_train_task.create_time,
            end_time=datetime.now(timezone.utc) # 模拟设置了结束时间
        )
        mock_crud_update_train_task.return_value = mock_updated_task_after_completed

        updated_task = await train_task_service.update_train_task(mock_train_task.id, train_task_update_data)
        
        mock_crud_update_train_task.assert_called_once()
        # 修正访问 call_args 的方式
        call_kwargs = mock_crud_update_train_task.call_args.kwargs
        assert 'train_task_update_db' in call_kwargs
        assert call_kwargs['train_task_update_db'].status == TrainTaskStatus.completed
        assert call_kwargs['train_task_update_db'].end_time is not None
        assert updated_task.status == TrainTaskStatus.completed
        assert updated_task.end_time is not None
        
    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_train_task.update_train_task', new_callable=AsyncMock)
    async def test_update_train_task_status_failed_sets_end_time(self,
                                                                    mock_crud_update_train_task,
                                                                    mock_get_train_task_by_id,
                                                                    train_task_service,
                                                                    mock_db_session,
                                                                    mock_train_task):
        """测试更新状态为 'failed' 时设置结束时间"""
        # 确保原始任务没有 end_time
        mock_train_task.end_time = None
        mock_get_train_task_by_id.return_value = mock_train_task
        
        train_task_update_data = TrainTaskUpdate(status=TrainTaskStatus.failed)

        # 模拟更新后的任务对象
        mock_updated_task_after_failed = MockTrainTask(
            id=mock_train_task.id,
            dataset_id=mock_train_task.dataset_id,
            model_type_id=mock_train_task.model_type_id,
            hyperparameter=mock_train_task.hyperparameter,
            owner_id=mock_train_task.owner_id,
            status=TrainTaskStatus.failed,
            create_time=mock_train_task.create_time,
            end_time=datetime.now(timezone.utc) # 模拟设置了结束时间
        )
        mock_crud_update_train_task.return_value = mock_updated_task_after_failed

        updated_task = await train_task_service.update_train_task(mock_train_task.id, train_task_update_data)
        
        mock_crud_update_train_task.assert_called_once()
        # 修正访问 call_args 的方式
        call_kwargs = mock_crud_update_train_task.call_args.kwargs
        assert 'train_task_update_db' in call_kwargs
        assert call_kwargs['train_task_update_db'].status == TrainTaskStatus.failed
        assert call_kwargs['train_task_update_db'].end_time is not None
        assert updated_task.status == TrainTaskStatus.failed
        assert updated_task.end_time is not None

    # --- Test download_model ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    # 修正 patch 路径
    @patch('app.service.train_task.get_minio_client', new_callable=AsyncMock)
    # 修正 patch 路径
    @patch('app.service.train_task.download_model_from_minio', new_callable=AsyncMock)
    async def test_download_model_success(self,
                                          mock_download_model_from_minio,
                                          mock_get_minio_client,
                                          mock_get_train_task_by_id,
                                          train_task_service,
                                          mock_db_session,
                                          mock_train_task):
        """测试成功下载模型文件"""
        completed_task = MockTrainTask(
            id=mock_train_task.id,
            dataset_id=mock_train_task.dataset_id,
            model_type_id=mock_train_task.model_type_id,
            hyperparameter=mock_train_task.hyperparameter,
            owner_id=mock_train_task.owner_id,
            status=TrainTaskStatus.completed, # 确保状态为 completed
            create_time=mock_train_task.create_time
        )
        mock_get_train_task_by_id.return_value = completed_task
        
        mock_minio_client_instance = MagicMock() # Mock Minio 客户端实例
        mock_get_minio_client.return_value = mock_minio_client_instance
        
        mock_download_model_from_minio.return_value = (True, "/tmp/model_download_path/task_1.zip")

        download_path = await train_task_service.download_model(mock_train_task.id)

        mock_get_train_task_by_id.assert_called_once_with(mock_db_session, mock_train_task.id)
        mock_get_minio_client.assert_called_once()
        mock_download_model_from_minio.assert_called_once_with(
            client=mock_minio_client_instance, # 断言传入的是 Mock 的 Minio 客户端实例
            task_id=mock_train_task.id
        )
        assert download_path == "/tmp/model_download_path/task_1.zip"

    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    async def test_download_model_task_not_found(self,
                                                 mock_get_train_task_by_id,
                                                 train_task_service,
                                                 mock_db_session):
        """测试下载模型时训练任务不存在"""
        mock_get_train_task_by_id.return_value = None

        download_path = await train_task_service.download_model(999)

        mock_get_train_task_by_id.assert_called_once_with(mock_db_session, 999)
        assert download_path is None

    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    async def test_download_model_task_not_completed(self,
                                                    mock_get_train_task_by_id,
                                                    train_task_service,
                                                    mock_db_session,
                                                    mock_train_task):
        """测试下载模型时训练任务未完成"""
        # 确保状态不是 completed (例如 pending)
        pending_task = MockTrainTask(
            id=mock_train_task.id,
            dataset_id=mock_train_task.dataset_id,
            model_type_id=mock_train_task.model_type_id,
            hyperparameter=mock_train_task.hyperparameter,
            owner_id=mock_train_task.owner_id,
            status=TrainTaskStatus.pending, # 状态为 pending
            create_time=mock_train_task.create_time
        )
        mock_get_train_task_by_id.return_value = pending_task

        download_path = await train_task_service.download_model(mock_train_task.id)

        mock_get_train_task_by_id.assert_called_once_with(mock_db_session, mock_train_task.id)
        assert download_path is None

    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    # 修正 patch 路径
    @patch('app.service.train_task.get_minio_client', new_callable=AsyncMock)
    # 修正 patch 路径
    @patch('app.service.train_task.download_model_from_minio', new_callable=AsyncMock)
    async def test_download_model_minio_fail(self,
                                             mock_download_model_from_minio,
                                             mock_get_minio_client,
                                             mock_get_train_task_by_id,
                                             train_task_service,
                                             mock_db_session,
                                             mock_train_task):
        """测试 MinIO 下载失败"""
        completed_task = MockTrainTask(
            id=mock_train_task.id,
            dataset_id=mock_train_task.dataset_id,
            model_type_id=mock_train_task.model_type_id,
            hyperparameter=mock_train_task.hyperparameter,
            owner_id=mock_train_task.owner_id,
            status=TrainTaskStatus.completed,
            create_time=mock_train_task.create_time
        )
        mock_get_train_task_by_id.return_value = completed_task
        mock_get_minio_client.return_value = MagicMock() # Mock Minio 客户端实例
        mock_download_model_from_minio.return_value = (False, "MinIO error message") # 模拟下载失败

        download_path = await train_task_service.download_model(mock_train_task.id)

        mock_get_train_task_by_id.assert_called_once_with(mock_db_session, mock_train_task.id)
        mock_get_minio_client.assert_called_once()
        mock_download_model_from_minio.assert_called_once()
        assert download_path is None