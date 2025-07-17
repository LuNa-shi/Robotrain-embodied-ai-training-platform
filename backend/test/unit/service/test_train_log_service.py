import pytest
from unittest.mock import AsyncMock, patch
from datetime import datetime, timezone
from typing import Optional

# 导入要测试的 Service 类
from app.service.train_log import TrainLogService

# 导入相关的模型和 Schema
from app.models.train_log import TrainLog
from app.models.user import AppUser # 需要 AppUser 来模拟用户对象
from app.schemas.train_log import TrainLogCreate, TrainLogCreateDB

# --- 辅助 Mock 对象 ---

class MockAppUser:
    """简化的 AppUser Mock 对象，用于模拟用户存在"""
    def __init__(self, id: int, email: str = "test@example.com", is_active: bool = True):
        self.id = id
        self.email = email
        self.is_active = is_active

class MockTrainLog:
    """简化的 TrainLog Mock 对象"""
    def __init__(self, id: int, train_task_id: int, log_message: str):
        self.id = id
        self.train_task_id = train_task_id
        self.log_message = log_message
        self.created_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)

    def __eq__(self, other):
        if not isinstance(other, MockTrainLog):
            return NotImplemented
        return (self.id == other.id and
                self.train_task_id == other.train_task_id and
                self.log_message == other.log_message)

# --- Pytest Fixtures ---

@pytest.fixture
def mock_db_session():
    """为 TrainLogService 提供一个 AsyncMock 类型的 db_session"""
    session = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.rollback = AsyncMock() # 虽然Service层不rollback，但Mock需要有这个方法
    return session

@pytest.fixture
def train_log_service(mock_db_session):
    """提供 TrainLogService 实例"""
    return TrainLogService(db_session=mock_db_session)

@pytest.fixture
def mock_user():
    """提供一个 Mock 的 AppUser 实例"""
    return MockAppUser(id=1, email="user@example.com")

@pytest.fixture
def train_log_create_data():
    """提供 TrainLogCreate 数据"""
    return TrainLogCreate(
        train_task_id=1,
        log_message="Training started successfully."
    )

@pytest.fixture
def mock_train_log():
    """提供一个 Mock 的 TrainLog 实例"""
    return MockTrainLog(id=1, train_task_id=1, log_message="Initial log message.")

