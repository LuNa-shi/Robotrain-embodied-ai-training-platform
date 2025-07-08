from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from typing import Optional
from passlib.context import CryptContext
from pydantic import BaseModel
from app.core.config import settings
from app.models.user import AppUser
from app.crud import crud_user
import jwt
from jwt.exceptions import InvalidTokenError
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi import Depends, HTTPException, status
from typing import Annotated
from app.core.deps import get_db
from sqlmodel.ext.asyncio.session import AsyncSession

#Token类
class Token(BaseModel):
    access_token: str
    token_type: str
    
class TokenData(BaseModel):
    username: str | None = None
    
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")
# --- 密码哈希和验证 ---
def get_password_hash(password: str) -> str:
    """
    对给定的密码进行哈希。
    Args:
        password (str): 要哈希的明文密码。
    Returns:
        str: 哈希后的密码字符串。
    """
    return pwd_context.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    """
    验证给定的密码是否与哈希后的密码匹配。
    """
    return pwd_context.verify(password, password_hash)

async def authenticate_user(
    db: AsyncSession,
    username: str,
    password: str
) -> Optional[AppUser]:
    """
    验证用户密码。
    """
    user: AppUser = await crud_user.get_user_by_username(db, username)
    if not user:
        return False
    if not verify_password(password, user.password_hash):
        return False
    return user

# --- JWT 相关 ---
def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, key=settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

# async def get_current_user(token: str = Depends(oauth2_scheme)):
async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)]
) -> AppUser:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload: dict = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except InvalidTokenError:
        raise credentials_exception
    user = await crud_user.get_user_by_username(db_session=db, username=token_data.username)
    if user is None:
        raise credentials_exception
    return user