from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet
from jose import jwt, JWTError


from app.config import settings

import bcrypt



_JWT_ALGORITHM = "HS256"
_JWT_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days


def _get_fernet() -> Fernet:
    key = settings.credential_encryption_key
    if not key:
        raise RuntimeError(
            "CREDENTIAL_ENCRYPTION_KEY is not set. Check your .env file."
        )
    return Fernet(key.encode())


def encrypt_value(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    return _get_fernet().decrypt(ciphertext.encode()).decode()


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(user_id: str) -> str:
    if not settings.jwt_secret_key:
        raise RuntimeError("JWT_SECRET_KEY is not set. Check your .env file.")
    expire = datetime.now(timezone.utc) + timedelta(minutes=_JWT_EXPIRE_MINUTES)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=_JWT_ALGORITHM)


def decode_access_token(token: str) -> str:
    """Returns the user_id encoded in the token, or raises JWTError if invalid/expired."""
    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[_JWT_ALGORITHM])
    user_id = payload.get("sub")
    if user_id is None:
        raise JWTError("Token missing subject")
    return user_id