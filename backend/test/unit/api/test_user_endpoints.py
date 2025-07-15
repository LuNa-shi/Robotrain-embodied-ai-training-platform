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
        is_admin=False,
        username="testuser",
        password_hash="hashed_password",
        created_at=datetime.now(timezone.utc),
        last_login=datetime.now(timezone.utc),
        owned_datasets=[],
        train_tasks=[],
    )

    # 定义将替换原始 get_current_user 的函数
    # 由于 get_current_user 是异步的，此覆盖函数也应是异步的或返回一个可等待对象。
    async def _override_get_current_user():
        return test_user_data

    # 在测试期间应用覆盖
    app.dependency_overrides[get_current_user] = _override_get_current_user

    # 将控制权交给测试函数。test_user_data 被 yield 出来，
    # 这样测试可以轻松访问用于断言的模拟数据。
    yield test_user_data

    # 在测试完成后（或失败后），清理覆盖
    # 清理覆盖非常重要，以防止干扰其他测试。
    app.dependency_overrides.clear() # 清除所有覆盖。如果只想清除特定覆盖，可以使用 del app.dependency_overrides[get_current_user]

@pytest.mark.asyncio
async def test_get_me_success(client: TestClient, override_get_current_user_dependency: AppUser):
    """
    成功获取当前用户信息的测试用例，使用模拟依赖项。
    """
    # `override_get_current_user_dependency` 夹具已经设置了覆盖，
    # 并 yield 了 `test_user_data`。我们可以直接使用这个 yield 出来的数据进行断言。
    mocked_user = override_get_current_user_dependency

    # 使用 TestClient 发出请求（同步调用）
    response: Response = client.get("/api/users/me")

    # 断言响应状态码
    assert response.status_code == 200

    # 断言响应 JSON 与模拟用户数据匹配
    # 使用 model_validate 将 mocked_user 转换为 UserPublic，
    # 然后使用 model_dump_json() 将其转换为 JSON 字符串，最后使用 json.loads() 解析为 Python 字典。
    # 这样可以确保日期时间字段以相同的 ISO 8601 字符串格式进行比较。
    assert response.json() == json.loads(UserPublic.model_validate(mocked_user).model_dump_json())

    # 这里不再需要对 mock_func 进行 assert_awaited_once()，
    # 因为我们是直接替换了依赖项，而不是修补对其的调用。
    # 当依赖被覆盖时，原始的 `get_current_user` 函数根本不会被执行。