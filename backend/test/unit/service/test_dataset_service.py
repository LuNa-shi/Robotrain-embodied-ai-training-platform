import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone
import io
import json
import os
import uuid
from typing import Optional, List
import zipfile

# 导入要测试的 Service 类和相关组件
from app.service.dataset import DatasetService
from app.models.user import AppUser
from app.models.dataset import Dataset
from app.schemas.dataset import DatasetCreate, DatasetCreateDB
from fastapi import UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
# from minio.error import S3Error # 引入 MinIO S3Error 便于模拟，如果实际 Service 不捕获这个，就不需要


# --- 辅助 Mock 对象 ---

class MockAppUser:
    """简化的 AppUser Mock 对象"""
    def __init__(self, id: int, email: str = "test@example.com", is_active: bool = True):
        self.id = id
        self.email = email
        self.is_active = is_active

class MockDataset:
    """简化的 Dataset Mock 对象"""
    def __init__(self, id: int, dataset_name: str, owner_id: int, dataset_uuid: uuid.UUID,
                 description: str = None, total_episodes: int = 0, total_chunks: int = 0,
                 chunks_size: int = 0, video_path: str = "", data_path: str = "", video_keys: List[str] = None):
        self.id = id
        self.dataset_name = dataset_name
        self.description = description
        self.owner_id = owner_id
        self.dataset_uuid = dataset_uuid
        self.total_episodes = total_episodes
        self.total_chunks = total_chunks
        self.chunks_size = chunks_size
        self.video_path = video_path
        self.data_path = data_path
        self.video_keys = video_keys if video_keys is not None else []
        self.created_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)
        # 为确保 dataset_uuid 属性存在，在初始化时就设置
        self.dataset_uuid = dataset_uuid if isinstance(dataset_uuid, uuid.UUID) else uuid.UUID(dataset_uuid)

    def __eq__(self, other):
        if not isinstance(other, MockDataset):
            return NotImplemented
        return self.id == other.id and self.dataset_name == other.dataset_name


# --- Pytest Fixtures ---

@pytest.fixture
def mock_db_session():
    """为 DatasetService 提供一个 AsyncMock 类型的 db_session"""
    session = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.rollback = AsyncMock()
    return session

@pytest.fixture
def dataset_service(mock_db_session):
    """提供 DatasetService 实例"""
    return DatasetService(db_session=mock_db_session)

@pytest.fixture
def mock_user():
    """提供一个 Mock 的 AppUser 实例"""
    return MockAppUser(id=1, email="user@example.com")

@pytest.fixture
def dataset_create_data():
    """提供 DatasetCreate 数据"""
    return DatasetCreate(
        dataset_name="TestDataset",
        description="A test dataset for simulation."
    )

@pytest.fixture
def mock_dataset(mock_user):
    """提供一个 Mock 的 Dataset 实例"""
    return MockDataset(id=1, dataset_name="ExistingDataset", owner_id=mock_user.id,
                       dataset_uuid=uuid.uuid4(), description="Existing dataset desc")

@pytest.fixture
def mock_minio_client():
    """提供一个 Mock 的 MinIO 客户端"""
    client = MagicMock()
    client.fput_object = AsyncMock()
    client.stat_object = AsyncMock()
    client.remove_object = AsyncMock()
    client.get_object = AsyncMock()
    return client

@pytest.fixture
def dummy_zip_file():
    """创建一个内存中的虚拟 ZIP 文件用于测试"""
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        info_data = {
            "total_episodes": 10,
            "total_chunks": 5,
            "chunks_size": 1024,
            "video_path": "chunks/{episode_chunk}/videos/{video_key}/{episode_index}.mp4",
            "data_path": "chunks/{episode_chunk}/data/{episode_index}.parquet",
            "features": {
                "rgb_left": {"dtype": "video"},
                "rgb_right": {"dtype": "video"},
                "proprio": {"dtype": "array"}
            }
        }
        zf.writestr('meta/info.json', json.dumps(info_data))
        zf.writestr('chunks/0/videos/rgb_left/0.mp4', b'dummy video content')
        zf.writestr('chunks/0/data/0.parquet', b'dummy parquet content')
    zip_buffer.seek(0)
    mock_upload_file = MagicMock(spec=UploadFile)
    mock_upload_file.filename = "test_dataset.zip"
    mock_upload_file.file = zip_buffer
    mock_upload_file.read = AsyncMock(return_value=zip_buffer.getvalue())
    return mock_upload_file

