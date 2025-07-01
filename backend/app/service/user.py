from typing import Optional
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.user import AppUser
from app.schemas.user import UserCreate, UserCreateDB
from app.crud import crud_user
from app.core.security import get_password_hash


class UserService:
    def __init__(self, db_session: AsyncSession): # 接收同步 Session
        self.db_session = db_session

    async def create_new_user(self, user_in: UserCreate) -> Optional[AppUser]:
        """
        创建新用户的业务逻辑。
        - 对密码进行哈希
        - 检查用户名是否已存在
        - 构建 UserCreateDB 对象
        - 调用 CRUD 层保存用户
        """
        # 1. 检查用户是否已存在 (业务逻辑)
        existing_user = await crud_user.get_user_by_username(self.db_session, username=user_in.username)
        if existing_user:
            print(f"用户名 '{user_in.username}' 已存在，无法创建新用户。")
            return None

        # 2. 对密码进行哈希 (业务逻辑)
        hashed_password = get_password_hash(user_in.password)

        # 3. 构建 UserCreateDB 对象传递给 CRUD 层
        # 使用 UserCreate 的字段和哈希后的密码
        user_create_db = UserCreateDB(
            username=user_in.username,
            is_admin=user_in.is_admin,
            password_hash=hashed_password
        )

        # 4. 调用 CRUD 层创建用户，现在传递 UserCreateDB 对象
        new_user = await crud_user.create_user(self.db_session, user_create_db)
        #提交事务
        await self.db_session.commit()
        # 刷新用户对象以获取最新数据
        await self.db_session.refresh(new_user)
        return new_user

    async def get_user_by_username(self, username: str) -> Optional[AppUser]:
        """根据用户名获取用户信息。
        直接调用 CRUD 层。
        """
        return await crud_user.get_user_by_username(self.db_session, username=username)

    async def datasets_owned_by_user(self, user_id: int):
        """
        获取用户拥有的数据集列表。
        直接调用 CRUD 层。
        """
        return await crud_user.get_datasets_owned_by_user(self.db_session, user_id=user_id)