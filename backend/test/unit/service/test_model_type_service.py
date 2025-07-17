import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone
from typing import Optional

# 导入要测试的 Service 类
from app.service.model_type import ModelTypeService

# 导入相关的模型和 Schema
from app.models.model_type import ModelType
from app.schemas.model_type import ModelTypeCreate, ModelTypeCreateDB, ModelTypeUpdate, ModelTypePublic

# --- 辅助 Mock 对象 ---
class MockModelType:
    """简化的 ModelType Mock 对象"""
    def __init__(self, id: int, type_name: str, description: Optional[str] = None):
        self.id = id
        self.type_name = type_name
        self.description = description
        self.created_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)

    def __eq__(self, other):
        if not isinstance(other, MockModelType):
            return NotImplemented
        return self.id == other.id and self.type_name == other.type_name

# --- Pytest Fixtures ---
@pytest.fixture
def mock_db_session():
    """为 ModelTypeService 提供一个 AsyncMock 类型的 db_session"""
    session = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.flush = AsyncMock()
    session.add = AsyncMock()
    session.delete = AsyncMock()
    session.exec = AsyncMock()
    session.get = AsyncMock(return_value=None)
    session.rollback = AsyncMock() # 保持有 rollback mock，只是测试时断言它不被调用
    return session

@pytest.fixture
def model_type_service(mock_db_session):
    """提供 ModelTypeService 实例"""
    return ModelTypeService(db_session=mock_db_session)

@pytest.fixture
def model_type_create_data():
    """提供 ModelTypeCreate 数据"""
    return ModelTypeCreate(
        type_name="TestModel",
        description="A test model type"
    )

@pytest.fixture
def mock_model_type():
    """提供一个 Mock 的 ModelType 实例"""
    return MockModelType(id=1, type_name="ExistingModel", description="An existing model type")

