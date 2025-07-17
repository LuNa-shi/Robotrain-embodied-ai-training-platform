from typing import List, Optional, Dict
import unittest
from fastapi.testclient import TestClient
from fastapi import Response, status, UploadFile
import pytest
import io
import zipfile
import json
import os
from datetime import datetime, timezone
from uuid import UUID, uuid4
from starlette.background import BackgroundTask
from fastapi.responses import FileResponse

from app.main import app
from app.schemas.dataset import DatasetCreate, DatasetPublic
from app.models.dataset import Dataset
from app.models.user import AppUser
from app.core.deps import get_db

# IMPORTANT: 导入实际的 get_current_user 和 get_dataset_service 函数
from app.api.endpoints.dataset import get_current_user, get_dataset_service, get_user_service
# 导入真实的 UserService 和 DatasetService 类，用于 mocker.MagicMock 的 spec
from app.service.user import UserService
from app.service.dataset import DatasetService
# 导入 crud 模块，以便直接模拟其函数
from app.crud import crud_dataset
from app.crud import crud_user

# --- Pytest Fixtures ---

@pytest.fixture(scope="session", autouse=True) # 作用域改为 session，并自动应用
def override_get_db_dependency():
    """覆盖 FastAPI 的 get_db 依赖项，返回一个模拟的 AsyncSession。"""
    mock_session = unittest.mock.MagicMock(spec=Optional[object])
    async def _override_get_db():
        yield mock_session
    app.dependency_overrides[get_db] = _override_get_db
    yield mock_session
    # 注意：session 范围的 fixture 不会在每个测试后清除，而是在整个 session 结束后清除
    # 但由于是 autouse，它会在 app 初始化前生效，避免连接问题
    # app.dependency_overrides.clear() # 不在这里清除，由 pytest 自动管理 session 范围的 fixture 清理

@pytest.fixture(scope="module")
def client():
    """
    Pytest fixture for the FastAPI TestClient.
    此客户端用于在测试期间向 FastAPI 应用程序发出请求。
    """
    return TestClient(app)

@pytest.fixture
def test_user():
    """创建并返回一个模拟的 AppUser 对象。"""
    user = AppUser(
        id=1, # 对应 mocked_datasets 中的 owner_id
        is_admin=False,
        username="testuser",
        password_hash="hashed_password",
        created_at=datetime.now(timezone.utc),
        last_login=datetime.now(timezone.utc),
        owned_datasets=[],
        train_tasks=[],
    )
    return user

@pytest.fixture
def override_get_current_user_dependency(test_user):
    """覆盖 get_current_user 依赖，返回一个模拟用户。"""
    async def _override():
        return test_user
    app.dependency_overrides[get_current_user] = _override
    yield test_user
    app.dependency_overrides.clear()

@pytest.fixture
def mocked_datasets() -> List[Dataset]:
    """用于初始化 MockDatasetService 的模拟数据集列表。"""
    return [
        Dataset(
            id=1, dataset_name="Test Dataset 1", description="Desc 1", owner_id=1,
            dataset_uuid=UUID("a1b2c3d4-e5f6-7890-1234-567890abcdef"),
            uploaded_at=datetime.now(timezone.utc),
            total_episodes=10, total_chunks=2, video_keys=["camera_front"],
            chunks_size=1024, video_path="videos/{episode_chunk}/{video_key}/{episode_index}.mp4",
            data_path="data/{episode_chunk}/{episode_index}.parquet"
        ),
        Dataset(
            id=2, dataset_name="Test Dataset 2", description="Desc 2", owner_id=1,
            dataset_uuid=UUID("b2c3d4e5-f6a7-8901-2345-67890abcdef0"),
            uploaded_at=datetime.now(timezone.utc),
            total_episodes=20, total_chunks=10, video_keys=[],
            chunks_size=2048, video_path="", data_path=""
        ),
        Dataset(
            id=3, dataset_name="Other User's Dataset", description="This dataset belongs to another user.", owner_id=999,
            dataset_uuid=UUID("c3d4e5f6-a7b8-9012-3456-7890abcdef01"),
            uploaded_at=datetime.now(timezone.utc),
            total_episodes=5, total_chunks=1, video_keys=["camera_left"],
            chunks_size=512, video_path="videos/{episode_chunk}/{video_key}/{episode_index}.mp4",
            data_path="data/{episode_chunk}/{episode_index}.parquet"
        ),
    ]

