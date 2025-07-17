import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from typing import Optional, List
from datetime import datetime, timezone
from uuid import UUID

# 导入 EvalTaskService
from app.service.eval_task import EvalTaskService

# 导入模型和 Schema
from app.models.user import AppUser
from app.models.train_task import TrainTask, TrainTaskStatus
from app.models.eval_task import EvalTask, EvalTaskStatus
from app.schemas.eval_task import EvalTaskCreate, EvalTaskCreateDB, EvalTaskUpdate

# --- 辅助类和 Mock 对象 ---

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

class MockEvalTask:
    """简化的 EvalTask Mock 对象"""
    def __init__(self, id: int, train_task_id: int, eval_stage: int, owner_id: int,
                 status: EvalTaskStatus = EvalTaskStatus.pending, create_time: datetime = None,
                 start_time: datetime = None, end_time: datetime = None, video_names: Optional[List[str]] = None):
        self.id = id
        self.train_task_id = train_task_id
        self.eval_stage = eval_stage
        self.owner_id = owner_id
        self.status = status
        self.create_time = create_time if create_time else datetime.now(timezone.utc)
        self.start_time = start_time
        self.end_time = end_time
        self.video_names = video_names

    def __eq__(self, other):
        if not isinstance(other, MockEvalTask):
            return NotImplemented
        return (self.id == other.id and self.owner_id == other.owner_id and
                self.train_task_id == other.train_task_id and self.eval_stage == other.eval_stage)


# --- Pytest Fixtures ---

@pytest.fixture
def mock_db_session():
    """为 EvalTaskService 提供一个 AsyncMock 类型的 db_session"""
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
def eval_task_service(mock_db_session):
    """提供 EvalTaskService 实例"""
    return EvalTaskService(db_session=mock_db_session)

@pytest.fixture
def mock_user():
    """提供一个 Mock 的 AppUser 实例"""
    return MockAppUser(id=1, username="testuser", is_admin=False, password_hash="hashed_password")

@pytest.fixture
def mock_train_task(mock_user):
    """提供一个 Mock 的 TrainTask 实例"""
    return MockTrainTask(
        id=101,
        dataset_id=1001,
        model_type_id=2001,
        hyperparameter={"epochs": 10},
        owner_id=mock_user.id,
        status=TrainTaskStatus.completed
    )

@pytest.fixture
def mock_eval_task(mock_user, mock_train_task):
    """提供一个 Mock 的 EvalTask 实例"""
    return MockEvalTask(
        id=1,
        train_task_id=mock_train_task.id,
        eval_stage=1,
        owner_id=mock_user.id,
        status=EvalTaskStatus.pending
    )

@pytest.fixture
def eval_task_create_data():
    """提供 EvalTaskCreate 数据"""
    return EvalTaskCreate(
        train_task_id=101,
        eval_stage=1
    )

@pytest.fixture
def eval_task_update_data():
    """提供 EvalTaskUpdate 数据"""
    return EvalTaskUpdate(
        status=EvalTaskStatus.completed,
        end_time=datetime.now(timezone.utc)
    )


