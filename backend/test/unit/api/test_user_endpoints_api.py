from typing import List, Optional
import unittest
from fastapi.testclient import TestClient
from fastapi import Response
import pytest
from app.main import app
from app.schemas.user import UserPublic
from app.models.user import AppUser
from datetime import datetime, timezone
import json # 导入 json 模块

# IMPORTANT: 导入实际的 get_current_user 函数
from app.api.endpoints.user import get_current_user, get_user_service
from app.core.deps import get_db

class MockUserService:
    def __init__(self, users_data: List[AppUser]):
        self.users_data = users_data

    async def get_all_users(self) -> List[AppUser]:
        """模拟获取所有用户的方法"""
        return self.users_data

    async def get_user_by_username(self, username: str) -> Optional[AppUser]:
        """模拟根据用户名获取用户的方法"""
        for user in self.users_data:
            if user.username == username:
                return user
        return None

    async def delete_user_by_username(self, username: str) -> Optional[AppUser]:
        """模拟根据用户名删除用户的方法"""
        for user in self.users_data:
            if user.username == username:
                return user
        return None

@pytest.fixture
def override_get_db_dependency():
    """
    用于测试的夹具，覆盖 FastAPI 的 get_db 依赖项，返回一个模拟的 AsyncSession。
    这允许原始的 get_user_service 函数被调用，从而提高覆盖率。
    """
    mock_session = unittest.mock.MagicMock(spec=Optional[object]) # 使用 Optional[object] 或更具体的类型
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
def override_get_user_service_dependency():
    """
    用于测试的夹具，覆盖 FastAPI 的 get_user_service 依赖项，返回一个模拟的 UserService。
    """
    mock_users_list = [
        AppUser(
            id=1,
            is_admin=False,
            username="user1",
            password_hash="hash1",
            created_at=datetime.now(timezone.utc),
            last_login=datetime.now(timezone.utc),
            owned_datasets=[],
            train_tasks=[],
        ),
        AppUser(
            id=2,
            is_admin=True,
            username="admin_user_mock",
            password_hash="hash_admin",
            created_at=datetime.now(timezone.utc),
            last_login=datetime.now(timezone.utc),
            owned_datasets=[],
            train_tasks=[],
        ),
        AppUser(
            id=3,
            is_admin=False,
            username="user_to_delete",
            password_hash="hash_delete",
            created_at=datetime.now(timezone.utc),
            last_login=datetime.now(timezone.utc),
            owned_datasets=[],
            train_tasks=[],
        ),
    ]
    mock_service = MockUserService(mock_users_list)

    async def _override_get_user_service():
        return mock_service

    # 覆盖实际的 get_user_service 依赖
    app.dependency_overrides[get_user_service] = _override_get_user_service
    yield mock_users_list # 传递模拟的用户列表，以便在测试中进行断言
    app.dependency_overrides.clear()