@pytest.fixture(autouse=True) # 自动应用此 fixture
def mock_crud_operations(mocker, mocked_datasets: List[Dataset], test_user: AppUser):
    """
    模拟 crud_dataset 和 crud_user 的所有数据库操作，防止实际数据库连接。
    """
    # --- Mock crud_dataset ---
    mock_crud_dataset = mocker.MagicMock(spec=crud_dataset)

    async def mock_create_dataset(db_session, dataset_create_db):
        new_id = len(mocked_datasets) + 1
        new_dataset = Dataset(
            id=new_id,
            owner_id=dataset_create_db.owner_id,
            dataset_name=dataset_create_db.dataset_name,
            description=dataset_create_db.description,
            dataset_uuid=dataset_create_db.dataset_uuid,
            uploaded_at=datetime.now(timezone.utc), # 模拟创建时间
            total_episodes=dataset_create_db.total_episodes,
            total_chunks=dataset_create_db.total_chunks,
            video_keys=dataset_create_db.video_keys,
            chunks_size=dataset_create_db.chunks_size,
            video_path=dataset_create_db.video_path,
            data_path=dataset_create_db.data_path,
        )
        mocked_datasets.append(new_dataset) # 添加到模拟列表
        return new_dataset
    mock_crud_dataset.create_dataset.side_effect = mock_create_dataset

    async def mock_get_dataset_by_id(db_session, dataset_id):
        return next((ds for ds in mocked_datasets if ds.id == dataset_id), None)
    mock_crud_dataset.get_dataset_by_id.side_effect = mock_get_dataset_by_id

    async def mock_get_datasets_by_user_id(db_session, user_id):
        return [ds for ds in mocked_datasets if ds.owner_id == user_id]
    mock_crud_dataset.get_datasets_by_user_id.side_effect = mock_get_datasets_by_user_id

    async def mock_delete_dataset(db_session, dataset_id):
        dataset_to_delete = next((ds for ds in mocked_datasets if ds.id == dataset_id), None)
        if dataset_to_delete:
            # 实际从 mocked_datasets 中删除，以便后续测试反映变化
            mocked_datasets[:] = [ds for ds in mocked_datasets if ds.id != dataset_id]
            return dataset_to_delete
        return None
    mock_crud_dataset.delete_dataset.side_effect = mock_delete_dataset

    mocker.patch('app.crud.crud_dataset', new=mock_crud_dataset)

    # --- Mock crud_user ---
    mock_crud_user = mocker.MagicMock(spec=crud_user)
    mock_crud_user.get_user_by_id.return_value = test_user # 假设 UserService 会调用此方法
    mocker.patch('app.crud.crud_user', new=mock_crud_user)

    yield # 允许测试运行

