import pytest
from unittest.mock import AsyncMock, patch
from typing import Optional
from datetime import datetime, timezone

from app.models.user import AppUser
from app.schemas.user import UserCreate, UserCreateDB
from app.service.user import UserService

# 假设你的 AppUser, UserCreate, UserCreateDB, Dataset 等模型和 schema 定义如下
# 为了测试的完整性，这里重新定义一下，但在实际项目中这些应该从你的 app.models 和 app.schemas 导入

# --- 辅助类和 Mock 对象 ---
class MockAppUser:
    """一个简化的 AppUser Mock 对象"""
    def __init__(self, id: int, username: str, is_admin: bool, password_hash: str, created_at: datetime = None, last_login: datetime = None):
        self.id = id
        self.username = username
        self.is_admin = is_admin
        self.password_hash = password_hash
        self.created_at = created_at if created_at else datetime.now(timezone.utc)
        self.last_login = last_login
        self.owned_datasets = [] # 用于测试 get_datasets_owned_by_user

    def __eq__(self, other):
        if not isinstance(other, MockAppUser):
            return NotImplemented
        return self.id == other.id and self.username == other.username

class MockDataset:
    """一个简化的 Dataset Mock 对象"""
    def __init__(self, id: int, title: str, owner_id: int):
        self.id = id
        self.title = title
        self.owner_id = owner_id

# --- Pytest Fixtures ---

@pytest.fixture
def mock_db_session():
    """为 UserService 提供一个 AsyncMock 类型的 db_session"""
    session = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.flush = AsyncMock()
    session.add = AsyncMock()
    session.delete = AsyncMock()
    # 模拟 session.exec 的行为
    session.exec = AsyncMock()
    # 模拟 session.get 的行为
    session.get = AsyncMock(return_value=None) # 默认不返回任何用户，需要时在测试中设置

    # 模拟 SQLModel select().where().first() 的行为
    mock_result_first = AsyncMock()
    mock_result_first.first.return_value = None
    session.exec.return_value = mock_result_first

    # 模拟 SQLModel select().all() 的行为
    mock_result_all = AsyncMock()
    mock_result_all.all.return_value = []
    session.exec.return_value = mock_result_all
    
    return session

@pytest.fixture
def user_service(mock_db_session):
    """提供 UserService 实例"""
    return UserService(db_session=mock_db_session)

@pytest.fixture
def user_create_data():
    """提供一个 UserCreate 实例"""
    return UserCreate(username="testuser", password="plainpassword", is_admin=False)

@pytest.fixture
def user_create_db_data():
    """提供一个 UserCreateDB 实例 (带有哈希密码)"""
    return UserCreateDB(username="testuser", password_hash="hashed_password", is_admin=False)

@pytest.fixture
def mock_app_user():
    """提供一个 Mock 的 AppUser 实例"""
    return MockAppUser(id=1, username="testuser", is_admin=False, password_hash="hashed_password")

@pytest.fixture
def mock_admin_user():
    """提供一个 Mock 的管理员 AppUser 实例"""
    return MockAppUser(id=2, username="adminuser", is_admin=True, password_hash="admin_hashed_password")

# --- 测试用例 ---

