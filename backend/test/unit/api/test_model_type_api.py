from typing import List, Optional
import unittest
from fastapi.testclient import TestClient
from fastapi import Response
import pytest
from app.main import app
from app.schemas.model_type import ModelTypeCreate, ModelTypePublic
from app.models.model_type import ModelType
from app.models.user import AppUser
from datetime import datetime, timezone
import json

# IMPORTANT: 导入实际的 get_current_user 和 get_train_task_service 函数
from app.api.endpoints.model_type import get_current_user, get_train_task_service
from app.core.deps import get_db

class MockModelTypeService:
    def __init__(self, model_types_data: List[ModelType]):
        self.model_types_data = model_types_data

    async def create_model_type(self, model_type_create: ModelTypeCreate) -> ModelType:
        """模拟创建模型类型的方法"""
        new_id = len(self.model_types_data) + 1
        new_model_type = ModelType(
            id=new_id,
            type_name=model_type_create.type_name,
            description=model_type_create.description,
        )
        self.model_types_data.append(new_model_type)
        return new_model_type

    async def get_all_model_types(self) -> List[ModelType]:
        """模拟获取所有模型类型的方法"""
        return self.model_types_data

@pytest.fixture
def override_get_db_dependency():
    """
    用于测试的夹具，覆盖 FastAPI 的 get_db 依赖项，返回一个模拟的 AsyncSession。
    这允许原始的 get_train_task_service 函数被调用，从而提高覆盖率。
    """
    mock_session = unittest.mock.MagicMock(spec=Optional[object])
    async def _override_get_db():
        yield mock_session
    app.dependency_overrides[get_db] = _override_get_db
    yield mock_session
    app.dependency_overrides.clear()

@pytest.fixture(scope="module")
def client():
    """
    Pytest fixture for the FastAPI TestClient.
    此客户端用于在测试期间向 FastAPI 应用程序发出请求。
    """
    return TestClient(app)

@pytest.fixture
def override_get_model_type_service_dependency():
    """
    用于测试的夹具，覆盖 FastAPI 的 get_train_task_service 依赖项，返回一个模拟的 ModelTypeService。
    """
    mock_model_types_list = [
        ModelType(
            id=1,
            type_name="Classifier",
            description="A classification model type.",
        ),
        ModelType(
            id=2,
            type_name="Regressor",
            description="A regression model type.",
        ),
    ]
    mock_service = MockModelTypeService(mock_model_types_list)

    async def _override_get_model_type_service():
        return mock_service

    # 覆盖实际的 get_train_task_service 依赖
    app.dependency_overrides[get_train_task_service] = _override_get_model_type_service
    yield mock_model_types_list # 传递模拟的模型类型列表，以便在测试中进行断言
    app.dependency_overrides.clear()

@pytest.fixture
def override_get_current_user_dependency():
    """
    用于测试的夹具，覆盖 FastAPI 的 get_current_user 依赖项。
    它用一个模拟非管理员用户替换实际依赖项，并在测试后进行清理。
    """
    test_user_data = AppUser(
        id=114514,
        is_admin=False,
        username="testuser",
        password_hash="hashed_password",
        created_at=datetime.now(timezone.utc),
        last_login=datetime.now(timezone.utc),
        owned_datasets=[],
        train_tasks=[],
    )
    async def _override_get_current_user():
        return test_user_data
    app.dependency_overrides[get_current_user] = _override_get_current_user
    yield test_user_data
    app.dependency_overrides.clear()

@pytest.fixture
def override_get_current_user_admin_dependency():
    """
    用于测试的夹具，覆盖 FastAPI 的 get_current_user 依赖项，返回一个管理员用户。
    """
    test_user_data = AppUser(
        id=1,
        is_admin=True, # 设置为管理员
        username="admin_testuser",
        password_hash="hashed_password",
        created_at=datetime.now(timezone.utc),
        last_login=datetime.now(timezone.utc),
        owned_datasets=[],
        train_tasks=[],
    )
    async def _override_get_current_user():
        return test_user_data
    app.dependency_overrides[get_current_user] = _override_get_current_user
    yield test_user_data
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_get_train_task_service(override_get_db_dependency):
    """
    测试 get_train_task_service 依赖项是否能正确返回 ModelTypeService 实例。
    """
    mts = await get_train_task_service(db=override_get_db_dependency)
    assert mts is not None
    
@pytest.mark.asyncio
async def test_create_model_type_success(client: TestClient, override_get_model_type_service_dependency: List[ModelType], override_get_current_user_admin_dependency: AppUser):
    """
    测试管理员用户成功创建模型类型。
    """
    model_type_data = {"type_name": "TestModel", "description": "Description for test model"}
    response: Response = client.post("/api/model_types/", json=model_type_data)
    assert response.status_code == 200
    response_json = response.json()
    assert response_json["type_name"] == "TestModel"
    assert response_json["description"] == "Description for test model"
    assert "id" in response_json
    
@pytest.mark.asyncio
async def test_create_model_type_forbidden(client: TestClient, override_get_model_type_service_dependency: List[ModelType], override_get_current_user_dependency: AppUser):
    """
    测试非管理员用户尝试创建模型类型时被拒绝。
    """
    model_type_data = {"type_name": "TestModel", "description": "Description for test model"}
    response: Response = client.post("/api/model_types/", json=model_type_data)
    assert response.status_code == 403
    assert response.json() == {"detail": "你不是管理员，无法创建模型类型。"}

@pytest.mark.asyncio
async def test_get_all_model_types(client: TestClient, override_get_model_type_service_dependency: List[ModelType]):
    """
    测试获取所有模型类型的接口。
    """
    response: Response = client.get("/api/model_types/")
    assert response.status_code == 200
    response_json = response.json()
    assert isinstance(response_json, list)
    assert len(response_json) == len(override_get_model_type_service_dependency)
    
    # 验证返回的模型类型数据
    for model_type in response_json:
        assert "id" in model_type
        assert "type_name" in model_type
        assert "description" in model_type