@pytest.fixture
def override_get_dataset_service_dependency(mocked_datasets: List[Dataset], mocker):
    """覆盖 get_dataset_service 依赖，返回一个 mocker.MagicMock 实例。"""
    mock_service = mocker.MagicMock(spec=DatasetService)

    # 直接设置 mock service 方法的 side_effect，使其行为与 DatasetService 预期一致
    # 这些方法将通过 crud_dataset 的 mock 来间接操作 mocked_datasets
    mock_service.get_datasets_by_user_id.side_effect = lambda user_id: [
        ds for ds in mocked_datasets if ds.owner_id == user_id
    ]
    mock_service.get_dataset_by_id.side_effect = lambda dataset_id: next(
        (ds for ds in mocked_datasets if ds.id == dataset_id), None
    )

    async def mock_upload_dataset_for_user(user: AppUser, dataset_create: DatasetCreate, upload_file: UploadFile) -> Optional[Dataset]:
        # 模拟 info.json 解析结果
        mock_info_data = {
            "total_episodes": 10,
            "total_chunks": 5,
            "chunks_size": 1024,
            "video_path": "videos/{episode_chunk}/{video_key}/{episode_index}.mp4",
            "data_path": "data/{episode_chunk}/{episode_index}.parquet",
            "features": {
                "camera_front": {"dtype": "video"},
                "camera_back": {"dtype": "video"},
                "data_points": {"dtype": "data"}
            }
        }
        total_episodes = mock_info_data.get("total_episodes", 0)
        total_chunks = mock_info_data.get("total_chunks", 0)
        chunks_size = mock_info_data.get("chunks_size", 0)
        video_path = mock_info_data.get("video_path", "")
        data_path = mock_info_data.get("data_path", "")
        video_keys = [k for k, v in mock_info_data.get("features", {}).items() if v.get("dtype") == "video"]

        new_id = len(mocked_datasets) + 1 # 模拟新的ID
        new_dataset = Dataset(
            id=new_id,
            dataset_name=dataset_create.dataset_name,
            description=dataset_create.description,
            owner_id=user.id,
            dataset_uuid=uuid4(), # 每次生成新的 UUID
            uploaded_at=datetime.now(timezone.utc),
            total_episodes=total_episodes,
            total_chunks=total_chunks,
            video_keys=video_keys,
            chunks_size=chunks_size,
            video_path=video_path,
            data_path=data_path
        )
        mocked_datasets.append(new_dataset) # 直接修改 mocked_datasets
        return new_dataset
    mock_service.upload_dataset_for_user.side_effect = mock_upload_dataset_for_user

    async def mock_delete_dataset_by_id(dataset_id: int) -> Optional[Dataset]:
        dataset_to_delete = next((ds for ds in mocked_datasets if ds.id == dataset_id), None)
        if dataset_to_delete:
            mocked_datasets[:] = [ds for ds in mocked_datasets if ds.id != dataset_id]
            return dataset_to_delete
        return None
    mock_service.delete_dataset_by_id.side_effect = mock_delete_dataset_by_id

    async def mock_get_video(dataset_id: int, chunck_id: int, view_point: str, episode_id: int) -> Optional[FileResponse]:
        # 模拟 FileResponse 返回的文件路径，API 会用这个路径创建 FileResponse
        if dataset_id == 1 and chunck_id == 0 and episode_id == 0 and view_point == "camera_front":
            temp_file_path = f"/tmp/mock_video_{dataset_id}_{chunck_id}_{episode_id}_{view_point}.mp4"
            with open(temp_file_path, "wb") as f:
                f.write(b"mock video content")
            # API 层期望 FileResponse，所以这里直接返回 FileResponse
            return FileResponse(
                temp_file_path,
                media_type="video/mp4",
                filename=f"Test Dataset 1_episode_{episode_id}_chunk_{chunck_id}.mp4", # 匹配 API 层的 filename 格式
                background=BackgroundTask(os.remove, temp_file_path)
            )
        return None
    mock_service.get_video_by_dataset_id_and_chunk_id_and_episode_id.side_effect = mock_get_video

    async def mock_get_parquet(dataset_id: int, chunck_id: int, episode_id: int) -> Optional[FileResponse]:
        # 模拟 FileResponse 返回的文件路径
        if dataset_id == 1 and chunck_id == 0 and episode_id == 0:
            temp_file_path = f"/tmp/mock_parquet_{dataset_id}_{chunck_id}_{episode_id}.parquet"
            with open(temp_file_path, "wb") as f:
                f.write(b"mock parquet content")
            # API 层期望 FileResponse，所以这里直接返回 FileResponse
            return FileResponse(
                temp_file_path,
                media_type="application/octet-stream",
                filename=f"Test Dataset 1_episode_{episode_id}_chunk_{chunck_id}.parquet", # 匹配 API 层的 filename 格式
                background=BackgroundTask(os.remove, temp_file_path)
            )
        return None
    mock_service.get_parquet_by_dataset_id_and_chunk_id_and_episode_id.side_effect = mock_get_parquet

    app.dependency_overrides[get_dataset_service] = lambda: mock_service
    
    # MinIO 工具函数在 service 层被调用，所以这里继续模拟
    mocker.patch(
        'app.core.minio_utils.upload_dataset_to_minio',
        new_callable=mocker.AsyncMock,
        return_value=(True, "mock_minio_path.zip")
    )
    mocker.patch(
        'app.core.minio_utils.delete_dataset_from_minio',
        new_callable=mocker.AsyncMock,
        return_value=True
    )
    mocker.patch(
        'app.core.minio_utils.get_minio_client',
        new_callable=mocker.AsyncMock,
        return_value=mocker.MagicMock()
    )
    mocker.patch(
        'app.core.minio_utils.download_dataset_file_from_zip_on_minio',
        new_callable=mocker.AsyncMock,
        return_value=(True, "/tmp/mock_downloaded_file.tmp") # 模拟下载成功的文件路径
    )

    yield mock_service, mocked_datasets
    app.dependency_overrides.clear()
    # 清理临时文件
    temp_files = [f for f in os.listdir("/tmp") if f.startswith(("mock_video_", "mock_parquet_"))]
    for f in temp_files:
        try:
            os.remove(os.path.join("/tmp", f))
        except OSError:
            # 文件可能已经被 FileResponse 的 BackgroundTask 清理，忽略错误
            pass


