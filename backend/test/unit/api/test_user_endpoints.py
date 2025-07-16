from fastapi.testclient import TestClient
from fastapi import Response, Depends # 导入 Depends
import pytest
from app.main import app
from app.schemas.user import UserPublic
from app.models.user import AppUser
from datetime import datetime, timezone
import json # 导入 json 模块

# IMPORTANT: 导入实际的 get_current_user 函数
from app.api.endpoints.user import get_current_user

@pytest.fixture(scope="module")
def client():
    """
    Pytest fixture for the FastAPI TestClient.
    此客户端用于在测试期间向 FastAPI 应用程序发出请求。
    """
    return TestClient(app)

@pytest.fixture
def override_get_current_user_dependency():
    """
    用于测试的夹具，覆盖 FastAPI 的 get_current_user 依赖项。
    它用一个模拟用户替换实际依赖项，并在测试后进行清理。
    """
    test_user_data = AppUser(
        id=114514,
        is_admin=True,
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

@pytest.mark.asyncio
async def test_get_me_success(client: TestClient, override_get_current_user_dependency: AppUser):
    """
    成功获取当前用户信息的测试用例，使用模拟依赖项。
    """
    mocked_user = override_get_current_user_dependency
    response: Response = client.get("/api/users/me")
    assert response.status_code == 200
    assert response.json() == json.loads(UserPublic.model_validate(mocked_user).model_dump_json())
    