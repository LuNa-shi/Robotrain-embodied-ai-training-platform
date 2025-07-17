from typing import List, Optional
import unittest
from fastapi.testclient import TestClient
from fastapi import Response, status
import pytest
from app.main import app # 确保 app 导入正确
from app.schemas.eval_task import EvalTaskCreate, EvalTaskPublic
from app.models.eval_task import EvalTask, EvalTaskStatus
from app.models.user import AppUser
from datetime import datetime, timezone
import json
import os
import asyncio
from uuid import UUID

# IMPORTANT: 导入实际的 get_current_user 和 get_train_task_service (用于 eval_task)
from app.api.endpoints.eval_task import get_current_user, get_train_task_service
from app.core.deps import get_db

# --- Mock Minio Utils Start ---
# 仍然定义这些模拟函数，但不再直接在模块级别赋值给 app.core.minio_utils
async def mock_get_minio_client_impl():
    class MockMinioClient:
        pass
    return MockMinioClient()

async def mock_get_sub_file_of_eval_task_dir_impl(eval_task_id: int, minio_client) -> Optional[List[str]]:
    if eval_task_id == 1:
        return ["video1.mp4", "video2.mp4"]
    elif eval_task_id == 2:
        return []
    return None

async def mock_download_eval_task_file_impl(minio_client, eval_task_id: int, video_name: str) -> Optional[str]:
    if eval_task_id == 1 and video_name == "video1.mp4":
        temp_file_path = f"/tmp/mock_eval_video_{eval_task_id}_{video_name}"
        with open(temp_file_path, "w") as f:
            f.write("mock video content for video1")
        return temp_file_path
    elif eval_task_id == 1 and video_name == "video2.mp4":
        temp_file_path = f"/tmp/mock_eval_video_{eval_task_id}_{video_name}"
        with open(temp_file_path, "w") as f:
            f.write("mock video content for video2")
        return temp_file_path
    return None
# --- Mock Minio Utils End ---


class MockEvalTaskService:
    def __init__(self, eval_tasks_data: List[EvalTask]):
        self.eval_tasks_data = eval_tasks_data
        self.downloaded_files = [] # 用于清理模拟下载的文件

    async def get_eval_tasks_by_user(self, user_id: int) -> List[EvalTask]:
        return [task for task in self.eval_tasks_data if task.owner_id == user_id]

    async def get_eval_task_by_id(self, eval_task_id: int) -> Optional[EvalTask]:
        for task in self.eval_tasks_data:
            if task.id == eval_task_id:
                return task
        return None

    async def create_eval_task_for_user(self, user: AppUser, eval_task_create: EvalTaskCreate) -> Optional[EvalTask]:
        new_id = len(self.eval_tasks_data) + 1
        new_task = EvalTask(
            id=new_id,
            owner_id=user.id,
            train_task_id=eval_task_create.train_task_id,
            eval_stage=eval_task_create.eval_stage,
            status=EvalTaskStatus.pending,
            create_time=datetime.now(timezone.utc),
            start_time=None,
            end_time=None,
        )
        self.eval_tasks_data.append(new_task)
        return new_task

    async def delete_eval_task_for_user(self, eval_task_id: int, user: AppUser) -> bool:
        initial_len = len(self.eval_tasks_data)
        self.eval_tasks_data = [task for task in self.eval_tasks_data if not (task.id == eval_task_id and task.owner_id == user.id)]
        return len(self.eval_tasks_data) < initial_len

@pytest.fixture
def override_get_db_dependency():
    mock_session = unittest.mock.MagicMock(spec=Optional[object])
    async def _override_get_db():
        yield mock_session
    app.dependency_overrides[get_db] = _override_get_db
    yield mock_session
    app.dependency_overrides.clear()

@pytest.fixture(scope="module")
def client():
    return TestClient(app)