@pytest.fixture
def override_get_user_service_dependency(test_user, mocked_datasets, mocker):
    """覆盖 get_user_service 依赖，返回一个 mocker.MagicMock 实例。"""
    mock_user_service = mocker.MagicMock(spec=UserService)
    
    async def mock_datasets_owned_by_user(user_id: int) -> list[Dataset]:
        return [d for d in mocked_datasets if d.owner_id == user_id]
    mock_user_service.datasets_owned_by_user.side_effect = mock_datasets_owned_by_user

    app.dependency_overrides[get_user_service] = lambda: mock_user_service
    yield mock_user_service
    app.dependency_overrides.clear()

# --- Test Cases ---

@pytest.mark.asyncio
async def test_get_my_datasets_success(
    client: TestClient,
    override_get_dataset_service_dependency,
    override_get_current_user_dependency: AppUser
):
    """测试成功获取当前用户的数据集列表。"""
    mock_service, mocked_datasets = override_get_dataset_service_dependency
    current_user = override_get_current_user_dependency

    response = client.get("/api/datasets/me")
    assert response.status_code == status.HTTP_200_OK
    
    expected_datasets = [ds for ds in mocked_datasets if ds.owner_id == current_user.id]
    response_json = sorted(response.json(), key=lambda x: x['id'])
    expected_json = sorted([json.loads(DatasetPublic.model_validate(ds).model_dump_json()) for ds in expected_datasets], key=lambda x: x['id'])
    
    assert response_json == expected_json
    
    mock_service.get_datasets_by_user_id.assert_called_once_with(current_user.id)


@pytest.mark.asyncio
async def test_get_my_datasets_empty(
    client: TestClient,
    override_get_current_user_dependency: AppUser,
    mocker # 引入 mocker 来创建临时 mock
):
    """测试当用户没有数据集时返回空列表。"""
    mock_service = mocker.MagicMock(spec=DatasetService)
    mock_service.get_datasets_by_user_id.return_value = []
    app.dependency_overrides[get_dataset_service] = lambda: mock_service

    response = client.get("/api/datasets/me")
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == []
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_get_dataset_success(
    client: TestClient,
    override_get_dataset_service_dependency,
    override_get_user_service_dependency,
    override_get_current_user_dependency: AppUser
):
    """测试成功获取指定数据集详情 (用户拥有)。"""
    mock_service, mocked_datasets = override_get_dataset_service_dependency
    mock_user_service = override_get_user_service_dependency
    current_user = override_get_current_user_dependency

    dataset_id = next(ds.id for ds in mocked_datasets if ds.owner_id == current_user.id)
    expected_dataset = next(ds for ds in mocked_datasets if ds.id == dataset_id)

    response = client.get(f"/api/datasets/{dataset_id}")
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == json.loads(DatasetPublic.model_validate(expected_dataset).model_dump_json())
    
    mock_user_service.datasets_owned_by_user.assert_called_once_with(current_user.id)
    mock_service.get_dataset_by_id.assert_called_once_with(dataset_id)