@pytest.fixture
def override_get_current_user_dependency():
    """
    用于测试的夹具，覆盖 FastAPI 的 get_current_user 依赖项。
    它用一个模拟用户替换实际依赖项，并在测试后进行清理。
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
async def test_get_user_service(override_get_db_dependency):
    us = await get_user_service(db=override_get_db_dependency)
    assert us is not None
    
@pytest.mark.asyncio
async def test_get_me_success(client: TestClient, override_get_current_user_dependency: AppUser):
    """
    成功获取当前用户信息的测试用例，使用模拟依赖项。
    """
    mocked_user = override_get_current_user_dependency
    response: Response = client.get("/api/users/me")
    assert response.status_code == 200
    assert response.json() == json.loads(UserPublic.model_validate(mocked_user).model_dump_json())

@pytest.mark.asyncio
async def test_get_all_users_success(client: TestClient, override_get_user_service_dependency: List[AppUser], override_get_current_user_admin_dependency: AppUser):
    """
    成功获取所有用户信息的测试用例，使用模拟依赖项。
    """
    mocked_users = override_get_user_service_dependency
    response: Response = client.get("/api/users/")
    assert response.status_code == 200
    assert response.json() == [json.loads(UserPublic.model_validate(user).model_dump_json()) for user in mocked_users]
    
@pytest.mark.asyncio
async def test_get_all_users_forbidden(client: TestClient, override_get_user_service_dependency: List[AppUser], override_get_current_user_dependency: AppUser):
    """
    测试非管理员用户尝试获取所有用户信息时的403 Forbidden响应。
    """
    response: Response = client.get("/api/users/")
    assert response.status_code == 403
    assert response.json() == {"detail": "你不是管理员，无法访问此资源。"}
    
@pytest.mark.asyncio
async def test_get_user_by_username_success(client: TestClient, override_get_user_service_dependency: List[AppUser], override_get_current_user_admin_dependency: AppUser):
    """
    成功根据用户名获取用户信息的测试用例，使用模拟依赖项。
    """
    mocked_users = override_get_user_service_dependency
    username_to_test = mocked_users[0].username
    response: Response = client.get(f"/api/users/{username_to_test}")
    assert response.status_code == 200
    assert response.json() == json.loads(UserPublic.model_validate(mocked_users[0]).model_dump_json())
    
@pytest.mark.asyncio
async def test_get_user_by_username_not_found(client: TestClient, override_get_user_service_dependency: List[AppUser], override_get_current_user_admin_dependency: AppUser):
    """
    测试根据用户名获取用户信息时，用户不存在的情况。
    """
    non_existent_username = "nonexistent_user"
    response: Response = client.get(f"/api/users/{non_existent_username}")
    assert response.status_code == 404
    assert response.json() == {"detail": "用户未找到。"}
    
@pytest.mark.asyncio
async def test_get_user_by_username_forbidden(client: TestClient, override_get_user_service_dependency: List[AppUser], override_get_current_user_dependency: AppUser):
    """
    测试非管理员用户尝试根据用户名获取用户信息时的403 Forbidden响应。
    """
    username_to_test = override_get_user_service_dependency[0].username
    response: Response = client.get(f"/api/users/{username_to_test}")
    assert response.status_code == 403
    assert response.json() == {"detail": "你不是管理员，无法访问此资源。"}
    
@pytest.mark.asyncio
async def test_delete_user_by_username_success(client: TestClient, override_get_user_service_dependency: List[AppUser], override_get_current_user_admin_dependency: AppUser):
    """
    成功根据用户名删除用户的测试用例，使用模拟依赖项。
    """
    mocked_users = override_get_user_service_dependency
    username_to_delete = mocked_users[2].username
    response: Response = client.delete(f"/api/users/{username_to_delete}")
    assert response.status_code == 200
    assert response.json() == json.loads(UserPublic.model_validate(mocked_users[2]).model_dump_json())
    
@pytest.mark.asyncio
async def test_delete_user_by_username_not_found(client: TestClient, override_get_user_service_dependency: List[AppUser], override_get_current_user_admin_dependency: AppUser):
    """
    测试根据用户名删除用户时，用户不存在的情况。
    """
    non_existent_username = "nonexistent_user"
    response: Response = client.delete(f"/api/users/{non_existent_username}")
    assert response.status_code == 404
    assert response.json() == {"detail": "用户未找到。"}

@pytest.mark.asyncio
async def test_delete_user_by_username_forbidden_notadmin(client: TestClient, override_get_user_service_dependency: List[AppUser], override_get_current_user_dependency: AppUser):
    """
    测试非管理员用户尝试根据用户名删除用户时的403 Forbidden响应。
    """
    username_to_delete = override_get_user_service_dependency[0].username
    response: Response = client.delete(f"/api/users/{username_to_delete}")
    assert response.status_code == 403
    assert response.json() == {"detail": "你不是管理员，无法访问此资源。"}
    
@pytest.mark.asyncio
async def test_delete_user_by_username_forbidden_delete_admin(client: TestClient, override_get_user_service_dependency: List[AppUser], override_get_current_user_admin_dependency: AppUser):
    """
    测试管理员用户尝试删除管理员用户时的403 Forbidden响应。
    """
    admin_username = override_get_user_service_dependency[1].username
    response: Response = client.delete(f"/api/users/{admin_username}")
    assert response.status_code == 403
    assert response.json() == {"detail": "不能删除管理员用户。"}