# --- 测试类 ---
class TestModelTypeService:

    # --- Test create_model_type ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_model_type.create_model_type', new_callable=AsyncMock)
    async def test_create_model_type_success(self,
                                             mock_crud_create_model_type,
                                             model_type_service,
                                             mock_db_session,
                                             model_type_create_data,
                                             mock_model_type):
        """
        测试成功创建模型类型。
        - 验证 CRUD 层 `create_model_type` 被正确调用。
        - 验证数据库会话的 `commit` 和 `refresh` 被调用。
        - 验证 Service 返回正确的模型类型对象。
        """
        mock_crud_create_model_type.return_value = mock_model_type

        created_model_type = await model_type_service.create_model_type(model_type_create_data)

        mock_crud_create_model_type.assert_called_once()
        call_kwargs = mock_crud_create_model_type.call_args.kwargs
        assert call_kwargs['db_session'] == mock_db_session
        assert isinstance(call_kwargs['model_type_create_db'], ModelTypeCreateDB)
        assert call_kwargs['model_type_create_db'].type_name == model_type_create_data.type_name
        assert call_kwargs['model_type_create_db'].description == model_type_create_data.description

        mock_db_session.commit.assert_called_once()
        mock_db_session.refresh.assert_called_once_with(mock_model_type)
        mock_db_session.rollback.assert_not_called() # 成功时不调用 rollback

        assert created_model_type == mock_model_type

    @pytest.mark.asyncio
    @patch('app.crud.crud_model_type.create_model_type', new_callable=AsyncMock)
    async def test_create_model_type_crud_fail(self,
                                                mock_crud_create_model_type,
                                                model_type_service,
                                                mock_db_session,
                                                model_type_create_data):
        """
        测试当 CRUD 层创建模型类型失败时 Service 的行为。
        - 模拟 CRUD 层返回 None。
        - 验证 Service 返回 None。
        - 验证数据库会话的 `commit` 和 `refresh` 未被调用。
        """
        mock_crud_create_model_type.return_value = None

        created_model_type = await model_type_service.create_model_type(model_type_create_data)

        mock_crud_create_model_type.assert_called_once()
        mock_db_session.commit.assert_not_called()
        mock_db_session.refresh.assert_not_called()
        mock_db_session.rollback.assert_not_called()
        assert created_model_type is None

    @pytest.mark.asyncio
    @patch('app.crud.crud_model_type.create_model_type', new_callable=AsyncMock)
    async def test_create_model_type_db_error(self,
                                               mock_crud_create_model_type,
                                               model_type_service,
                                               mock_db_session,
                                               model_type_create_data,
                                               mock_model_type):
        """
        测试当数据库操作（如 commit）发生异常时 Service 的行为。
        - 模拟 commit 抛出异常。
        - 验证 Service 不会捕获异常，而是直接抛出。
        - 验证 Service 未执行 `rollback`。
        """
        mock_crud_create_model_type.return_value = mock_model_type
        # 模拟 commit 抛出异常
        mock_db_session.commit.side_effect = Exception("Database error")
        
        # ***** 关键修改在这里 *****
        # 由于 Service 层不会捕获此异常，我们在这里使用 pytest.raises 来捕获它
        with pytest.raises(Exception) as excinfo:
            await model_type_service.create_model_type(model_type_create_data)
        
        # 验证抛出的异常信息
        assert str(excinfo.value) == "Database error"
        # ***********************

        mock_crud_create_model_type.assert_called_once()
        mock_db_session.commit.assert_called_once()
        mock_db_session.refresh.assert_not_called() # refresh 不应被调用，因为 commit 失败
        mock_db_session.rollback.assert_not_called() # 修正：Service 不会调用 rollback
        # created_model_type 不会被赋值，因为异常已在此处被捕获，所以不需要 assert created_model_type is None


    # --- Test get_all_model_types ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_model_type.get_all_model_types', new_callable=AsyncMock)
    async def test_get_all_model_types_success(self,
                                                 mock_crud_get_all_model_types,
                                                 model_type_service,
                                                 mock_db_session):
        """
        测试成功获取所有模型类型。
        - 验证 CRUD 层 `get_all_model_types` 被正确调用。
        - 验证 Service 返回的模型类型列表被正确转换为 ModelTypePublic 列表。
        """
        mock_db_model_types = [
            MockModelType(id=1, type_name="ModelA", description="Description A"),
            MockModelType(id=2, type_name="ModelB", description="Description B")
        ]
        mock_crud_get_all_model_types.return_value = mock_db_model_types

        model_types_public = await model_type_service.get_all_model_types()

        mock_crud_get_all_model_types.assert_called_once_with(db_session=mock_db_session)
        mock_db_session.rollback.assert_not_called()

        assert len(model_types_public) == 2
        assert isinstance(model_types_public[0], ModelTypePublic)
        assert model_types_public[0].id == 1
        assert model_types_public[0].type_name == "ModelA"
        assert model_types_public[0].description == "Description A"

        assert isinstance(model_types_public[1], ModelTypePublic)
        assert model_types_public[1].id == 2
        assert model_types_public[1].type_name == "ModelB"
        assert model_types_public[1].description == "Description B"

    @pytest.mark.asyncio
    @patch('app.crud.crud_model_type.get_all_model_types', new_callable=AsyncMock)
    async def test_get_all_model_types_empty(self,
                                              mock_crud_get_all_model_types,
                                              model_type_service,
                                              mock_db_session):
        """
        测试当没有模型类型时获取所有模型类型。
        - 验证 CRUD 层 `get_all_model_types` 被正确调用。
        - 验证 Service 返回一个空列表。
        """
        mock_crud_get_all_model_types.return_value = []

        model_types_public = await model_type_service.get_all_model_types()

        mock_crud_get_all_model_types.assert_called_once_with(db_session=mock_db_session)
        mock_db_session.rollback.assert_not_called()
        assert len(model_types_public) == 0
        assert model_types_public == []

    @pytest.mark.asyncio
    @patch('app.crud.crud_model_type.get_all_model_types', new_callable=AsyncMock)
    async def test_get_all_model_types_crud_error(self,
                                                   mock_crud_get_all_model_types,
                                                   model_type_service,
                                                   mock_db_session):
        """
        测试当 CRUD 层获取模型类型失败时 Service 的行为。
        - 模拟 CRUD 层抛出异常。
        - 验证 Service 返回一个空列表。
        - 验证 `rollback` 未被调用（因为 `get` 操作通常不需要事务回滚）。
        """
        mock_crud_get_all_model_types.side_effect = Exception("Database query error")

        model_types_public = await model_type_service.get_all_model_types()

        mock_crud_get_all_model_types.assert_called_once_with(db_session=mock_db_session)
        mock_db_session.rollback.assert_not_called()
        assert len(model_types_public) == 0
        assert model_types_public == []