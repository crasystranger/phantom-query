from fastapi import Header, HTTPException
from jose import JWTError

from app.security import decode_access_token


def get_current_user_id(authorization: str = Header(...)) -> str:
    """Expects a header like: Authorization: Bearer <token>"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        return decode_access_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")