from typing import Generator

from sqlmodel import create_engine, Session, SQLModel

from app.core.config import settings # 从 config.py 导入设置对象
# 导入所有模型以确保它们被 SQLModel 发现
from app.models.user import AppUser # 导入用户模型
                               # 如果你还有其他模型，也需要在这里导入或者在一个 __init__.py 中导入所有模型

# 数据库连接字符串直接从 settings 对象获取
# engine = create_engine(settings.DATABASE_URL, echo=settings.SQL_ECHO) # 可以直接这样写

# 如果想使用 AsyncEngine for async operations with FastAPI, you'd use create_async_engine
# For simplicity, stick to sync engine for now if you haven't set up async DB operations
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.SQL_ECHO,
    pool_recycle=3600 # 可选：用于解决 PostgreSQL 长期连接中断问题
)


def create_db_and_tables():
    """
    创建所有 SQLModel 定义的数据库表。
    这个函数通常在应用启动时（如 main.py 的 startup 事件）调用一次。
    """
    # 确保所有 SQLModel 模型都在这里或其导入链中被导入，以便 SQLModel 能够发现它们。
    # 例如，你的 app/models/__init__.py 可以导入所有模型文件。
    print("Creating database tables...")
    SQLModel.metadata.create_all(engine)
    print("Database tables created (if not already existing).")

def get_db() -> Generator[Session, None, None]:
    """
    一个依赖项生成器，用于在每个请求中提供一个数据库会话。
    它确保会话在使用完毕后关闭。
    """
    with Session(engine) as session:
        yield session