from typing import List, Optional
import unittest
from fastapi.testclient import TestClient
from fastapi import Response, status
import pytest
from unittest.mock import MagicMock, AsyncMock
from datetime import datetime, timezone, timedelta
import json

from app.main import app
from app.schemas.user import UserCreate, UserPublic
from app.models.user import AppUser
from app.core.deps import get_db
from app.core.security import Token # 导入 Token 模型
from app.core import security # 导入 security 模块本身
from app.service.user import UserService # 导入真实的 UserService 类，用于 spec
from app.core.config import settings # 导入 settings，用于 mock ACCESS_TOKEN_EXPIRE_MINUTES

# IMPORTANT: 导入实际的 get_user_service 函数
from app.api.endpoints.auth import get_user_service

# --- Pytest Fixtures ---

@pytest.fixture(scope="session", autouse=True)
def override_get_db_dependency():
    """覆盖 FastAPI 的 get_db 依赖项，返回一个模拟的 AsyncSession。"""
    mock_session = unittest.mock.MagicMock(spec=Optional[object])
    async def _override_get_db():
        yield mock_session
    app.dependency_overrides[get_db] = _override_get_db
    yield mock_session
    # 注意：session 范围的 fixture 不会在每个测试后清除，而是在整个 session 结束后清除

@pytest.fixture(scope="module")
def client():
    """
    Pytest fixture for the FastAPI TestClient.
    此客户端用于在测试期间向 FastAPI 应用程序发出请求。
    """
    return TestClient(app)

@pytest.fixture
def test_user_data() -> AppUser:
    """创建并返回一个模拟的 AppUser 对象，用于成功的用户创建和认证。"""
    return AppUser(
        id=1,
        username="testuser",
        password_hash=security.get_password_hash("testpassword"), # 使用实际的哈希函数
        is_admin=False,
        created_at=datetime.now(timezone.utc),
        last_login=datetime.now(timezone.utc),
        owned_datasets=[],
        train_tasks=[],
    )

@pytest.fixture(autouse=True)
def mock_dependencies(mocker, test_user_data: AppUser):
    """
    自动应用此 fixture，模拟 auth 路由所需的所有依赖项。
    包括 UserService 和 app.core.security 模块。
    """
    # --- Mock UserService ---
    mock_user_service = mocker.MagicMock(spec=UserService)

    async def mock_create_new_user(user_in: UserCreate) -> Optional[AppUser]:
        if user_in.username == "existinguser":
            return None # 模拟用户已存在
        # 模拟成功创建用户
        return AppUser(
            id=2, # 新用户的ID
            username=user_in.username,
            password_hash=security.get_password_hash(user_in.password),
            is_admin=user_in.is_admin,
            created_at=datetime.now(timezone.utc),
            last_login=datetime.now(timezone.utc),
            owned_datasets=[],
            train_tasks=[],
        )
    mock_user_service.create_new_user.side_effect = mock_create_new_user
    
    # 覆盖 FastAPI 的 get_user_service 依赖
    app.dependency_overrides[get_user_service] = lambda: mock_user_service

    # --- Mock app.core.security module ---
    mock_security_module = mocker.MagicMock(spec=security)

    async def mock_authenticate_user(db_session, username: str, password: str) -> Optional[AppUser]:
        if username == test_user_data.username and security.verify_password(password, test_user_data.password_hash):
            return test_user_data
        return None
    mock_security_module.authenticate_user.side_effect = mock_authenticate_user

    def mock_create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
        # 简单模拟一个 JWT 令牌
        return f"mock_access_token_for_{data['sub']}"
    mock_security_module.create_access_token.side_effect = mock_create_access_token

    # 覆盖 app.core.security 模块中的函数
    mocker.patch('app.core.security.authenticate_user', new=mock_security_module.authenticate_user)
    mocker.patch('app.core.security.create_access_token', new=mock_security_module.create_access_token)
    mocker.patch('app.core.security.verify_password', new=security.verify_password) # 保持真实密码验证
    mocker.patch('app.core.security.get_password_hash', new=security.get_password_hash) # 保持真实密码哈希

    # --- Mock settings.ACCESS_TOKEN_EXPIRE_MINUTES ---
    mocker.patch('app.core.config.settings.ACCESS_TOKEN_EXPIRE_MINUTES', 30) # 模拟过期时间为 30 分钟

    yield mock_user_service, mock_security_module # 允许测试访问这些 mock 对象
    app.dependency_overrides.clear() # 清理依赖覆盖