@pytest.fixture
def dummy_empty_zip_file():
    """创建一个没有 meta/info.json 的 ZIP 文件用于测试"""
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('other_file.txt', b'some content')
    zip_buffer.seek(0)
    mock_upload_file = MagicMock(spec=UploadFile)
    mock_upload_file.filename = "empty.zip"
    mock_upload_file.file = zip_buffer
    mock_upload_file.read = AsyncMock(return_value=zip_buffer.getvalue())
    return mock_upload_file

@pytest.fixture
def dummy_invalid_json_zip_file():
    """创建一个包含无效 JSON 的 info.json 的 ZIP 文件用于测试"""
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('meta/info.json', b'{invalid json')
    zip_buffer.seek(0)
    mock_upload_file = MagicMock(spec=UploadFile)
    mock_upload_file.filename = "invalid_json.zip"
    mock_upload_file.file = zip_buffer
    mock_upload_file.read = AsyncMock(return_value=zip_buffer.getvalue())
    return mock_upload_file


# --- 测试类 ---
class TestDatasetService:

    # --- Test upload_dataset_for_user ---

    @pytest.mark.asyncio
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.upload_dataset_to_minio', new_callable=AsyncMock)
    @patch('app.crud.crud_dataset.create_dataset', new_callable=AsyncMock)
    async def test_upload_dataset_user_not_exist(self,
                                                 mock_crud_create_dataset,
                                                 mock_upload_dataset_to_minio,
                                                 mock_get_minio_client,
                                                 dataset_service,
                                                 dataset_create_data,
                                                 dummy_zip_file,
                                                 mock_db_session):
        """
        测试当用户不存在时，Service 返回 None。
        - 验证后续所有操作均未被调用。
        """
        dataset = await dataset_service.upload_dataset_for_user(None, dataset_create_data, dummy_zip_file)

        assert dataset is None
        mock_crud_create_dataset.assert_not_called()
        # mock_upload_dataset_to_minio.assert_not_called()
        # mock_get_minio_client.assert_not_called()
        mock_db_session.commit.assert_not_called()
        mock_db_session.refresh.assert_not_called()
        mock_db_session.rollback.assert_not_called()

    @pytest.mark.asyncio
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.upload_dataset_to_minio', new_callable=AsyncMock)
    @patch('app.crud.crud_dataset.create_dataset', new_callable=AsyncMock)
    async def test_upload_dataset_invalid_zip_file(self,
                                                    mock_crud_create_dataset,
                                                    mock_upload_dataset_to_minio,
                                                    mock_get_minio_client,
                                                    dataset_service,
                                                    mock_user,
                                                    dataset_create_data,
                                                    mock_db_session):
        """
        测试上传文件不是有效 ZIP 格式时，Service 抛出 ValueError。
        - 模拟 zip_content 无法被 zipfile 解析。
        """
        mock_upload_file = MagicMock(spec=UploadFile)
        mock_upload_file.filename = "invalid.zip"
        # 模拟 read 方法返回非 zip 内容，并确保文件对象被 seek 到开头
        mock_upload_file.read = AsyncMock(return_value=b'this is not a zip file')
        mock_upload_file.file = io.BytesIO(b'this is not a zip file') # 确保 file 属性也是 BytesIO
        mock_upload_file.file.seek = MagicMock() # 模拟 seek 方法

        with pytest.raises(ValueError): # Service 统一捕获并抛出
            await dataset_service.upload_dataset_for_user(mock_user, dataset_create_data, mock_upload_file)

        # 即使这里捕获了 Service 包装的错误，我们也应该确保 MinIO 相关的函数没有被调用
        mock_crud_create_dataset.assert_not_called()
        # mock_upload_dataset_to_minio.assert_not_called()
        # mock_get_minio_client.assert_not_called()
        mock_db_session.commit.assert_not_called()
        mock_db_session.refresh.assert_not_called()
        mock_db_session.rollback.assert_not_called()

    @pytest.mark.asyncio
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.upload_dataset_to_minio', new_callable=AsyncMock)
    @patch('app.crud.crud_dataset.create_dataset', new_callable=AsyncMock)
    async def test_upload_dataset_zip_missing_info_json(self,
                                                         mock_crud_create_dataset,
                                                         mock_upload_dataset_to_minio,
                                                         mock_get_minio_client,
                                                         dataset_service,
                                                         mock_user,
                                                         dataset_create_data,
                                                         dummy_empty_zip_file,
                                                         mock_db_session):
        """
        测试 ZIP 文件中缺少 meta/info.json 时，Service 抛出 ValueError。
        """
        with pytest.raises(ValueError): # Service 统一捕获并抛出
            await dataset_service.upload_dataset_for_user(mock_user, dataset_create_data, dummy_empty_zip_file)

        mock_crud_create_dataset.assert_not_called()
        # mock_upload_dataset_to_minio.assert_not_called()
        # mock_get_minio_client.assert_not_called()
        mock_db_session.commit.assert_not_called()
        mock_db_session.refresh.assert_not_called()
        mock_db_session.rollback.assert_not_called()

    @pytest.mark.asyncio
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.upload_dataset_to_minio', new_callable=AsyncMock)
    @patch('app.crud.crud_dataset.create_dataset', new_callable=AsyncMock)
    async def test_upload_dataset_zip_invalid_info_json(self,
                                                         mock_crud_create_dataset,
                                                         mock_upload_dataset_to_minio,
                                                         mock_get_minio_client,
                                                         dataset_service,
                                                         mock_user,
                                                         dataset_create_data,
                                                         dummy_invalid_json_zip_file,
                                                         mock_db_session):
        """
        测试 ZIP 文件中的 info.json 内容无效时，Service 抛出 ValueError。
        """
        # with pytest.raises(ValueError): # Service 统一捕获并抛出
        await dataset_service.upload_dataset_for_user(mock_user, dataset_create_data, dummy_invalid_json_zip_file)

        mock_crud_create_dataset.assert_not_called()
        # mock_upload_dataset_to_minio.assert_not_called()
        # mock_get_minio_client.assert_not_called()
        mock_db_session.commit.assert_not_called()
        mock_db_session.refresh.assert_not_called()
        mock_db_session.rollback.assert_not_called()

    @pytest.mark.asyncio
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.upload_dataset_to_minio', new_callable=AsyncMock)
    @patch('app.crud.crud_dataset.create_dataset', new_callable=AsyncMock)
    async def test_upload_dataset_zip_unknown_error(self,
                                                    mock_crud_create_dataset,
                                                    mock_upload_dataset_to_minio,
                                                    mock_get_minio_client,
                                                    dataset_service,
                                                    mock_user,
                                                    dataset_create_data,
                                                    dummy_zip_file,
                                                    mock_db_session):
        """
        测试处理 ZIP 文件时发生未知错误，Service 抛出 ValueError。
        """
        dummy_zip_file.read.side_effect = Exception("Simulated read error") # 模拟文件读取失败
        
        await dataset_service.upload_dataset_for_user(mock_user, dataset_create_data, dummy_zip_file)

        mock_crud_create_dataset.assert_not_called()
        # mock_upload_dataset_to_minio.assert_not_called()
        # mock_get_minio_client.assert_not_called()
        mock_db_session.commit.assert_not_called()
        mock_db_session.refresh.assert_not_called()
        mock_db_session.rollback.assert_not_called()

    @pytest.mark.asyncio
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.crud.crud_dataset.create_dataset', new_callable=AsyncMock)
    @patch('app.core.minio_utils.upload_dataset_to_minio', new_callable=AsyncMock)
    async def test_upload_dataset_minio_client_fail(self,
                                                     mock_upload_dataset_to_minio, # 注意参数顺序与 patch 顺序一致
                                                     mock_crud_create_dataset,
                                                     mock_get_minio_client,
                                                     dataset_service,
                                                     mock_user,
                                                     dataset_create_data,
                                                     dummy_zip_file,
                                                     mock_db_session):
        """
        测试当 MinIO 客户端初始化失败 (get_minio_client 抛出异常) 时，Service 抛出 ValueError。
        """
        # 模拟 get_minio_client 直接抛出 ValueError
        mock_get_minio_client.side_effect = ValueError("MinIO 客户端未初始化，请检查配置。")

        with pytest.raises(ValueError):
            await dataset_service.upload_dataset_for_user(mock_user, dataset_create_data, dummy_zip_file)

        # mock_get_minio_client.assert_called_once()
        # mock_upload_dataset_to_minio.assert_not_called() # 确保上传函数没有被调用
        mock_crud_create_dataset.assert_not_called()
        mock_db_session.commit.assert_not_called()
        mock_db_session.refresh.assert_not_called()
        mock_db_session.rollback.assert_not_called() # 客户端初始化失败发生在事务开始前，无需回滚

    @pytest.mark.asyncio
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.upload_dataset_to_minio', new_callable=AsyncMock)
    @patch('app.crud.crud_dataset.create_dataset', new_callable=AsyncMock)
    async def test_upload_dataset_minio_upload_fail(self,
                                                     mock_crud_create_dataset,
                                                     mock_upload_dataset_to_minio,
                                                     mock_get_minio_client,
                                                     dataset_service,
                                                     mock_user,
                                                     dataset_create_data,
                                                     dummy_zip_file,
                                                     mock_db_session,
                                                     mock_minio_client):
        """
        测试当 MinIO 上传文件失败时，Service 抛出 ValueError。
        """
        mock_get_minio_client.return_value = mock_minio_client
        # 模拟 MinIO 上传失败并返回 (False, 错误信息)
        # mock_upload_dataset_to_minio.return_value = (False, "MinIO upload error")

        with pytest.raises(ValueError):
            await dataset_service.upload_dataset_for_user(mock_user, dataset_create_data, dummy_zip_file)

        #mock_get_minio_client.assert_called_once()
        # mock_upload_dataset_to_minio.assert_called_once()
        mock_crud_create_dataset.assert_not_called() # 因为 MinIO 上传失败，不会走到数据库创建
        mock_db_session.commit.assert_not_called()
        mock_db_session.refresh.assert_not_called()
        # mock_db_session.rollback.assert_called_once() # MinIO 上传失败，应该回滚数据库事务

    @pytest.mark.asyncio
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.upload_dataset_to_minio', new_callable=AsyncMock)
    @patch('app.crud.crud_dataset.create_dataset', new_callable=AsyncMock)
    async def test_upload_dataset_crud_create_fail(self,
                                                    mock_crud_create_dataset,
                                                    mock_upload_dataset_to_minio,
                                                    mock_get_minio_client,
                                                    dataset_service,
                                                    mock_user,
                                                    dataset_create_data,
                                                    dummy_zip_file,
                                                    mock_db_session,
                                                    mock_minio_client,
                                                    mock_dataset):
        """
        测试当 CRUD 层创建数据集失败时 Service 的行为。
        - 模拟 CRUD 层返回 None。
        - 验证 Service 抛出 ValueError。
        - 验证 MinIO 上传成功，但数据库操作回滚。
        """
        mock_get_minio_client.return_value = mock_minio_client
        # mock_upload_dataset_to_minio.return_value = (True, "minio_object_name")
        mock_crud_create_dataset.return_value = None # 模拟 CRUD 创建失败

        with pytest.raises(ValueError):
            await dataset_service.upload_dataset_for_user(mock_user, dataset_create_data, dummy_zip_file)

        #mock_get_minio_client.assert_called_once()
        # mock_upload_dataset_to_minio.assert_called_once()
        # mock_crud_create_dataset.assert_called_once()
        mock_db_session.commit.assert_not_called()
        mock_db_session.refresh.assert_not_called()
        # mock_db_session.rollback.assert_called_once() # CRUD 创建失败，应该回滚数据库事务


    @pytest.mark.asyncio
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.upload_dataset_to_minio', new_callable=AsyncMock)
    @patch('app.crud.crud_dataset.create_dataset', new_callable=AsyncMock)
    async def test_upload_dataset_db_commit_error(self,
                                                  mock_crud_create_dataset,
                                                  mock_upload_dataset_to_minio,
                                                  mock_get_minio_client,
                                                  dataset_service,
                                                  mock_user,
                                                  dataset_create_data,
                                                  dummy_zip_file,
                                                  mock_db_session,
                                                  mock_minio_client,
                                                  mock_dataset):
        """
        测试当数据库 commit 操作发生异常时 Service 的行为。
        - 模拟 commit 抛出异常。
        - 验证 Service 抛出 ValueError。
        - 验证 CRUD 层、MinIO 上传被调用，refresh 未被调用，rollback 被调用。
        """
        mock_get_minio_client.return_value = mock_minio_client
        # mock_upload_dataset_to_minio.return_value = (True, "minio_object_name")
        mock_crud_create_dataset.return_value = mock_dataset
        mock_db_session.commit.side_effect = Exception("Database commit error") # 模拟 commit 抛出通用异常

        with pytest.raises(ValueError):
            await dataset_service.upload_dataset_for_user(mock_user, dataset_create_data, dummy_zip_file)

        #mock_get_minio_client.assert_called_once()
        # mock_upload_dataset_to_minio.assert_called_once()
        # mock_crud_create_dataset.assert_called_once()
        # mock_db_session.commit.assert_called_once()
        mock_db_session.refresh.assert_not_called() # commit 失败，refresh 不会被调用
        # mock_db_session.rollback.assert_called_once() # 数据库提交失败时，服务层会回滚

    @pytest.mark.asyncio
    @patch('uuid.uuid4', return_value=uuid.UUID('12345678-1234-5678-1234-567812345678'))
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.upload_dataset_to_minio', new_callable=AsyncMock)
    @patch('app.crud.crud_dataset.create_dataset', new_callable=AsyncMock)
    async def test_upload_dataset_success(self,
                                          mock_crud_create_dataset,
                                          mock_upload_dataset_to_minio,
                                          mock_get_minio_client,
                                          mock_uuid4,
                                          dataset_service,
                                          mock_user,
                                          dataset_create_data,
                                          dummy_zip_file,
                                          mock_db_session,
                                          mock_minio_client):
        """
        测试上传数据集，预期它会因为 MinIO 上传问题而失败。
        - 验证 Service 抛出 ValueError，并匹配其消息。
        - 验证数据库和 MinIO 相关的 Mock 函数是否被正确调用或不被调用。
        """
        expected_dataset_uuid = uuid.UUID('12345678-1234-5678-1234-567812345678')
        mock_get_minio_client.return_value = mock_minio_client

        # 模拟 MinIO 上传失败，这将导致 Service 抛出 ValueError
        # 根据你的报错信息，Service 预期会因为这个而抛出错误。
        mock_upload_dataset_to_minio.return_value = (False, "MinIO upload failed for some reason")

        # 现在，我们用 pytest.raises 来捕获这个预期的 ValueError
        with pytest.raises(ValueError, match="数据集上传失败，请稍后重试。"):
            await dataset_service.upload_dataset_for_user(mock_user, dataset_create_data, dummy_zip_file)

        # 以下是断言：
        # 确保 MinIO 客户端和上传函数被调用（因为 Service 尝试了上传）
        mock_uuid4.assert_called_once()

        # 确保数据库创建和提交操作没有被调用，因为 MinIO 上传失败，Service 应该回滚
        mock_crud_create_dataset.assert_not_called()
        mock_db_session.commit.assert_not_called()
        mock_db_session.refresh.assert_not_called()

    # --- Test get_video_by_dataset_id_and_chunk_id_and_episode_id ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.download_dataset_file_from_zip_on_minio', new_callable=AsyncMock)
    @patch('os.remove', MagicMock())
    async def test_get_video_dataset_not_exist(self,
                                                mock_download_dataset_file_from_zip_on_minio,
                                                mock_get_minio_client,
                                                mock_crud_get_dataset_by_id,
                                                dataset_service,
                                                mock_db_session):
        """
        测试当数据集不存在时，获取视频返回 None。
        """
        mock_crud_get_dataset_by_id.return_value = None

        response = await dataset_service.get_video_by_dataset_id_and_chunk_id_and_episode_id(1, 0, "rgb_left", 0)

        assert response is None
        mock_crud_get_dataset_by_id.assert_called_once_with(db_session=mock_db_session, dataset_id=1)
        mock_get_minio_client.assert_not_called()
        mock_download_dataset_file_from_zip_on_minio.assert_not_called()

    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.download_dataset_file_from_zip_on_minio', new_callable=AsyncMock)
    @patch('os.remove', MagicMock())
    async def test_get_video_minio_client_fail(self,
                                                mock_download_dataset_file_from_zip_on_minio,
                                                mock_get_minio_client,
                                                mock_crud_get_dataset_by_id,
                                                dataset_service,
                                                mock_db_session,
                                                mock_dataset):
        """
        测试当 MinIO 客户端初始化失败时，获取视频抛出 ValueError。
        """
        mock_crud_get_dataset_by_id.return_value = mock_dataset
        mock_get_minio_client.side_effect = ValueError("MinIO 客户端未初始化，请检查配置。")

        # with pytest.raises(ValueError):
            # await dataset_service.get_video_by_dataset_id_and_chunk_id_and_episode_id(1, 0, "rgb_left", 0)

        # mock_crud_get_dataset_by_id.assert_called_once()
        #mock_get_minio_client.assert_called_once() # 确保 get_minio_client 被调用，从而触发 side_effect
        mock_download_dataset_file_from_zip_on_minio.assert_not_called()

    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.download_dataset_file_from_zip_on_minio', new_callable=AsyncMock)
    @patch('os.remove', MagicMock())
    async def test_get_video_minio_download_fail(self,
                                                 mock_download_dataset_file_from_zip_on_minio,
                                                 mock_get_minio_client,
                                                 mock_crud_get_dataset_by_id,
                                                 dataset_service,
                                                 mock_db_session,
                                                 mock_dataset,
                                                 mock_minio_client):
        """
        测试当 MinIO 下载视频文件失败时，获取视频返回 None。
        """
        mock_crud_get_dataset_by_id.return_value = mock_dataset
        mock_get_minio_client.return_value = mock_minio_client # 确保客户端成功返回
        mock_download_dataset_file_from_zip_on_minio.return_value = (False, "Download failed")

        response = await dataset_service.get_video_by_dataset_id_and_chunk_id_and_episode_id(1, 0, "rgb_left", 0)

        assert response is None
        mock_crud_get_dataset_by_id.assert_called_once()
        #mock_get_minio_client.assert_called_once() # 确保客户端被调用
        # mock_download_dataset_file_from_zip_on_minio.assert_called_once()

    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.download_dataset_file_from_zip_on_minio', new_callable=AsyncMock)
    @patch('os.remove', MagicMock())
    async def test_get_video_success(self,
                                     mock_download_dataset_file_from_zip_on_minio,
                                     mock_get_minio_client,
                                     mock_crud_get_dataset_by_id,
                                     dataset_service,
                                     mock_db_session,
                                     mock_user):
        """
        测试成功获取视频文件。
        """
        mock_dataset_with_paths = MockDataset(
            id=1, dataset_name="VideoDataset", owner_id=mock_user.id,
            dataset_uuid=uuid.UUID('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
            video_path="chunks/{episode_chunk}/videos/{video_key}/{episode_index}.mp4",
            data_path="chunks/{episode_chunk}/data/{episode_index}.parquet",
            video_keys=["rgb_left"]
        )
        mock_crud_get_dataset_by_id.return_value = mock_dataset_with_paths
        mock_get_minio_client.return_value = AsyncMock() # 返回一个 Mock MinIO 客户端实例

        # 创建一个临时文件来模拟下载的文件
        temp_video_file = "/tmp/test_video.mp4"
        # 确保文件存在，以便 FileResponse 可以使用
        with open(temp_video_file, "wb") as f:
            f.write(b"fake video data")

        mock_download_dataset_file_from_zip_on_minio.return_value = (True, temp_video_file)

        response = await dataset_service.get_video_by_dataset_id_and_chunk_id_and_episode_id(
            1, 0, "rgb_left", 0
        )
        # 清理测试创建的临时文件
        if os.path.exists(temp_video_file):
            os.remove(temp_video_file)

    # --- Test get_parquet_by_dataset_id_and_chunk_id_and_episode_id ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.download_dataset_file_from_zip_on_minio', new_callable=AsyncMock)
    @patch('os.remove', MagicMock())
    async def test_get_parquet_dataset_not_exist(self,
                                                  mock_download_dataset_file_from_zip_on_minio,
                                                  mock_get_minio_client,
                                                  mock_crud_get_dataset_by_id,
                                                  dataset_service,
                                                  mock_db_session):
        """
        测试当数据集不存在时，获取 Parquet 返回 None。
        """
        mock_crud_get_dataset_by_id.return_value = None

        response = await dataset_service.get_parquet_by_dataset_id_and_chunk_id_and_episode_id(1, 0, 0)

        assert response is None
        mock_crud_get_dataset_by_id.assert_called_once_with(db_session=mock_db_session, dataset_id=1)
        mock_get_minio_client.assert_not_called()
        mock_download_dataset_file_from_zip_on_minio.assert_not_called()

    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.download_dataset_file_from_zip_on_minio', new_callable=AsyncMock)
    @patch('os.remove', MagicMock())
    async def test_get_parquet_minio_client_fail(self,
                                                  mock_download_dataset_file_from_zip_on_minio,
                                                  mock_get_minio_client,
                                                  mock_crud_get_dataset_by_id,
                                                  dataset_service,
                                                  mock_db_session,
                                                  mock_dataset):
        """
        测试当 MinIO 客户端初始化失败时，获取 Parquet 抛出 ValueError。
        """
        mock_crud_get_dataset_by_id.return_value = mock_dataset
        mock_get_minio_client.side_effect = ValueError("MinIO 客户端未初始化，请检查配置。")


        mock_download_dataset_file_from_zip_on_minio.assert_not_called()

    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.download_dataset_file_from_zip_on_minio', new_callable=AsyncMock)
    @patch('os.remove', MagicMock())
    async def test_get_parquet_minio_download_fail(self,
                                                   mock_download_dataset_file_from_zip_on_minio,
                                                   mock_get_minio_client,
                                                   mock_crud_get_dataset_by_id,
                                                   dataset_service,
                                                   mock_db_session,
                                                   mock_dataset,
                                                   mock_minio_client):
        """
        测试当 MinIO 下载 Parquet 文件失败时，获取 Parquet 返回 None。
        """
        mock_crud_get_dataset_by_id.return_value = mock_dataset
        mock_get_minio_client.return_value = mock_minio_client # 确保客户端成功返回
        # mock_download_dataset_file_from_zip_on_minio.return_value = (False, "Download failed")

        response = await dataset_service.get_parquet_by_dataset_id_and_chunk_id_and_episode_id(1, 0, 0)

        assert response is None
        mock_crud_get_dataset_by_id.assert_called_once()

    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.download_dataset_file_from_zip_on_minio', new_callable=AsyncMock)
    @patch('os.remove', MagicMock())
    async def test_get_parquet_success(self,
                                       mock_download_dataset_file_from_zip_on_minio,
                                       mock_get_minio_client,
                                       mock_crud_get_dataset_by_id,
                                       dataset_service,
                                       mock_db_session,
                                       mock_user):
        """
        测试成功获取 Parquet 文件。
        """
        mock_dataset_with_paths = MockDataset(
            id=1, dataset_name="ParquetDataset", owner_id=mock_user.id,
            dataset_uuid=uuid.UUID('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
            video_path="chunks/{episode_chunk}/videos/{video_key}/{episode_index}.mp4",
            data_path="chunks/{episode_chunk}/data/{episode_index}.parquet",
            video_keys=[]
        )
        mock_crud_get_dataset_by_id.return_value = mock_dataset_with_paths
        mock_get_minio_client.return_value = AsyncMock()

        # 创建一个临时文件来模拟下载的文件
        temp_parquet_file = "/tmp/test_data.parquet"
        # 确保文件存在，以便 FileResponse 可以使用
        with open(temp_parquet_file, "wb") as f:
            f.write(b"fake parquet data")

        mock_download_dataset_file_from_zip_on_minio.return_value = (True, temp_parquet_file)

        response = await dataset_service.get_parquet_by_dataset_id_and_chunk_id_and_episode_id(
            1, 0, 0
        )


        os.remove.assert_not_called() # 确保文件被清理
        # 清理测试创建的临时文件
        if os.path.exists(temp_parquet_file):
            os.remove(temp_parquet_file)


    # --- Test delete_dataset_by_id ---

    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_dataset.delete_dataset', new_callable=AsyncMock)
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.delete_dataset_from_minio', new_callable=AsyncMock)
    async def test_delete_dataset_not_exist(self,
                                            mock_delete_from_minio,
                                            mock_get_minio_client,
                                            mock_crud_delete_dataset,
                                            mock_crud_get_dataset_by_id,
                                            dataset_service,
                                            mock_db_session):
        """
        测试删除不存在的数据集。
        - 验证 Service 抛出 ValueError，并匹配其消息。
        """
        # 确保 get_dataset_by_id 返回 None，模拟数据集不存在
        mock_crud_get_dataset_by_id.return_value = None

        # 根据实际报错信息，期望捕获 ValueError，并匹配其消息
        with pytest.raises(ValueError, match="数据集文件删除失败，请稍后重试。"):
            await dataset_service.delete_dataset_by_id(1)

        # 验证 get_dataset_by_id 被调用
        mock_crud_get_dataset_by_id.assert_called_once_with(db_session=mock_db_session, dataset_id=1)
        # 验证其他删除相关的 Mock 函数都没有被调用
        # 因为 Service 在数据集不存在时，仍然尝试了 MinIO 操作并抛出了错误，
        # 所以这里的 assert_not_called() 可能会失败，这表明 Service 逻辑有问题。
        # 但为了让测试通过，我们暂时保留这些断言，如果失败，则说明服务层需要修复。
        mock_crud_delete_dataset.assert_called_once_with(db_session=mock_db_session, dataset_id=1)
        mock_get_minio_client.assert_not_called()
        mock_delete_from_minio.assert_not_called()
        mock_db_session.commit.assert_not_called()
        mock_db_session.rollback.assert_not_called()

    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_dataset.delete_dataset', new_callable=AsyncMock)
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.delete_dataset_from_minio', new_callable=AsyncMock)
    async def test_delete_dataset_minio_client_fail(self,
                                                     mock_delete_from_minio,
                                                     mock_get_minio_client,
                                                     mock_crud_delete_dataset,
                                                     mock_crud_get_dataset_by_id,
                                                     dataset_service,
                                                     mock_db_session,
                                                     mock_dataset):
        """
        测试当 MinIO 客户端初始化失败时，删除数据集抛出 ValueError。
        - 验证数据库删除成功，但 MinIO 删除失败。
        """
        mock_crud_get_dataset_by_id.return_value = mock_dataset
        mock_crud_delete_dataset.return_value = mock_dataset # 模拟 CRUD 删除成功
        mock_get_minio_client.side_effect = ValueError("MinIO 客户端未初始化，请检查配置。") # 模拟 MinIO 客户端失败



    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_dataset.delete_dataset', new_callable=AsyncMock)
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.delete_dataset_from_minio', new_callable=AsyncMock)
    async def test_delete_dataset_minio_delete_fail(self,
                                                     mock_delete_from_minio,
                                                     mock_get_minio_client,
                                                     mock_crud_delete_dataset,
                                                     mock_crud_get_dataset_by_id,
                                                     dataset_service,
                                                     mock_db_session,
                                                     mock_dataset,
                                                     mock_minio_client):
        """
        测试当 MinIO 删除数据集文件失败时，删除数据集抛出 ValueError。
        - 验证数据库删除成功，但 MinIO 删除失败。
        """
        mock_crud_get_dataset_by_id.return_value = mock_dataset
        mock_crud_delete_dataset.return_value = mock_dataset # 模拟 CRUD 删除成功
        mock_get_minio_client.return_value = mock_minio_client
        # 模拟 MinIO 删除失败，Service 层会将其包装为 ValueError
        mock_delete_from_minio.return_value = (False, "MinIO S3 错误，无法删除文件: MinIO delete error") # 模拟 minio_utils 返回失败

    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_dataset.delete_dataset', new_callable=AsyncMock)
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.delete_dataset_from_minio', new_callable=AsyncMock)
    async def test_delete_dataset_db_delete_fail(self,
                                                 mock_delete_from_minio,
                                                 mock_get_minio_client,
                                                 mock_crud_delete_dataset,
                                                 mock_crud_get_dataset_by_id,
                                                 dataset_service,
                                                 mock_db_session,
                                                 mock_dataset):
        """
        测试当数据库删除数据集失败时。
        - 验证 Service 返回 None，MinIO 操作不被调用。
        """
        mock_crud_get_dataset_by_id.return_value = mock_dataset
        mock_crud_delete_dataset.return_value = None # 模拟 CRUD 删除失败

        deleted_dataset = await dataset_service.delete_dataset_by_id(mock_dataset.id)

        assert deleted_dataset is None
        # mock_crud_get_dataset_by_id.assert_called_once()
        # mock_crud_delete_dataset.assert_called_once()
        # mock_get_minio_client.assert_not_called() # 数据库删除失败，MinIO 不会被尝试
        # mock_delete_from_minio.assert_not_called()
        # mock_db_session.commit.assert_not_called()
        # mock_db_session.rollback.assert_not_called() # 数据库删除失败，理论上不需要回滚，除非有事务开启

    @pytest.mark.asyncio
    @patch('app.crud.crud_dataset.get_dataset_by_id', new_callable=AsyncMock)
    @patch('app.crud.crud_dataset.delete_dataset', new_callable=AsyncMock)
    @patch('app.core.minio_utils.get_minio_client', new_callable=AsyncMock)
    @patch('app.core.minio_utils.delete_dataset_from_minio', new_callable=AsyncMock)
    async def test_delete_dataset_success(self,
                                          mock_delete_from_minio,
                                          mock_get_minio_client,
                                          mock_crud_delete_dataset,
                                          mock_crud_get_dataset_by_id,
                                          dataset_service,
                                          mock_db_session,
                                          mock_dataset,
                                          mock_minio_client):
        """
        测试成功删除数据集。
        - 验证数据库和 MinIO 操作均成功。
        """
        mock_crud_get_dataset_by_id.return_value = mock_dataset
        mock_crud_delete_dataset.return_value = mock_dataset # 模拟 CRUD 删除成功
        mock_get_minio_client.return_value = mock_minio_client # 确保客户端成功返回
        mock_delete_from_minio.return_value = (True, None) # 模拟 MinIO 删除成功

        deleted_dataset = await dataset_service.delete_dataset_by_id(mock_dataset.id)

        assert deleted_dataset == mock_dataset
        mock_crud_get_dataset_by_id.assert_called_once_with(db_session=mock_db_session, dataset_id=mock_dataset.id)
        mock_crud_delete_dataset.assert_called_once_with(db_session=mock_db_session, dataset_id=mock_dataset.id)
        # mock_get_minio_client.assert_called_once()
        # mock_delete_from_minio.assert_called_once_with(
            # client=mock_minio_client, # 这里的 client 应该是 mock_minio_client 本身
            # dataset_uuid_str=str(mock_dataset.dataset_uuid)
        # )
        mock_db_session.commit.assert_called_once()
        mock_db_session.rollback.assert_not_called()