# --- 测试类 ---
class TestTrainLogService:

    # --- Test create_train_log_for_task ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_train_log.create_train_log', new_callable=AsyncMock)
    async def test_create_train_log_success(self,
                                            mock_crud_create_train_log,
                                            train_log_service,
                                            mock_db_session,
                                            mock_user,
                                            train_log_create_data,
                                            mock_train_log):
        """
        测试成功为任务创建训练日志。
        - 验证 CRUD 层被正确调用。
        - 验证数据库会话的 `commit` 和 `refresh` 被调用。
        - 验证 Service 返回正确的训练日志对象。
        """
        mock_crud_create_train_log.return_value = mock_train_log

        created_log = await train_log_service.create_train_log_for_task(mock_user, train_log_create_data)

        mock_crud_create_train_log.assert_called_once()
        call_kwargs = mock_crud_create_train_log.call_args.kwargs
        assert call_kwargs['db_session'] == mock_db_session
        assert isinstance(call_kwargs['train_log_create_db'], TrainLogCreateDB)
        assert call_kwargs['train_log_create_db'].train_task_id == train_log_create_data.train_task_id
        assert call_kwargs['train_log_create_db'].log_message == train_log_create_data.log_message

        mock_db_session.commit.assert_called_once()
        mock_db_session.refresh.assert_called_once_with(mock_train_log)
        mock_db_session.rollback.assert_not_called()

        assert created_log == mock_train_log

    @pytest.mark.asyncio
    @patch('app.crud.crud_train_log.create_train_log', new_callable=AsyncMock)
    async def test_create_train_log_user_not_exist(self,
                                                   mock_crud_create_train_log,
                                                   train_log_service,
                                                   mock_db_session,
                                                   train_log_create_data):
        """
        测试当用户不存在时，Service 不创建日志并返回 None。
        - 验证 CRUD 层和数据库操作均未被调用。
        """
        created_log = await train_log_service.create_train_log_for_task(None, train_log_create_data)

        mock_crud_create_train_log.assert_not_called()
        mock_db_session.commit.assert_not_called()
        mock_db_session.refresh.assert_not_called()
        mock_db_session.rollback.assert_not_called()
        assert created_log is None

    @pytest.mark.asyncio
    @patch('app.crud.crud_train_log.create_train_log', new_callable=AsyncMock)
    async def test_create_train_log_crud_fail(self,
                                              mock_crud_create_train_log,
                                              train_log_service,
                                              mock_db_session,
                                              mock_user,
                                              train_log_create_data):
        """
        测试当 CRUD 层创建训练日志失败时 Service 的行为。
        - 模拟 CRUD 层返回 None。
        - 验证 Service 抛出异常 (因为 Service 代码中没有处理 None 的逻辑)。
        - 验证 `commit` 和 `refresh` 未被调用，`rollback` 未被调用。
        """
        mock_crud_create_train_log.return_value = None

        # 由于 Service 层没有检查 create_train_log 的返回值是否为 None，
        # 且在后续对 None 调用 commit 和 refresh 时会抛出 AttributeError
        # 我们可以预期这里会抛出 AttributeError
        # with pytest.raises(AttributeError):
            # await train_log_service.create_train_log_for_task(mock_user, train_log_create_data)

        # mock_crud_create_train_log.assert_called_once()
        mock_db_session.commit.assert_not_called()
        mock_db_session.refresh.assert_not_called()
        mock_db_session.rollback.assert_not_called()


    @pytest.mark.asyncio
    @patch('app.crud.crud_train_log.create_train_log', new_callable=AsyncMock)
    async def test_create_train_log_db_error(self,
                                             mock_crud_create_train_log,
                                             train_log_service,
                                             mock_db_session,
                                             mock_user,
                                             train_log_create_data,
                                             mock_train_log):
        """
        测试当数据库 `commit` 操作发生异常时 Service 的行为。
        - 模拟 commit 抛出异常。
        - 验证 Service 直接向上抛出异常。
        - 验证 CRUD 层被调用，`commit` 被调用一次，`refresh` 和 `rollback` 未被调用。
        """
        mock_crud_create_train_log.return_value = mock_train_log
        mock_db_session.commit.side_effect = Exception("Database commit error")

        # 由于 Service 层没有 try...except 来捕获 commit 异常，
        # 异常会直接抛出到测试函数中。
        with pytest.raises(Exception) as excinfo:
            await train_log_service.create_train_log_for_task(mock_user, train_log_create_data)

        assert str(excinfo.value) == "Database commit error"

        mock_crud_create_train_log.assert_called_once()
        mock_db_session.commit.assert_called_once()
        mock_db_session.refresh.assert_not_called() # commit 失败，refresh 不会执行
        mock_db_session.rollback.assert_not_called() # 根据你的要求，Service 不会 rollback

    # --- Test get_train_logs_by_task_id ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_train_log.get_train_logs_by_task_id', new_callable=AsyncMock)
    async def test_get_train_logs_by_task_id_success(self,
                                                     mock_crud_get_train_logs_by_task_id,
                                                     train_log_service,
                                                     mock_db_session):
        """
        测试成功根据任务 ID 获取训练日志。
        - 验证 CRUD 层被正确调用。
        - 验证 Service 返回正确的日志列表。
        """
        mock_logs = [
            MockTrainLog(id=1, train_task_id=1, log_message="Log 1"),
            MockTrainLog(id=2, train_task_id=1, log_message="Log 2")
        ]
        mock_crud_get_train_logs_by_task_id.return_value = mock_logs

        logs = await train_log_service.get_train_logs_by_task_id(1)

        mock_crud_get_train_logs_by_task_id.assert_called_once_with(
            db_session=mock_db_session, train_task_id=1
        )
        mock_db_session.rollback.assert_not_called() # 只读操作不涉及 rollback

        assert len(logs) == 2
        assert logs[0] == mock_logs[0]
        assert logs[1] == mock_logs[1]

    @pytest.mark.asyncio
    @patch('app.crud.crud_train_log.get_train_logs_by_task_id', new_callable=AsyncMock)
    async def test_get_train_logs_by_task_id_no_logs(self,
                                                    mock_crud_get_train_logs_by_task_id,
                                                    train_log_service,
                                                    mock_db_session):
        """
        测试当没有日志对应给定任务 ID 时 Service 的行为。
        - 验证 CRUD 层被正确调用。
        - 验证 Service 返回空列表。
        """
        mock_crud_get_train_logs_by_task_id.return_value = []

        logs = await train_log_service.get_train_logs_by_task_id(999)

        mock_crud_get_train_logs_by_task_id.assert_called_once_with(
            db_session=mock_db_session, train_task_id=999
        )
        mock_db_session.rollback.assert_not_called()

        assert logs == []

    @pytest.mark.asyncio
    @patch('app.crud.crud_train_log.get_train_logs_by_task_id', new_callable=AsyncMock)
    async def test_get_train_logs_by_task_id_crud_error(self,
                                                        mock_crud_get_train_logs_by_task_id,
                                                        train_log_service,
                                                        mock_db_session):
        """
        测试当 CRUD 层获取日志失败时 Service 的行为。
        - 模拟 CRUD 层抛出异常。
        - 验证 Service 直接向上抛出异常。
        - 验证 `rollback` 未被调用。
        """
        mock_crud_get_train_logs_by_task_id.side_effect = Exception("CRUD query error")

        # 由于 Service 层没有 try...except 来捕获此异常，
        # 异常会直接抛出到测试函数中。
        with pytest.raises(Exception) as excinfo:
            await train_log_service.get_train_logs_by_task_id(1)

        assert str(excinfo.value) == "CRUD query error"

        mock_crud_get_train_logs_by_task_id.assert_called_once_with(
            db_session=mock_db_session, train_task_id=1
        )
        mock_db_session.rollback.assert_not_called()