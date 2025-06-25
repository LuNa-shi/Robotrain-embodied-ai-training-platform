from passlib.context import CryptContext

# --- 密码哈希和验证 ---
# 使用 CryptContext 来管理密码哈希算法，这里推荐使用 bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    """
    对给定的密码进行哈希。
    Args:
        password (str): 要哈希的明文密码。
    Returns:
        str: 哈希后的密码字符串。
    """
    return pwd_context.hash(password)