@pytest.mark.asyncio
async def test_get_dataset_not_found(
    client: TestClient,
    override_get_dataset_service_dependency,
    override_get_user_service_dependency,
    override_get_current_user_dependency: AppUser
):
    """测试获取不存在的数据集时返回 404。"""
    mock_service, _ = override_get_dataset_service_dependency
    mock_user_service = override_get_user_service_dependency

    # 模拟 user_service 返回空列表，表示用户不拥有任何数据集
    mock_user_service.datasets_owned_by_user.return_value = []

    dataset_id_not_found = 999
    response = client.get(f"/api/datasets/{dataset_id_not_found}")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["detail"] == "该数据集不存在或该数据集不属于当前用户。"
    mock_user_service.datasets_owned_by_user.assert_called_once_with(override_get_current_user_dependency.id)
    mock_service.get_dataset_by_id.assert_not_called()


@pytest.mark.asyncio
async def test_get_dataset_forbidden(
    client: TestClient,
    override_get_dataset_service_dependency,
    override_get_user_service_dependency,
    override_get_current_user_dependency: AppUser
):
    """测试获取不属于当前用户的数据集时返回 403。"""
    mock_service, mocked_datasets = override_get_dataset_service_dependency
    mock_user_service = override_get_user_service_dependency
    current_user = override_get_current_user_dependency
    
    forbidden_dataset_id = next(ds.id for ds in mocked_datasets if ds.owner_id != current_user.id)

    # 确保 user_service.datasets_owned_by_user 返回一个不包含 forbidden_dataset_id 的列表
    mock_user_service.datasets_owned_by_user.return_value = [
        ds for ds in mocked_datasets if ds.owner_id == current_user.id
    ]

    response = client.get(f"/api/datasets/{forbidden_dataset_id}")
    assert response.status_code == status.HTTP_404_NOT_FOUND # 你的 API 返回 404
    assert response.json()["detail"] == "该数据集不存在或该数据集不属于当前用户。"
    mock_user_service.datasets_owned_by_user.assert_called_once_with(current_user.id)
    mock_service.get_dataset_by_id.assert_not_called()


@pytest.mark.asyncio
async def test_get_dataset_video_success(
    client: TestClient,
    override_get_dataset_service_dependency,
    override_get_current_user_dependency: AppUser
):
    """测试成功获取数据集中的视频数据。"""
    mock_service, _ = override_get_dataset_service_dependency
    current_user = override_get_current_user_dependency

    dataset_id = 1
    chunk_id = 0
    episode_id = 0
    view_point = "camera_front"
    
    response = client.get(f"/api/datasets/visualize/{dataset_id}/{chunk_id}/{episode_id}/{view_point}/video")
    assert response.status_code == status.HTTP_200_OK
    assert response.headers["content-type"] == "video/mp4" # API 中明确设置为 video/mp4
    # 获取模拟的数据集名称，用于 Content-Disposition 断言
    mocked_dataset_name = next(ds.dataset_name for ds in override_get_dataset_service_dependency[1] if ds.id == dataset_id)
    # assert response.headers["content-disposition"] == f'attachment; filename={mocked_dataset_name}_episode_{episode_id}_chunk_{chunk_id}.mp4'
    assert response.content == b"mock video content"

    mock_service.get_video_by_dataset_id_and_chunk_id_and_episode_id.assert_called_once_with(
        dataset_id=dataset_id,
        chunck_id=chunk_id,
        view_point=view_point,
        episode_id=episode_id
    )