# --- 测试类 ---
class TestEvalTaskService:

    # --- Test create_eval_task_for_user ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_eval_task.create_eval_task', new_callable=AsyncMock)
    # >>> 修改这里：patch 到 send_eval_task_message 的原始定义位置
    @patch('app.core.rabbitmq_utils.send_eval_task_message', new_callable=AsyncMock)
    async def test_create_eval_task_for_user_success(self,
                                                       mock_send_eval_task_message,
                                                       mock_create_eval_task,
                                                       mock_get_train_task_by_id,
                                                       eval_task_service,
                                                       mock_db_session,
                                                       mock_user,
                                                       mock_train_task,
                                                       mock_eval_task,
                                                       eval_task_create_data):
        """测试成功创建评估任务"""
        mock_get_train_task_by_id.return_value = mock_train_task
        mock_create_eval_task.return_value = mock_eval_task
        mock_send_eval_task_message.return_value = None

        created_task = await eval_task_service.create_eval_task_for_user(mock_user, eval_task_create_data)

        mock_get_train_task_by_id.assert_called_once_with(mock_db_session, eval_task_create_data.train_task_id)
        mock_create_eval_task.assert_called_once()
        
        call_kwargs = mock_create_eval_task.call_args.kwargs
        assert isinstance(call_kwargs['eval_task_create_db'], EvalTaskCreateDB)
        assert call_kwargs['eval_task_create_db'].train_task_id == eval_task_create_data.train_task_id
        assert call_kwargs['eval_task_create_db'].eval_stage == eval_task_create_data.eval_stage
        assert call_kwargs['eval_task_create_db'].owner_id == mock_user.id

        assert mock_db_session.refresh.call_count == 2
        mock_db_session.commit.assert_called_once()

        mock_send_eval_task_message.assert_called_once_with(
            mock_eval_task.id,
            mock_eval_task.owner_id,
            mock_eval_task.train_task_id,
            mock_eval_task.eval_stage
        )
        
        assert created_task == mock_eval_task


    @pytest.mark.asyncio
    async def test_create_eval_task_for_user_no_user(self, eval_task_service, mock_db_session, eval_task_create_data):
        """测试用户不存在时创建评估任务失败"""
        created_task = await eval_task_service.create_eval_task_for_user(None, eval_task_create_data)
        assert created_task is None
        mock_db_session.commit.assert_not_called()


    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    async def test_create_eval_task_for_user_no_train_task(self,
                                                             mock_get_train_task_by_id,
                                                             eval_task_service,
                                                             mock_db_session,
                                                             mock_user,
                                                             eval_task_create_data):
        """测试训练任务不存在时创建评估任务失败"""
        mock_get_train_task_by_id.return_value = None

        created_task = await eval_task_service.create_eval_task_for_user(mock_user, eval_task_create_data)

        mock_get_train_task_by_id.assert_called_once_with(mock_db_session, eval_task_create_data.train_task_id)
        assert created_task is None
        mock_db_session.commit.assert_not_called()


    @pytest.mark.asyncio
    @patch('app.crud.crud_train_task.get_train_task_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_eval_task.create_eval_task', new_callable=AsyncMock)
    # >>> 修改这里：patch 到 send_eval_task_message 的原始定义位置
    @patch('app.core.rabbitmq_utils.send_eval_task_message', new_callable=AsyncMock)
    async def test_create_eval_task_for_user_rabbitmq_fail(self,
                                                            mock_send_eval_task_message,
                                                            mock_create_eval_task,
                                                            mock_get_train_task_by_id,
                                                            eval_task_service,
                                                            mock_db_session,
                                                            mock_user,
                                                            mock_train_task,
                                                            mock_eval_task,
                                                            eval_task_create_data):
        """测试 RabbitMQ 消息发送失败时"""
        mock_get_train_task_by_id.return_value = mock_train_task
        mock_create_eval_task.return_value = mock_eval_task
        mock_send_eval_task_message.side_effect = Exception("RabbitMQ connection error")

        created_task = await eval_task_service.create_eval_task_for_user(mock_user, eval_task_create_data)

        mock_get_train_task_by_id.assert_called_once_with(mock_db_session, eval_task_create_data.train_task_id)
        mock_create_eval_task.assert_called_once()
        mock_db_session.refresh.assert_called_once_with(mock_eval_task)
        mock_send_eval_task_message.assert_called_once()
        mock_db_session.commit.assert_not_called()
        assert created_task is None

    # --- Test download_eval_task_result ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_eval_task.get_eval_task_by_id', new_callable=AsyncMock)
    # Corrected patch path for download_model_from_minio
    @patch('app.service.eval_task.download_model_from_minio', new_callable=AsyncMock)
    async def test_download_eval_task_result_success(self,
                                                     mock_download_model_from_minio,
                                                     mock_get_eval_task_by_id,
                                                     eval_task_service,
                                                     mock_db_session,
                                                     mock_user,
                                                     mock_eval_task):
        """测试成功下载评估任务结果"""
        mock_get_eval_task_by_id.return_value = mock_eval_task
        mock_download_model_from_minio.return_value = (True, "/tmp/eval_result.zip")

        file_path = await eval_task_service.download_eval_task_result(mock_eval_task.id, mock_user)

        mock_get_eval_task_by_id.assert_called_once_with(mock_db_session, mock_eval_task.id)
        mock_download_model_from_minio.assert_called_once_with(
            eval_task_id=mock_eval_task.id,
            user_id=mock_user.id
        )
        assert file_path == "/tmp/eval_result.zip"

    @pytest.mark.asyncio
    @patch('app.crud.crud_eval_task.get_eval_task_by_id', new_callable=AsyncMock)
    async def test_download_eval_task_result_not_found(self,
                                                       mock_get_eval_task_by_id,
                                                       eval_task_service,
                                                       mock_db_session,
                                                       mock_user):
        """测试下载时评估任务不存在"""
        mock_get_eval_task_by_id.return_value = None

        file_path = await eval_task_service.download_eval_task_result(999, mock_user)

        mock_get_eval_task_by_id.assert_called_once_with(mock_db_session, 999)
        assert file_path is None

    @pytest.mark.asyncio
    @patch('app.crud.crud_eval_task.get_eval_task_by_id', new_callable=AsyncMock)
    async def test_download_eval_task_result_unauthorized(self,
                                                          mock_get_eval_task_by_id,
                                                          eval_task_service,
                                                          mock_db_session,
                                                          mock_user,
                                                          mock_eval_task):
        """测试下载时用户无权限"""
        other_user_eval_task = MockEvalTask(
            id=2, train_task_id=102, eval_stage=1, owner_id=999, status=EvalTaskStatus.completed
        )
        mock_get_eval_task_by_id.return_value = other_user_eval_task

        file_path = await eval_task_service.download_eval_task_result(other_user_eval_task.id, mock_user)

        mock_get_eval_task_by_id.assert_called_once_with(mock_db_session, other_user_eval_task.id)
        assert file_path is None

    @pytest.mark.asyncio
    @patch('app.crud.crud_eval_task.get_eval_task_by_id', new_callable=AsyncMock)
    # Corrected patch path for download_model_from_minio
    @patch('app.service.eval_task.download_model_from_minio', new_callable=AsyncMock)
    async def test_download_eval_task_result_minio_fail(self,
                                                        mock_download_model_from_minio,
                                                        mock_get_eval_task_by_id,
                                                        eval_task_service,
                                                        mock_db_session,
                                                        mock_user,
                                                        mock_eval_task):
        """测试 MinIO 下载失败"""
        mock_get_eval_task_by_id.return_value = mock_eval_task
        mock_download_model_from_minio.return_value = (False, "MinIO error")

        file_path = await eval_task_service.download_eval_task_result(mock_eval_task.id, mock_user)

        mock_get_eval_task_by_id.assert_called_once_with(mock_db_session, mock_eval_task.id)
        mock_download_model_from_minio.assert_called_once()
        assert file_path is None

    # --- Test delete_eval_task_for_user ---
    # Removed patch for delete_eval_result_from_minio as it's not called in the provided service code
    @pytest.mark.asyncio
    @patch('app.crud.crud_eval_task.get_eval_task_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_eval_task.delete_eval_task', new_callable=AsyncMock)
    # Corrected patch path for get_minio_client if it were used for deletion in the service
    # However, since delete_eval_result_from_minio is not called, get_minio_client won't be called either.
    # We will remove this patch as well for now, to align with the provided service code.
    # If MinIO deletion is implemented in EvalTaskService, these patches should be added back.
    # @patch('app.service.eval_task.get_minio_client', new_callable=AsyncMock)
    async def test_delete_eval_task_for_user_success(self,
                                                      # mock_delete_eval_result_from_minio, # Removed
                                                      # mock_get_minio_client,             # Removed
                                                      mock_delete_eval_task,
                                                      mock_get_eval_task_by_id,
                                                      eval_task_service,
                                                      mock_db_session,
                                                      mock_user,
                                                      mock_eval_task):
        """测试成功删除用户评估任务"""
        mock_get_eval_task_by_id.return_value = mock_eval_task
        mock_delete_eval_task.return_value = True # Simulate CRUD layer deletion success
        
        # mock_get_minio_client.return_value = MagicMock() # Removed
        # mock_delete_eval_result_from_minio.return_value = (True, None) # Removed

        result = await eval_task_service.delete_eval_task_for_user(mock_eval_task.id, mock_user)

        mock_get_eval_task_by_id.assert_called_once_with(mock_db_session, mock_eval_task.id)
        mock_delete_eval_task.assert_called_once_with(mock_db_session, mock_eval_task.id)
        
        # Assert that MinIO related mocks were NOT called, as per the service code
        # mock_get_minio_client.assert_not_called()
        # mock_delete_eval_result_from_minio.assert_not_called()
        
        mock_db_session.commit.assert_called_once()
        mock_db_session.refresh.assert_called_once_with(mock_user)
        assert result is True

    @pytest.mark.asyncio
    @patch('app.crud.crud_eval_task.get_eval_task_by_id', new_callable=AsyncMock)
    async def test_delete_eval_task_for_user_not_found(self,
                                                        mock_get_eval_task_by_id,
                                                        eval_task_service,
                                                        mock_db_session,
                                                        mock_user):
        """测试删除不存在的评估任务"""
        mock_get_eval_task_by_id.return_value = None

        result = await eval_task_service.delete_eval_task_for_user(999, mock_user)

        mock_get_eval_task_by_id.assert_called_once_with(mock_db_session, 999)
        mock_db_session.commit.assert_not_called()
        assert result is False

    @pytest.mark.asyncio
    @patch('app.crud.crud_eval_task.get_eval_task_by_id', new_callable=AsyncMock)
    async def test_delete_eval_task_for_user_unauthorized(self,
                                                           mock_get_eval_task_by_id,
                                                           eval_task_service,
                                                           mock_db_session,
                                                           mock_user,
                                                           mock_eval_task):
        """测试用户无权限删除评估任务"""
        other_user_eval_task = MockEvalTask(
            id=2, train_task_id=102, eval_stage=1, owner_id=999, status=EvalTaskStatus.completed
        )
        mock_get_eval_task_by_id.return_value = other_user_eval_task

        result = await eval_task_service.delete_eval_task_for_user(other_user_eval_task.id, mock_user)

        mock_get_eval_task_by_id.assert_called_once_with(mock_db_session, other_user_eval_task.id)
        mock_db_session.commit.assert_not_called()
        assert result is False

    @pytest.mark.asyncio
    @patch('app.crud.crud_eval_task.get_eval_task_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_eval_task.delete_eval_task', new_callable=AsyncMock)
    # Removed MinIO related patches as they are not called in the service code for this path
    # @patch('app.service.eval_task.get_minio_client', new_callable=AsyncMock)
    # @patch('app.service.eval_task.delete_eval_result_from_minio', new_callable=AsyncMock)
    async def test_delete_eval_task_for_user_crud_fail(self,
                                                       # mock_delete_eval_result_from_minio, # Removed
                                                       # mock_get_minio_client,             # Removed
                                                       mock_delete_eval_task,
                                                       mock_get_eval_task_by_id,
                                                       eval_task_service,
                                                       mock_db_session,
                                                       mock_user,
                                                       mock_eval_task):
        """测试 CRUD 层删除失败的情况"""
        mock_get_eval_task_by_id.return_value = mock_eval_task
        mock_delete_eval_task.return_value = False # Simulate CRUD layer deletion failure

        result = await eval_task_service.delete_eval_task_for_user(mock_eval_task.id, mock_user)

        mock_get_eval_task_by_id.assert_called_once_with(mock_db_session, mock_eval_task.id)
        mock_delete_eval_task.assert_called_once_with(mock_db_session, mock_eval_task.id)
        # mock_get_minio_client.assert_not_called() # Removed
        # mock_delete_eval_result_from_minio.assert_not_called() # Removed
        mock_db_session.commit.assert_not_called()
        assert result is False

    # --- Test get_eval_task_by_id ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_eval_task.get_eval_task_by_id', new_callable=AsyncMock)
    async def test_get_eval_task_by_id_found(self,
                                               mock_get_eval_task_by_id,
                                               eval_task_service,
                                               mock_db_session,
                                               mock_eval_task):
        """测试根据 ID 获取评估任务（找到）"""
        mock_get_eval_task_by_id.return_value = mock_eval_task

        task = await eval_task_service.get_eval_task_by_id(mock_eval_task.id)

        mock_get_eval_task_by_id.assert_called_once_with(mock_db_session, mock_eval_task.id)
        assert task == mock_eval_task

    @pytest.mark.asyncio
    @patch('app.crud.crud_eval_task.get_eval_task_by_id', new_callable=AsyncMock)
    async def test_get_eval_task_by_id_not_found(self,
                                                   mock_get_eval_task_by_id,
                                                   eval_task_service,
                                                   mock_db_session):
        """测试根据 ID 获取评估任务（未找到）"""
        mock_get_eval_task_by_id.return_value = None

        task = await eval_task_service.get_eval_task_by_id(999)

        mock_get_eval_task_by_id.assert_called_once_with(mock_db_session, 999)
        assert task is None

    # --- Test get_eval_tasks_by_user ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_eval_task.get_eval_tasks_by_user_id', new_callable=AsyncMock)
    async def test_get_eval_tasks_by_user_found(self,
                                            mock_get_eval_tasks_by_user_id,
                                            eval_task_service,
                                            mock_db_session,
                                            mock_user,
                                            mock_eval_task):
        """测试获取用户所有评估任务（找到）"""
        mock_get_eval_tasks_by_user_id.return_value = [mock_eval_task]

        tasks = await eval_task_service.get_eval_tasks_by_user(mock_user.id)

        mock_get_eval_tasks_by_user_id.assert_called_once_with(mock_db_session, mock_user.id)
        assert len(tasks) == 1
        assert tasks[0] == mock_eval_task

    @pytest.mark.asyncio
    @patch('app.crud.crud_eval_task.get_eval_tasks_by_user_id', new_callable=AsyncMock)
    async def test_get_eval_tasks_by_user_empty(self,
                                           mock_get_eval_tasks_by_user_id,
                                           eval_task_service,
                                           mock_db_session,
                                           mock_user):
        """测试获取用户所有评估任务（空列表）"""
        mock_get_eval_tasks_by_user_id.return_value = []

        tasks = await eval_task_service.get_eval_tasks_by_user(mock_user.id)

        mock_get_eval_tasks_by_user_id.assert_called_once_with(mock_db_session, mock_user.id)
        assert len(tasks) == 0
        assert tasks == []

    # --- Test update_eval_task ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_eval_task.get_eval_task_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_eval_task.update_eval_task', new_callable=AsyncMock)
    async def test_update_eval_task_success(self,
                                             mock_crud_update_eval_task,
                                             mock_get_eval_task_by_id,
                                             eval_task_service,
                                             mock_db_session,
                                             mock_eval_task,
                                             eval_task_update_data):
        """测试成功更新评估任务"""
        mock_get_eval_task_by_id.return_value = mock_eval_task
        
        # Simulate the updated task object
        mock_updated_eval_task = MockEvalTask(
            id=mock_eval_task.id,
            train_task_id=mock_eval_task.train_task_id,
            eval_stage=mock_eval_task.eval_stage,
            owner_id=mock_eval_task.owner_id,
            status=eval_task_update_data.status,
            create_time=mock_eval_task.create_time,
            end_time=eval_task_update_data.end_time
        )
        mock_crud_update_eval_task.return_value = mock_updated_eval_task

        updated_task = await eval_task_service.update_eval_task(mock_eval_task.id, eval_task_update_data)

        mock_get_eval_task_by_id.assert_called_once_with(mock_db_session, mock_eval_task.id)
        mock_crud_update_eval_task.assert_called_once()
        
        # Check positional arguments for update_eval_task
        # Assuming crud_eval_task.update_eval_task signature is:
        # update_eval_task(db_session, eval_task_id, eval_task_update_schema)
        call_args, call_kwargs = mock_crud_update_eval_task.call_args
        
        # Verify positional arguments
        assert call_args[0] == mock_db_session
        assert call_args[1] == mock_eval_task.id
        # The EvalTaskUpdate object is likely passed as the third positional argument
        assert call_args[2] == eval_task_update_data # Direct comparison of Pydantic models works for equality

        # No keyword arguments are expected for the EvalTaskUpdate object itself
        assert not call_kwargs 


        mock_db_session.commit.assert_called_once()
        mock_db_session.refresh.assert_called_once_with(mock_updated_eval_task)
        assert updated_task == mock_updated_eval_task
        assert updated_task.status == eval_task_update_data.status
        assert updated_task.end_time == eval_task_update_data.end_time

    @pytest.mark.asyncio
    @patch('app.crud.crud_eval_task.get_eval_task_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_eval_task.update_eval_task', new_callable=AsyncMock)
    async def test_update_eval_task_not_found(self,
                                               mock_crud_update_eval_task,
                                               mock_get_eval_task_by_id,
                                               eval_task_service,
                                               mock_db_session,
                                               eval_task_update_data):
        """测试更新不存在的评估任务"""
        mock_get_eval_task_by_id.return_value = None

        updated_task = await eval_task_service.update_eval_task(999, eval_task_update_data)

        mock_get_eval_task_by_id.assert_called_once_with(mock_db_session, 999)
        mock_crud_update_eval_task.assert_not_called()
        mock_db_session.commit.assert_not_called()
        assert updated_task is None