# --- Test Cases for /signup ---
@pytest.mark.asyncio
async def test_get_user_service(override_get_db_dependency):
    """
    测试 get_train_task_service 依赖项是否能正确返回 ModelTypeService 实例。
    """
    mts = await get_user_service(db=override_get_db_dependency)
    assert mts is not None
    

@pytest.mark.asyncio
async def test_signup_user_success(client: TestClient, mock_dependencies):
    """测试成功注册新用户。"""
    mock_user_service, _ = mock_dependencies
    user_data = {
        "username": "newuser",
        "password": "newpassword",
        "is_admin": False
    }
    response = client.post("/api/auth/signup", json=user_data)
    assert response.status_code == status.HTTP_201_CREATED
    response_json = response.json()
    assert response_json["username"] == "newuser"
    assert response_json["is_admin"] is False
    assert "id" in response_json
    assert "created_at" in response_json
    assert "last_login" in response_json
    assert "password_hash" not in response_json # 确保不返回密码哈希

    mock_user_service.create_new_user.assert_called_once()
    args, kwargs = mock_user_service.create_new_user.call_args
    assert isinstance(args[0], UserCreate)
    assert args[0].username == "newuser"

@pytest.mark.asyncio
async def test_signup_user_exists(client: TestClient, mock_dependencies):
    """测试注册已存在的用户名。"""
    mock_user_service, _ = mock_dependencies
    user_data = {
        "username": "existinguser", # 这个用户名在 mock_create_new_user 中被模拟为已存在
        "password": "somepassword",
        "is_admin": False
    }
    response = client.post("/api/auth/signup", json=user_data)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"detail": "具有此用户名的用户已存在。"}

    mock_user_service.create_new_user.assert_called_once()
    args, kwargs = mock_user_service.create_new_user.call_args
    assert isinstance(args[0], UserCreate)
    assert args[0].username == "existinguser"

# --- Test Cases for /token ---

@pytest.mark.asyncio
async def test_login_success(client: TestClient, mock_dependencies, test_user_data: AppUser):
    """测试用户成功登录并获取访问令牌。"""
    _, mock_security_module = mock_dependencies
    
    form_data = {
        "username": test_user_data.username,
        "password": "testpassword"
    }
    response = client.post("/api/auth/token", data=form_data)
    assert response.status_code == status.HTTP_200_OK
    response_json = response.json()
    assert "access_token" in response_json
    assert response_json["token_type"] == "bearer"
    assert response_json["access_token"] == f"mock_access_token_for_{test_user_data.username}"

    mock_security_module.authenticate_user.assert_called_once_with(
        unittest.mock.ANY, # db session
        test_user_data.username,
        "testpassword"
    )
    mock_security_module.create_access_token.assert_called_once()
    args, kwargs = mock_security_module.create_access_token.call_args
    assert kwargs["data"]["sub"] == test_user_data.username
    assert kwargs["expires_delta"].total_seconds() / 60 == 30 # 验证过期时间


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: TestClient, mock_dependencies):
    """测试使用无效凭据登录。"""
    _, mock_security_module = mock_dependencies
    
    form_data = {
        "username": "wronguser",
        "password": "wrongpassword"
    }
    response = client.post("/api/auth/token", data=form_data)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json() == {"detail": "Incorrect username or password"}
    assert "WWW-Authenticate" in response.headers
    assert response.headers["WWW-Authenticate"] == "Bearer"

    mock_security_module.authenticate_user.assert_called_once_with(
        unittest.mock.ANY,
        "wronguser",
        "wrongpassword"
    )
    mock_security_module.create_access_token.assert_not_called() # 认证失败，不应创建 token