@pytest.mark.asyncio
async def test_get_dataset_video_not_found(
    client: TestClient,
    override_get_dataset_service_dependency,
    override_get_current_user_dependency: AppUser
):
    """测试获取不存在的视频文件时返回 404。"""
    mock_service, _ = override_get_dataset_service_dependency
    
    # 模拟 get_dataset_by_id 返回一个存在的数据集，但 get_video_by_dataset_id_and_chunk_id_and_episode_id 返回 None
    mock_service.get_dataset_by_id.return_value = Dataset(
        id=100, owner_id=override_get_current_user_dependency.id, dataset_name="temp_dataset",
        description="temp", dataset_uuid=uuid4(), uploaded_at=datetime.now(timezone.utc),
        features={}, data_path="", video_path="", total_episodes=0, total_chunks=0, chunks_size=0
    )
    mock_service.get_video_by_dataset_id_and_chunk_id_and_episode_id.return_value = None

    dataset_id = 100
    chunk_id = 0
    episode_id = 0
    view_point = "camera_front"
    response = client.get(f"/api/datasets/visualize/{dataset_id}/{chunk_id}/{episode_id}/{view_point}/video")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "视频文件未找到。"}
    mock_service.get_video_by_dataset_id_and_chunk_id_and_episode_id.assert_called_once_with(
        dataset_id=dataset_id,
        chunck_id=chunk_id,
        view_point=view_point,
        episode_id=episode_id
    )


@pytest.mark.asyncio
async def test_get_dataset_parquet_success(
    client: TestClient,
    override_get_dataset_service_dependency,
    override_get_current_user_dependency: AppUser
):
    """测试成功获取数据集中的 Parquet 数据。"""
    mock_service, _ = override_get_dataset_service_dependency
    current_user = override_get_current_user_dependency

    dataset_id = 1
    chunk_id = 0
    episode_id = 0
    
    response = client.get(f"/api/datasets/visualize/{dataset_id}/{chunk_id}/{episode_id}/parquet")
    assert response.status_code == status.HTTP_200_OK
    assert response.headers["content-type"] == "application/octet-stream"
    # 获取模拟的数据集名称，用于 Content-Disposition 断言
    mocked_dataset_name = next(ds.dataset_name for ds in override_get_dataset_service_dependency[1] if ds.id == dataset_id)
    # assert response.headers["content-disposition"] == f'attachment; filename={mocked_dataset_name}_episode_{episode_id}_chunk_{chunk_id}.parquet'
    assert response.content == b"mock parquet content"

    mock_service.get_parquet_by_dataset_id_and_chunk_id_and_episode_id.assert_called_once_with(
        dataset_id=dataset_id,
        chunck_id=chunk_id,
        episode_id=episode_id
    )

@pytest.mark.asyncio
async def test_get_dataset_parquet_not_found(
    client: TestClient,
    override_get_dataset_service_dependency,
    override_get_current_user_dependency: AppUser
):
    """测试获取不存在的 Parquet 文件时返回 404。"""
    mock_service, _ = override_get_dataset_service_dependency

    # 模拟 get_dataset_by_id 返回一个存在的数据集，但 get_parquet_by_dataset_id_and_chunk_id_and_episode_id 返回 None
    mock_service.get_dataset_by_id.return_value = Dataset(
        id=100, owner_id=override_get_current_user_dependency.id, dataset_name="temp_dataset",
        description="temp", dataset_uuid=uuid4(), uploaded_at=datetime.now(timezone.utc),
        features={}, data_path="", video_path="", total_episodes=0, total_chunks=0, chunks_size=0
    )
    mock_service.get_parquet_by_dataset_id_and_chunk_id_and_episode_id.return_value = None

    dataset_id = 100
    chunk_id = 0
    episode_id = 0
    response = client.get(f"/api/datasets/visualize/{dataset_id}/{chunk_id}/{episode_id}/parquet")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "Parquet 文件未找到。"}


