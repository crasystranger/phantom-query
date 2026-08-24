from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user_id
from app.db.database import SessionLocal
from app.db.models import User
from app.schemas import UserProfileOut
from app.db.token_usage import get_today_usage
from app.schemas import ChangePasswordRequest
from app.security import hash_password, verify_password
from app.db.workspaces import get_personal_workspace_id
from app.db.audit import log_action

router = APIRouter(prefix="/api/user", tags=["user"])


@router.get("/profile", response_model=UserProfileOut)
def get_profile(user_id: str = Depends(get_current_user_id)):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")
        return UserProfileOut(id=user.id, name=user.name, email=user.email, created_at=user.created_at)
    finally:
        db.close()


@router.get("/usage")
def get_usage(user_id: str = Depends(get_current_user_id)):
    return get_today_usage(user_id)


@router.post("/change-password")
def change_password(payload: ChangePasswordRequest, user_id: str = Depends(get_current_user_id)):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")

        if not verify_password(payload.current_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")

        if len(payload.new_password) < 8:
            raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")

        user.hashed_password = hash_password(payload.new_password)
        db.commit()
    finally:
        db.close()

    try:
        personal_workspace_id = get_personal_workspace_id(user_id)
        log_action(personal_workspace_id, user_id, "auth.password_changed", "user", user_id, {})
    except KeyError:
        pass

    return {"status": "changed"}