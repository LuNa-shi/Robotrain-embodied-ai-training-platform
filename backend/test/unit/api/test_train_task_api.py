from typing import List, Optional
import unittest
from fastapi.testclient import TestClient
from fastapi import Response
import pytest
from app.main import app
from app.schemas.train_task import TrainTaskCreate, TrainTaskPublic
from app.models.train_task import TrainTask, TrainTaskStatus
from app.models.user import AppUser
from datetime import datetime, timezone
import json
import os
from uuid import UUID, uuid4

# IMPORTANT: 导入实际的 get_current_user 和 get_train_task_service 函数
from app.api.endpoints.train_task import get_current_user, get_train_task_service
from app.core.deps import get_db

class MockTrainTaskService:
    def __init__(self, train_tasks_data: List[TrainTask]):
        self.train_tasks_data = train_tasks_data
        self.downloaded_files = {} # 用于模拟下载的文件路径

    async def get_tasks_by_user(self, user_id: int) -> List[TrainTask]:
        """模拟根据用户ID获取所有训练任务的方法"""
        return [task for task in self.train_tasks_data if task.owner_id == user_id]

    async def get_completed_tasks_by_user(self, user_id: int) -> List[TrainTask]:
        """模拟根据用户ID获取已完成训练任务的方法"""
        return [task for task in self.train_tasks_data if task.owner_id == user_id and task.status == TrainTaskStatus.completed]

    async def create_train_task_for_user(self, user: AppUser, train_task_create: TrainTaskCreate) -> Optional[TrainTask]:
        """模拟为用户创建训练任务的方法"""
        new_id = len(self.train_tasks_data) + 1
        new_task = TrainTask(
            id=new_id,
            owner_id=user.id,
            dataset_id=train_task_create.dataset_id,
            model_type_id=train_task_create.model_type_id,
            hyperparameter=train_task_create.hyperparameter,
            status=TrainTaskStatus.pending,
            create_time=datetime.now(timezone.utc),
            logs_uuid=UUID("a1b2c3d4-e5f6-7890-1234-567890abcdef") # 示例 UUID
        )
        self.train_tasks_data.append(new_task)
        return new_task

    async def get_train_task_by_id(self, task_id: int) -> Optional[TrainTask]:
        """模拟根据任务ID获取训练任务的方法"""
        for task in self.train_tasks_data:
            if task.id == task_id:
                return task
        return None

    async def download_model(self, task_id: int) -> Optional[str]:
        """模拟下载模型文件的方法"""
        task = await self.get_train_task_by_id(task_id)
        if task and task.status == TrainTaskStatus.completed:
            # 模拟创建一个临时文件
            temp_file_path = f"/tmp/mock_model_{task_id}.zip"
            with open(temp_file_path, "w") as f:
                f.write("mock model content")
            self.downloaded_files[task_id] = temp_file_path
            return temp_file_path
        return None

    async def delete_train_task_for_user(self, task_id: int, user: AppUser) -> bool:
        """模拟为用户删除训练任务的方法"""
        initial_len = len(self.train_tasks_data)
        self.train_tasks_data = [task for task in self.train_tasks_data if not (task.id == task_id and task.owner_id == user.id)]
        return len(self.train_tasks_data) < initial_len