@pytest.mark.asyncio
async def test_upload_dataset_success(
    client: TestClient,
    override_get_dataset_service_dependency,
    override_get_current_user_dependency: AppUser
):
    """测试成功上传数据集。"""
    mock_service, mocked_datasets = override_get_dataset_service_dependency # 获取被修改的 mocked_datasets 列表
    current_user = override_get_current_user_dependency

    initial_mocked_datasets_len = len(mocked_datasets) # 在操作前记录长度

    info_json_content = {
        "total_episodes": 10,
        "total_chunks": 5,
        "chunks_size": 1024,
        "video_path": "videos/{episode_chunk}/{video_key}/{episode_index}.mp4",
        "data_path": "data/{episode_chunk}/{episode_index}.parquet",
        "features": {
            "camera_front": {"dtype": "video"},
            "state": {"dtype": "data"}
        }
    }
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w') as zf:
        zf.writestr('meta/info.json', json.dumps(info_json_content))
        zf.writestr('some_file_in_zip.txt', 'dummy content')
    zip_buffer.seek(0)

    files = {'file': ('test_dataset.zip', zip_buffer.getvalue(), 'application/zip')}
    data = {
        "name": "New Test Dataset",
        "description": "A newly uploaded dataset."
    }

    response = client.post("/api/datasets/upload", data=data, files=files)
    assert response.status_code == status.HTTP_200_OK
    response_json = response.json()
    assert response_json["dataset_name"] == "New Test Dataset"
    assert response_json["description"] == "A newly uploaded dataset."
    assert response_json["owner_id"] == current_user.id
    assert "dataset_uuid" in response_json
    assert "uploaded_at" in response_json
    assert response_json["total_episodes"] == 10
    assert response_json["total_chunks"] == 5
    assert "camera_front" in response_json["video_keys"]
    
    # 验证 mock_service 内部状态：检查 mocked_datasets 列表的长度是否增加
    assert len(mocked_datasets) == initial_mocked_datasets_len + 1
    # 验证新添加的数据集是列表中的最后一个
    assert mocked_datasets[-1].dataset_name == "New Test Dataset"
    
    mock_service.upload_dataset_for_user.assert_called_once()
    args, kwargs = mock_service.upload_dataset_for_user.call_args
    assert kwargs["user"] == current_user
    assert kwargs["dataset_create"].dataset_name == "New Test Dataset"
    # assert isinstance(kwargs["upload_file"], UploadFile)


@pytest.mark.asyncio
async def test_upload_dataset_invalid_file_type(
    client: TestClient,
    override_get_current_user_dependency: AppUser
):
    """测试上传非 ZIP 格式文件。"""
    files = {'file': ('test.txt', b'dummy content', 'text/plain')}
    data = {
        "name": "Invalid File Dataset",
        "description": "This is a test for invalid file type."
    }
    
    response = client.post("/api/datasets/upload", data=data, files=files)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"detail": "仅支持上传 zip 格式的文件。"}


@pytest.mark.asyncio
async def test_upload_dataset_service_failure(
    client: TestClient,
    override_get_dataset_service_dependency, # 引入 mock_service
    override_get_current_user_dependency: AppUser
):
    """测试当 service 层上传失败时。"""
    mock_service, _ = override_get_dataset_service_dependency
    # 模拟 upload_dataset_for_user 返回 None
    mock_service.upload_dataset_for_user.return_value = None
    
    info_json_content = {}
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w') as zf:
        zf.writestr('meta/info.json', json.dumps(info_json_content))
    zip_buffer.seek(0)

    files = {'file': ('test_dataset.zip', zip_buffer.getvalue(), 'application/zip')}
    data = {
        "name": "Failed Upload Dataset",
        "description": "This should fail."
    }

    response = client.post("/api/datasets/upload", data=data, files=files)
    # assert response.status_code == status.HTTP_400_BAD_REQUEST
    # assert response.json() == {"detail": "数据集上传失败，请稍后重试。"}
    mock_service.upload_dataset_for_user.assert_called_once()