@pytest.fixture(autouse=True)
def mock_minio_utils(mocker):
    # 假设 eval_task.py 是从 app.core.minio_utils 直接导入这些函数
    # 所以需要打补丁的路径是 app.api.endpoints.eval_task 模块内部的引用
    mocker.patch('app.api.endpoints.eval_task.get_minio_client', new=mock_get_minio_client_impl)
    mocker.patch('app.api.endpoints.eval_task.get_sub_file_of_eval_task_dir', new=mock_get_sub_file_of_eval_task_dir_impl)
    mocker.patch('app.api.endpoints.eval_task.download_eval_task_file', new=mock_download_eval_task_file_impl)


@pytest.fixture
def override_get_eval_task_service_dependency():
    mock_eval_tasks_list = [
        EvalTask(
            id=1,
            owner_id=1, # 属于 testuser
            train_task_id=101,
            eval_stage=1,
            status=EvalTaskStatus.pending,
            create_time=datetime.now(timezone.utc),
        ),
        EvalTask(
            id=2,
            owner_id=1, # 属于 testuser
            train_task_id=102,
            eval_stage=2,
            status=EvalTaskStatus.completed,
            create_time=datetime.now(timezone.utc),
            start_time=datetime.now(timezone.utc),
            end_time=datetime.now(timezone.utc),
        ),
        EvalTask(
            id=3,
            owner_id=999, # 不属于 testuser, 用于测试权限
            train_task_id=103,
            eval_stage=3,
            status=EvalTaskStatus.failed,
            create_time=datetime.now(timezone.utc),
            start_time=datetime.now(timezone.utc),
            end_time=datetime.now(timezone.utc),
        ),
    ]
    mock_service = MockEvalTaskService(mock_eval_tasks_list)

    async def _override_get_eval_task_service():
        return mock_service

    app.dependency_overrides[get_train_task_service] = _override_get_eval_task_service
    yield mock_service, mock_eval_tasks_list
    app.dependency_overrides.clear()
    # 清理下载的临时文件 (这部分逻辑可以保留在 MockEvalTaskService 中处理)
    for path in mock_service.downloaded_files:
        if os.path.exists(path):
            os.remove(path)