@pytest.fixture
def override_get_db_dependency():
    """
    用于测试的夹具，覆盖 FastAPI 的 get_db 依赖项，返回一个模拟的 AsyncSession。
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
def override_get_train_task_service_dependency():
    """
    用于测试的夹具，覆盖 FastAPI 的 get_train_task_service 依赖项，返回一个模拟的 TrainTaskService。
    """
    mock_tasks_list = [
        TrainTask(
            id=1,
            owner_id=1, # 属于 testuser
            dataset_id=101,
            model_type_id=201,
            hyperparameter={"epochs": 10, "lr": 0.01},
            status=TrainTaskStatus.pending,
            create_time=datetime.now(timezone.utc),
            logs_uuid=UUID("a1b2c3d4-e5f6-7890-1234-567890abcdef")
        ),
        TrainTask(
            id=2,
            owner_id=1, # 属于 testuser
            dataset_id=102,
            model_type_id=202,
            hyperparameter={"epochs": 5, "lr": 0.001},
            status=TrainTaskStatus.completed,
            create_time=datetime.now(timezone.utc),
            start_time=datetime.now(timezone.utc),
            end_time=datetime.now(timezone.utc),
            logs_uuid=UUID("b2c3d4e5-f6a7-8901-2345-67890abcdef0")
        ),
        TrainTask(
            id=3,
            owner_id=999, # 不属于 testuser, 用于测试权限
            dataset_id=103,
            model_type_id=203,
            hyperparameter={"epochs": 20, "lr": 0.005},
            status=TrainTaskStatus.failed,
            create_time=datetime.now(timezone.utc),
            start_time=datetime.now(timezone.utc),
            end_time=datetime.now(timezone.utc),
            logs_uuid=UUID("c3d4e5f6-a7b8-9012-3456-7890abcdef01")
        ),
    ]
    mock_service = MockTrainTaskService(mock_tasks_list)

    async def _override_get_train_task_service():
        return mock_service

    app.dependency_overrides[get_train_task_service] = _override_get_train_task_service
    yield mock_service, mock_tasks_list # 传递模拟服务和模拟任务列表，以便在测试中进行断言
    app.dependency_overrides.clear()
    # 清理下载的临时文件
    for _, path in mock_service.downloaded_files.items():
        if os.path.exists(path):
            os.remove(path)


@pytest.fixture
def override_get_current_user_dependency():
    """
    用于测试的夹具，覆盖 FastAPI 的 get_current_user 依赖项。
    它用一个模拟用户替换实际依赖项，并在测试后进行清理。
    """
    test_user_data = AppUser(
        id=1, # 与 mock_tasks_list 中的 owner_id 对应
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
async def test_get_train_task_service(override_get_db_dependency):
    """
    测试 get_train_task_service 依赖项是否能正确返回 TrainTaskService 实例。
    """
    tts = await get_train_task_service(db=override_get_db_dependency)
    assert tts is not None
    
@pytest.mark.asyncio
async def test_get_my_train_tasks_success(client: TestClient, override_get_train_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    成功获取当前用户所有训练任务的测试用例。
    """
    mock_service, mocked_tasks = override_get_train_task_service_dependency
    current_user = override_get_current_user_dependency
    
    response: Response = client.get("/api/train_tasks/me")
    assert response.status_code == 200
    
    expected_tasks = [task for task in mocked_tasks if task.owner_id == current_user.id]
    assert response.json() == [json.loads(TrainTaskPublic.model_validate(task).model_dump_json()) for task in expected_tasks]

@pytest.mark.asyncio
async def test_get_my_train_tasks_empty(client: TestClient, override_get_current_user_dependency: AppUser):
    """
    测试当用户没有训练任务时，返回空列表。
    """
    # 覆盖 get_train_task_service 依赖，使其返回一个空的 mock_service
    mock_service = MockTrainTaskService([])
    async def _override_get_empty_train_task_service():
        return mock_service
    app.dependency_overrides[get_train_task_service] = _override_get_empty_train_task_service

    response: Response = client.get("/api/train_tasks/me")
    assert response.status_code == 200
    assert response.json() == []
    app.dependency_overrides.clear()
    