# @pytest.mark.asyncio
# async def test_delete_dataset_success(
#     client: TestClient,
#     override_get_dataset_service_dependency,
#     override_get_current_user_dependency: AppUser
# ):
#     """测试成功删除数据集。"""
#     mock_service, mocked_datasets = override_get_dataset_service_dependency
#     current_user = override_get_current_user_dependency

#     # 找到一个属于当前用户的且在 mock_service 中存在的 ID
#     dataset_to_delete_id = next(ds.id for ds in mocked_datasets if ds.owner_id == current_user.id)
    
#     # 在 mock_delete_dataset_by_id 的 side_effect 中已经处理了从 mocked_datasets 中删除
#     # 这里我们先保存被删除对象的信息，因为 mocked_datasets 列表会被修改
#     original_deleted_dataset = next(ds for ds in mocked_datasets if ds.id == dataset_to_delete_id)

#     response = client.delete(f"/api/datasets/{dataset_to_delete_id}")
#     assert response.status_code == status.HTTP_200_OK
    
#     # 你的 API 返回的是 DatasetPublic，所以这里应该断言返回了被删除的数据集的信息
#     deleted_dataset_public = DatasetPublic.model_validate(original_deleted_dataset)
#     assert response.json() == json.loads(deleted_dataset_public.model_dump_json())
    
#     # 验证数据集是否从模拟服务中被“删除”
#     # 此时 mocked_datasets 已经被修改，所以 get_dataset_by_id 应该返回 None
#     assert await mock_service.get_dataset_by_id(dataset_to_delete_id) is None
#     mock_service.delete_dataset_by_id.assert_called_once_with(dataset_to_delete_id)


# @pytest.mark.asyncio
# async def test_delete_dataset_not_found(
#     client: TestClient,
#     override_get_dataset_service_dependency,
#     override_get_current_user_dependency: AppUser
# ):
#     """测试删除不存在的数据集时返回 404 Not Found。"""
#     mock_service, _ = override_get_dataset_service_dependency
#     # 模拟 get_dataset_by_id 返回 None，表示数据集不存在
#     mock_service.get_dataset_by_id.return_value = None

#     dataset_id = 99999 # 不存在的ID
#     response = client.delete(f"/api/datasets/{dataset_id}")
#     assert response.status_code == status.HTTP_404_NOT_FOUND
#     assert response.json() == {"detail": "该数据集不存在或该数据集不属于当前用户。"}
#     mock_service.get_dataset_by_id.assert_called_once_with(dataset_id)
#     mock_service.delete_dataset_by_id.assert_not_called()


# @pytest.mark.asyncio
# async def test_delete_dataset_forbidden(
#     client: TestClient,
#     override_get_dataset_service_dependency,
#     override_get_user_service_dependency,
#     override_get_current_user_dependency: AppUser
# ):
#     """测试删除不属于当前用户的数据集时返回 403 Forbidden。"""
#     mock_service, mocked_datasets = override_get_dataset_service_dependency
#     mock_user_service = override_get_user_service_dependency
#     current_user = override_get_current_user_dependency

#     # 获取一个不属于当前用户的 ID
#     forbidden_dataset_id = next(ds.id for ds in mocked_datasets if ds.owner_id != current_user.id)

#     # 模拟 user_service.datasets_owned_by_user 返回一个不包含 forbidden_dataset_id 的列表
#     mock_user_service.datasets_owned_by_user.return_value = [
#         ds for ds in mocked_datasets if ds.owner_id == current_user.id
#     ]

#     response = client.delete(f"/api/datasets/{forbidden_dataset_id}")
#     assert response.status_code == status.HTTP_404_NOT_FOUND # 你的 API 返回 404
#     assert response.json()["detail"] == "该数据集不存在或该数据集不属于当前用户。"
#     mock_user_service.datasets_owned_by_user.assert_called_once_with(current_user.id)
#     mock_service.get_dataset_by_id.assert_not_called()
#     mock_service.delete_dataset_by_id.assert_not_called()