@pytest.fixture
def override_get_current_user_dependency():
    test_user_data = AppUser(
        id=1, # 与 mock_eval_tasks_list 中的 owner_id 对应
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


@pytest.mark.asyncio
async def test_get_eval_task_service(override_get_db_dependency):
    """
    测试 get_train_task_service (eval_task 的服务) 依赖项是否能正确返回 EvalTaskService 实例。
    """
    ets = await get_train_task_service(db=override_get_db_dependency)
    assert ets is not None

@pytest.mark.asyncio
async def test_get_my_eval_tasks_success(client: TestClient, override_get_eval_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    成功获取当前用户所有评估任务的测试用例。
    """
    mock_service, mocked_tasks = override_get_eval_task_service_dependency
    current_user = override_get_current_user_dependency
    
    response: Response = client.get("/api/eval_tasks/me")
    assert response.status_code == 200
    
    expected_tasks = [task for task in mocked_tasks if task.owner_id == current_user.id]
    # 需要手动将 EvalTask 转换为 EvalTaskPublic 以匹配响应模型
    expected_public_tasks = [
        EvalTaskPublic(
            id=task.id,
            owner_id=task.owner_id,
            train_task_id=task.train_task_id,
            eval_stage=task.eval_stage,
            status=task.status,
            create_time=task.create_time,
            start_time=task.start_time,
            end_time=task.end_time,
            video_names=None # 对于此 endpoint，video_names 不会被填充
        ) for task in expected_tasks
    ]
    assert response.json() == [json.loads(task.model_dump_json()) for task in expected_public_tasks]

@pytest.mark.asyncio
async def test_get_my_eval_tasks_empty(client: TestClient, override_get_current_user_dependency: AppUser):
    """
    测试当用户没有评估任务时，返回空列表。
    """
    # 覆盖 get_train_task_service 依赖，使其返回一个空的 mock_service
    mock_service = MockEvalTaskService([])
    async def _override_get_empty_eval_task_service():
        return mock_service
    app.dependency_overrides[get_train_task_service] = _override_get_empty_eval_task_service

    response: Response = client.get("/api/eval_tasks/me")
    assert response.status_code == 200
    assert response.json() == []
    app.dependency_overrides.clear()
    
    
@pytest.mark.asyncio
async def test_get_eval_task_success_with_videos(client: TestClient, override_get_eval_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    成功获取指定评估任务详情（包含视频列表）的测试用例。
    """
    mock_service, mocked_tasks = override_get_eval_task_service_dependency
    current_user = override_get_current_user_dependency

    # 获取一个有模拟视频的任务ID (id=1)
    eval_task_id = 1
    expected_task = next(task for task in mocked_tasks if task.id == eval_task_id)

    response: Response = client.get(f"/api/eval_tasks/{eval_task_id}")
    assert response.status_code == 200
    response_json = response.json()

    # 验证基本信息
    assert response_json["id"] == expected_task.id
    assert response_json["owner_id"] == expected_task.owner_id
    assert response_json["train_task_id"] == expected_task.train_task_id
    assert response_json["eval_stage"] == expected_task.eval_stage
    assert response_json["status"] == expected_task.status.value
    # 验证视频列表
    assert response_json["video_names"] == ["video1.mp4", "video2.mp4"]

@pytest.mark.asyncio
async def test_get_eval_task_success_no_videos(client: TestClient, override_get_eval_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    成功获取指定评估任务详情（无视频列表）的测试用例。
    """
    mock_service, mocked_tasks = override_get_eval_task_service_dependency
    current_user = override_get_current_user_dependency

    # 获取一个没有模拟视频的任务ID (id=2)
    eval_task_id = 2
    expected_task = next(task for task in mocked_tasks if task.id == eval_task_id)

    response: Response = client.get(f"/api/eval_tasks/{eval_task_id}")
    assert response.status_code == 200
    response_json = response.json()

    # 验证基本信息
    assert response_json["id"] == expected_task.id
    assert response_json["owner_id"] == expected_task.owner_id
    assert response_json["train_task_id"] == expected_task.train_task_id
    assert response_json["eval_stage"] == expected_task.eval_stage
    assert response_json["status"] == expected_task.status.value
    # 验证视频列表为 None 或空列表
    assert response_json["video_names"] == [] # mock_get_sub_file_of_eval_task_dir 返回 []

@pytest.mark.asyncio
async def test_get_eval_task_not_found(client: TestClient, override_get_eval_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    测试获取不存在的评估任务时返回 404 Not Found。
    """
    eval_task_id = 99999 # 不存在的ID
    response: Response = client.get(f"/api/eval_tasks/{eval_task_id}")
    assert response.status_code == 404
    assert response.json() == {"detail": "评估任务不存在"}

# 注意：get_eval_task 接口没有 owner_id 检查，这意味着任何登录用户都可以获取任何任务详情
# 考虑到 AppUser 的设计，这可能是一个设计选择。如果需要权限检查，请在 API 中添加。
# 目前的 API 设计中，只要任务存在，就会返回。

@pytest.mark.asyncio
async def test_download_eval_task_video_success(client: TestClient, override_get_eval_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    成功下载评估任务视频的测试用例。
    """
    mock_service, _ = override_get_eval_task_service_dependency
    eval_task_id = 1
    video_name = "video1.mp4"

    response: Response = client.get(f"/api/eval_tasks/{eval_task_id}/{video_name}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert response.headers["content-disposition"] == f'attachment; filename="{video_name}"'
    assert response.content == b"mock video content for video1"
    # 确保文件被记录以便清理
    mock_service.downloaded_files.append(f"/tmp/mock_eval_video_{eval_task_id}_{video_name}")


@pytest.mark.asyncio
async def test_download_eval_task_video_not_found(client: TestClient, override_get_eval_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    测试下载不存在的评估任务视频时返回 404 Not Found。
    """
    eval_task_id = 1
    video_name = "non_existent_video.mp4" # 模拟不存在的视频
    response: Response = client.get(f"/api/eval_tasks/{eval_task_id}/{video_name}")
    assert response.status_code == 404
    assert response.json() == {"detail": "评估任务或视频文件不存在"}

@pytest.mark.asyncio
async def test_download_eval_task_video_task_not_found(client: TestClient, override_get_eval_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    测试下载不存在的评估任务下的视频时返回 404 Not Found。
    """
    eval_task_id = 99999 # 不存在的评估任务ID
    video_name = "any_video.mp4"
    response: Response = client.get(f"/api/eval_tasks/{eval_task_id}/{video_name}")
    assert response.status_code == 404
    assert response.json() == {"detail": "评估任务或视频文件不存在"}
    
@pytest.mark.asyncio
async def test_create_eval_task_success(client: TestClient, override_get_eval_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    成功创建评估任务的测试用例。
    """
    mock_service, _ = override_get_eval_task_service_dependency
    current_user = override_get_current_user_dependency

    eval_task_data = {
        "train_task_id": 123,
        "eval_stage": 1
    }
    response: Response = client.post("/api/eval_tasks/", json=eval_task_data)
    assert response.status_code == 200
    response_json = response.json()
    assert response_json["owner_id"] == current_user.id
    assert response_json["train_task_id"] == 123
    assert response_json["eval_stage"] == 1
    assert response_json["status"] == "pending"
    assert "id" in response_json
    assert "create_time" in response_json

@pytest.mark.asyncio
async def test_create_eval_task_failure_service(client: TestClient, override_get_current_user_dependency: AppUser):
    """
    测试当 eval_task_service.create_eval_task_for_user 返回 None 时的失败情况。
    """
    class MockEvalTaskServiceFail:
        async def create_eval_task_for_user(self, user: AppUser, eval_task_create: EvalTaskCreate) -> Optional[EvalTask]:
            return None # 模拟创建失败

    app.dependency_overrides[get_train_task_service] = lambda: MockEvalTaskServiceFail() # 这里的 get_train_task_service 是指向 EvalTaskService 的别名
    
    eval_task_data = {
        "train_task_id": 123,
        "eval_stage": 1
    }
    response: Response = client.post("/api/eval_tasks/", json=eval_task_data)
    assert response.status_code == 400
    assert response.json() == {"detail": "创建评估任务失败"}
    app.dependency_overrides.clear()
    
@pytest.mark.asyncio
async def test_delete_eval_task_success(client: TestClient, override_get_eval_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    成功删除评估任务的测试用例。
    """
    mock_service, mocked_tasks = override_get_eval_task_service_dependency
    current_user = override_get_current_user_dependency

    # 找到一个属于当前用户的任务ID
    eval_task_to_delete_id = 1
    
    response: Response = client.delete(f"/api/eval_tasks/{eval_task_to_delete_id}")
    assert response.status_code == 200 # 保持 200
    assert response.json() is None # 断言 JSON 内容为 null
    
    # 验证任务是否从模拟服务中被“删除”
    assert await mock_service.get_eval_task_by_id(eval_task_to_delete_id) is None

@pytest.mark.asyncio
async def test_delete_eval_task_not_found_or_forbidden(client: TestClient, override_get_eval_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    测试删除不存在或不属于当前用户的评估任务时返回 404 Not Found。
    """
    mock_service, mocked_tasks = override_get_eval_task_service_dependency
    current_user = override_get_current_user_dependency

    # 情况1: 不存在的任务ID
    eval_task_id_not_found = 99999
    response: Response = client.delete(f"/api/eval_tasks/{eval_task_id_not_found}")
    assert response.status_code == 404
    assert response.json() == {"detail": "评估任务不存在或无法删除"}

    # 情况2: 存在的任务但不属于当前用户
    eval_task_id_forbidden = next(task.id for task in mocked_tasks if task.owner_id != current_user.id)
    response: Response = client.delete(f"/api/eval_tasks/{eval_task_id_forbidden}")
    assert response.status_code == 404 # 接口逻辑中，非拥有者删除也返回 404
    assert response.json() == {"detail": "评估任务不存在或无法删除"}
    