class TestUserService:

    # --- Test create_new_user ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_user.get_user_by_username', new_callable=AsyncMock)
    @patch('app.crud.crud_user.create_user', new_callable=AsyncMock)
    @patch('app.service.user.get_password_hash', return_value="hashed_password")
    async def test_create_new_user_success(self, mock_get_password_hash, mock_create_user, mock_get_user_by_username, user_service, user_create_data, mock_db_session, mock_app_user):
        """测试成功创建新用户"""
        mock_get_user_by_username.return_value = None # 用户不存在
        mock_create_user.return_value = mock_app_user # 模拟 CRUD 层创建成功
        
        created_user = await user_service.create_new_user(user_create_data)
        
        # 断言 get_user_by_username 被正确调用
        mock_get_user_by_username.assert_called_once_with(mock_db_session, username=user_create_data.username)
        # 断言密码哈希函数被调用
        mock_get_password_hash.assert_called_once_with(user_create_data.password)
        
        # 断言 create_user 被正确调用，且传入了正确的 UserCreateDB 对象
        expected_user_create_db = UserCreateDB(
            username=user_create_data.username,
            is_admin=user_create_data.is_admin,
            password_hash="hashed_password"
        )
        mock_create_user.assert_called_once()
        # 检查传入 create_user 的对象是否与期望的 UserCreateDB 匹配
        call_args, _ = mock_create_user.call_args
        assert isinstance(call_args[1], UserCreateDB)
        assert call_args[1].username == expected_user_create_db.username
        assert call_args[1].is_admin == expected_user_create_db.is_admin
        assert call_args[1].password_hash == expected_user_create_db.password_hash

        # 断言数据库会话操作
        # mock_db_session.add.assert_called_once_with(mock_app_user) # 假设 create_user 在内部 add
        mock_db_session.commit.assert_called_once()
        mock_db_session.refresh.assert_called_once_with(mock_app_user) # 刷新新用户对象
        
        assert created_user == mock_app_user
        assert created_user.username == user_create_data.username

    @pytest.mark.asyncio
    @patch('app.crud.crud_user.get_user_by_username', new_callable=AsyncMock)
    @patch('app.crud.crud_user.create_user', new_callable=AsyncMock)
    @patch('app.core.security.get_password_hash', return_value="hashed_password")
    async def test_create_new_user_exists(self, mock_get_password_hash, mock_create_user, mock_get_user_by_username, user_service, user_create_data, mock_db_session, mock_app_user):
        """测试创建已存在用户时返回 None"""
        mock_get_user_by_username.return_value = mock_app_user # 用户已存在
        
        created_user = await user_service.create_new_user(user_create_data)
        
        mock_get_user_by_username.assert_called_once_with(mock_db_session, username=user_create_data.username)
        mock_get_password_hash.assert_not_called() # 用户已存在，不应进行密码哈希
        mock_create_user.assert_not_called() # 不应调用 CRUD 层创建用户
        mock_db_session.commit.assert_not_called() # 不应提交事务
        mock_db_session.refresh.assert_not_called() # 不应刷新
        
        assert created_user is None

    # --- Test get_user_by_username ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_user.get_user_by_username', new_callable=AsyncMock)
    async def test_get_user_by_username_found(self, mock_crud_get_user_by_username, user_service, mock_db_session, mock_app_user):
        """测试根据用户名找到用户"""
        mock_crud_get_user_by_username.return_value = mock_app_user
        
        user = await user_service.get_user_by_username("testuser")
        
        mock_crud_get_user_by_username.assert_called_once_with(mock_db_session, username="testuser")
        assert user == mock_app_user

    @pytest.mark.asyncio
    @patch('app.crud.crud_user.get_user_by_username', new_callable=AsyncMock)
    async def test_get_user_by_username_not_found(self, mock_crud_get_user_by_username, user_service, mock_db_session):
        """测试根据用户名未找到用户"""
        mock_crud_get_user_by_username.return_value = None
        
        user = await user_service.get_user_by_username("nonexistent_user")
        
        mock_crud_get_user_by_username.assert_called_once_with(mock_db_session, username="nonexistent_user")
        assert user is None

    # --- Test get_user_by_id ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_user.get_user_by_id', new_callable=AsyncMock)
    async def test_get_user_by_id_found(self, mock_crud_get_user_by_id, user_service, mock_db_session, mock_app_user):
        """测试根据 ID 找到用户"""
        mock_crud_get_user_by_id.return_value = mock_app_user
        
        user = await user_service.get_user_by_id(1)
        
        mock_crud_get_user_by_id.assert_called_once_with(mock_db_session, user_id=1)
        assert user == mock_app_user

    @pytest.mark.asyncio
    @patch('app.crud.crud_user.get_user_by_id', new_callable=AsyncMock)
    async def test_get_user_by_id_not_found(self, mock_crud_get_user_by_id, user_service, mock_db_session):
        """测试根据 ID 未找到用户"""
        mock_crud_get_user_by_id.return_value = None
        
        user = await user_service.get_user_by_id(999)
        
        mock_crud_get_user_by_id.assert_called_once_with(mock_db_session, user_id=999)
        assert user is None

    # --- Test get_all_users ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_user.get_all_users', new_callable=AsyncMock)
    async def test_get_all_users(self, mock_crud_get_all_users, user_service, mock_db_session, mock_app_user, mock_admin_user):
        """测试获取所有用户"""
        mock_crud_get_all_users.return_value = [mock_app_user, mock_admin_user]
        
        users = await user_service.get_all_users()
        
        mock_crud_get_all_users.assert_called_once_with(mock_db_session)
        assert len(users) == 2
        assert users[0] == mock_app_user
        assert users[1] == mock_admin_user

    @pytest.mark.asyncio
    @patch('app.crud.crud_user.get_all_users', new_callable=AsyncMock)
    async def test_get_all_users_empty(self, mock_crud_get_all_users, user_service, mock_db_session):
        """测试获取所有用户时返回空列表"""
        mock_crud_get_all_users.return_value = []
        
        users = await user_service.get_all_users()
        
        mock_crud_get_all_users.assert_called_once_with(mock_db_session)
        assert len(users) == 0
        assert users == []

    # --- Test datasets_owned_by_user ---
    @pytest.mark.asyncio
    @patch('app.crud.crud_user.get_datasets_owned_by_user', new_callable=AsyncMock)
    async def test_datasets_owned_by_user_found(self, mock_crud_get_datasets_owned_by_user, user_service, mock_db_session):
        """测试获取用户拥有的数据集，用户存在且有数据集"""
        mock_datasets = [MockDataset(id=1, title="Dataset A", owner_id=1), MockDataset(id=2, title="Dataset B", owner_id=1)]
        mock_crud_get_datasets_owned_by_user.return_value = mock_datasets
        
        datasets = await user_service.datasets_owned_by_user(1)
        
        mock_crud_get_datasets_owned_by_user.assert_called_once_with(mock_db_session, user_id=1)
        assert len(datasets) == 2
        assert datasets[0].title == "Dataset A"
        assert datasets[1].title == "Dataset B"

    @pytest.mark.asyncio
    @patch('app.crud.crud_user.get_datasets_owned_by_user', new_callable=AsyncMock)
    async def test_datasets_owned_by_user_no_datasets(self, mock_crud_get_datasets_owned_by_user, user_service, mock_db_session):
        """测试获取用户拥有的数据集，用户存在但没有数据集"""
        mock_crud_get_datasets_owned_by_user.return_value = []
        
        datasets = await user_service.datasets_owned_by_user(1)
        
        mock_crud_get_datasets_owned_by_user.assert_called_once_with(mock_db_session, user_id=1)
        assert len(datasets) == 0
        assert datasets == []

    # --- Test delete_user_by_username ---
    @pytest.mark.asyncio
    @patch('app.service.user.UserService.get_user_by_username', new_callable=AsyncMock)
    @patch('app.crud.crud_user.delete_user', new_callable=AsyncMock)
    async def test_delete_user_by_username_success(self, mock_crud_delete_user, mock_service_get_user_by_username, user_service, mock_db_session, mock_app_user):
        """测试根据用户名成功删除用户"""
        mock_service_get_user_by_username.return_value = mock_app_user # 模拟找到用户
        mock_crud_delete_user.return_value = mock_app_user # 模拟 CRUD 层删除成功
        
        deleted_user = await user_service.delete_user_by_username("testuser")
        
        mock_service_get_user_by_username.assert_called_once_with("testuser")
        mock_crud_delete_user.assert_called_once_with(mock_db_session, mock_app_user.id)
        mock_db_session.commit.assert_called_once()
        assert deleted_user == mock_app_user

    @pytest.mark.asyncio
    @patch('app.service.user.UserService.get_user_by_username', new_callable=AsyncMock)
    @patch('app.crud.crud_user.delete_user', new_callable=AsyncMock)
    async def test_delete_user_by_username_not_found(self, mock_crud_delete_user, mock_service_get_user_by_username, user_service, mock_db_session):
        """测试根据用户名删除用户，但用户不存在"""
        mock_service_get_user_by_username.return_value = None # 模拟未找到用户
        
        deleted_user = await user_service.delete_user_by_username("nonexistent_user")
        
        mock_service_get_user_by_username.assert_called_once_with("nonexistent_user")
        mock_crud_delete_user.assert_not_called() # 不应调用 CRUD 层删除
        mock_db_session.commit.assert_not_called() # 不应提交事务
        assert deleted_user is None