@pytest.mark.asyncio
async def test_get_my_completed_train_tasks_success(client: TestClient, override_get_train_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    成功获取当前用户已完成训练任务的测试用例。
    """
    mock_service, mocked_tasks = override_get_train_task_service_dependency
    current_user = override_get_current_user_dependency

    response: Response = client.get("/api/train_tasks/me/completed")
    assert response.status_code == 200
    
    expected_tasks = [task for task in mocked_tasks if task.owner_id == current_user.id and task.status == TrainTaskStatus.completed]
    assert response.json() == [json.loads(TrainTaskPublic.model_validate(task).model_dump_json()) for task in expected_tasks]

@pytest.mark.asyncio
async def test_get_my_completed_train_tasks_empty(client: TestClient, override_get_current_user_dependency: AppUser):
    """
    测试当用户没有已完成训练任务时，返回空列表。
    """
    # 覆盖 get_train_task_service 依赖，使其返回一个只包含未完成任务的 mock_service
    mock_service = MockTrainTaskService([
        TrainTask(
            id=4,
            owner_id=override_get_current_user_dependency.id,
            dataset_id=104,
            model_type_id=204,
            hyperparameter={},
            status=TrainTaskStatus.pending,
            create_time=datetime.now(timezone.utc),
            logs_uuid=uuid4()
        )
    ])
    async def _override_get_partial_train_task_service():
        return mock_service
    app.dependency_overrides[get_train_task_service] = _override_get_partial_train_task_service

    response: Response = client.get("/api/train_tasks/me/completed")
    assert response.status_code == 200
    assert response.json() == []
    app.dependency_overrides.clear()
    
@pytest.mark.asyncio
async def test_create_train_task_success(client: TestClient, override_get_train_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    成功创建训练任务的测试用例。
    """
    mock_service, _ = override_get_train_task_service_dependency
    current_user = override_get_current_user_dependency

    train_task_data = {
        "dataset_id": 123,
        "model_type_id": 456,
        "hyperparameter": {"epochs": 10, "batch_size": 32}
    }
    response: Response = client.post("/api/train_tasks/", json=train_task_data)
    assert response.status_code == 200
    response_json = response.json()
    assert response_json["owner_id"] == current_user.id
    assert response_json["dataset_id"] == 123
    assert response_json["model_type_id"] == 456
    assert response_json["hyperparameter"] == {"epochs": 10, "batch_size": 32}
    assert response_json["status"] == "pending"
    assert "id" in response_json
    assert "create_time" in response_json
    assert "logs_uuid" in response_json

@pytest.mark.asyncio
async def test_create_train_task_failure_service(client: TestClient, override_get_current_user_dependency: AppUser):
    """
    测试当 train_task_service.create_train_task_for_user 返回 None 时的失败情况。
    """
    class MockTrainTaskServiceFail:
        async def create_train_task_for_user(self, user: AppUser, train_task_create: TrainTaskCreate) -> Optional[TrainTask]:
            return None # 模拟创建失败

    app.dependency_overrides[get_train_task_service] = lambda: MockTrainTaskServiceFail()
    
    train_task_data = {
        "dataset_id": 123,
        "model_type_id": 456,
        "hyperparameter": {"epochs": 10, "batch_size": 32}
    }
    response: Response = client.post("/api/train_tasks/", json=train_task_data)
    assert response.status_code == 400
    assert response.json() == {"detail": "创建训练任务失败"}
    app.dependency_overrides.clear()
    
@pytest.mark.asyncio
async def test_get_train_task_success(client: TestClient, override_get_train_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    成功获取指定训练任务详情的测试用例。
    """
    mock_service, mocked_tasks = override_get_train_task_service_dependency
    current_user = override_get_current_user_dependency

    # 获取属于当前用户的任务ID
    task_id = next(task.id for task in mocked_tasks if task.owner_id == current_user.id)
    expected_task = next(task for task in mocked_tasks if task.id == task_id)

    response: Response = client.get(f"/api/train_tasks/{task_id}")
    assert response.status_code == 200
    assert response.json() == json.loads(TrainTaskPublic.model_validate(expected_task).model_dump_json())

@pytest.mark.asyncio
async def test_get_train_task_not_found(client: TestClient, override_get_train_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    测试获取不存在的训练任务时返回 404 Not Found。
    """
    task_id = 99999 # 不存在的ID
    response: Response = client.get(f"/api/train_tasks/{task_id}")
    assert response.status_code == 404
    assert response.json() == {"detail": "训练任务不存在"}

@pytest.mark.asyncio
async def test_get_train_task_forbidden(client: TestClient, override_get_train_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    测试获取不属于当前用户的训练任务时返回 403 Forbidden。
    """
    mock_service, mocked_tasks = override_get_train_task_service_dependency
    
    # 获取不属于当前用户的任务ID (owner_id=999)
    forbidden_task_id = next(task.id for task in mocked_tasks if task.owner_id != override_get_current_user_dependency.id)

    response: Response = client.get(f"/api/train_tasks/{forbidden_task_id}")
    assert response.status_code == 403
    assert response.json() == {"detail": "无权访问该训练任务"}
    
@pytest.mark.asyncio
async def test_download_model_success(client: TestClient, override_get_train_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    成功下载训练模型的测试用例。
    """
    mock_service, mocked_tasks = override_get_train_task_service_dependency
    current_user = override_get_current_user_dependency

    # 找到一个属于当前用户的已完成任务
    completed_task_id = next(task.id for task in mocked_tasks if task.owner_id == current_user.id and task.status == TrainTaskStatus.completed)
    
    response: Response = client.get(f"/api/train_tasks/{completed_task_id}/download_model")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert response.headers["content-disposition"] == f'attachment; filename="model_{completed_task_id}.zip"'
    assert response.content == b"mock model content" # 验证模拟文件内容

@pytest.mark.asyncio
async def test_download_model_task_not_found(client: TestClient, override_get_train_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    测试下载不存在的训练任务的模型时返回 404 Not Found。
    """
    task_id = 99999
    response: Response = client.get(f"/api/train_tasks/{task_id}/download_model")
    assert response.status_code == 404
    assert response.json() == {"detail": "训练任务不存在"}

@pytest.mark.asyncio
async def test_download_model_forbidden(client: TestClient, override_get_train_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    测试下载不属于当前用户的训练任务模型时返回 403 Forbidden。
    """
    mock_service, mocked_tasks = override_get_train_task_service_dependency
    
    # 获取不属于当前用户的任务ID (owner_id=999)
    forbidden_task_id = next(task.id for task in mocked_tasks if task.owner_id != override_get_current_user_dependency.id)

    response: Response = client.get(f"/api/train_tasks/{forbidden_task_id}/download_model")
    assert response.status_code == 403
    assert response.json() == {"detail": "该模型不属于您，无法下载"}

@pytest.mark.asyncio
async def test_download_model_file_not_found_or_download_failed(client: TestClient, override_get_current_user_dependency: AppUser):
    """
    测试当模型文件不存在或下载失败时返回 404 Not Found。
    """
    # 创建一个模拟服务，使其 download_model 方法返回 None
    mock_service = MockTrainTaskService([
        TrainTask(
            id=5,
            owner_id=override_get_current_user_dependency.id,
            dataset_id=105,
            model_type_id=205,
            hyperparameter={},
            status=TrainTaskStatus.completed, # 必须是已完成才能进入 download_model
            create_time=datetime.now(timezone.utc),
            logs_uuid=uuid4()
        )
    ])
    async def _mock_download_model_fail(task_id: int) -> Optional[str]:
        return None # 模拟下载失败
    mock_service.download_model = _mock_download_model_fail

    app.dependency_overrides[get_train_task_service] = lambda: mock_service

    task_id = 5
    response: Response = client.get(f"/api/train_tasks/{task_id}/download_model")
    assert response.status_code == 404
    assert response.json() == {"detail": "模型文件不存在或下载失败"}
    app.dependency_overrides.clear()    
    
@pytest.mark.asyncio
async def test_delete_train_task_success(client: TestClient, override_get_train_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    成功删除训练任务的测试用例。
    """
    mock_service, mocked_tasks = override_get_train_task_service_dependency
    current_user = override_get_current_user_dependency

    # 找到一个属于当前用户的任务ID，并且它不是上面测试中被成功创建的新任务 (避免冲突)
    task_to_delete_id = 1
    
    response: Response = client.delete(f"/api/train_tasks/{task_to_delete_id}")
    assert response.status_code == 200
    assert response.json() == {"detail": "训练任务已成功删除"}
    # 验证任务是否从模拟服务中被“删除”
    assert await mock_service.get_train_task_by_id(task_to_delete_id) is None


@pytest.mark.asyncio
async def test_delete_train_task_not_found(client: TestClient, override_get_train_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    测试删除不存在的训练任务时返回 404 Not Found。
    """
    task_id = 99999 # 不存在的ID
    response: Response = client.delete(f"/api/train_tasks/{task_id}")
    assert response.status_code == 404
    assert response.json() == {"detail": "训练任务不存在"}

@pytest.mark.asyncio
async def test_delete_train_task_forbidden(client: TestClient, override_get_train_task_service_dependency, override_get_current_user_dependency: AppUser):
    """
    测试删除不属于当前用户的训练任务时返回 403 Forbidden。
    """
    mock_service, mocked_tasks = override_get_train_task_service_dependency
    
    # 获取不属于当前用户的任务ID (owner_id=999)
    forbidden_task_id = next(task.id for task in mocked_tasks if task.owner_id != override_get_current_user_dependency.id)

    response: Response = client.delete(f"/api/train_tasks/{forbidden_task_id}")
    assert response.status_code == 403
    assert response.json() == {"detail": "无权删除该训练任务"}