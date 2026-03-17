import os
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext


pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def get_jwt_secret() -> str:
    secret = os.getenv("AUTH_JWT_SECRET")
    if not secret:
        raise RuntimeError("Missing AUTH_JWT_SECRET. Set it in your .env to enable auth.")
    return secret


def create_access_token(*, user_id: int, email: str, expires_in_days: int = 7) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=expires_in_days)).timestamp()),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm="HS256")


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, get_jwt_secret(), algorithms=["HS256"])

