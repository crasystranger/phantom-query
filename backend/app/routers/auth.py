import uuid
import datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy.exc import IntegrityError

from app.schemas import SignUpRequest, LoginRequest, TokenResponse
from app.db.database import SessionLocal
from app.db.models import User
from app.security import hash_password, verify_password, create_access_token
from app.db.workspaces import create_personal_workspace, get_personal_workspace_id
from app.db.audit import log_action

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse)
def signup(payload: SignUpRequest):
    db = SessionLocal()
    try:
        user = User(
            id=str(uuid.uuid4()),
            email=payload.email.lower().strip(),
            name=payload.name,
            hashed_password=hash_password(payload.password),
            created_at=datetime.datetime.utcnow().isoformat(),
        )
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail="An account with this email already exists.")
        db.refresh(user)
    finally:
        db.close()

    create_personal_workspace(user.id)

    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user_id=user.id, name=user.name, email=user.email)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    finally:
        db.close()

    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(user.id)

    try:
        personal_workspace_id = get_personal_workspace_id(user.id)
        log_action(personal_workspace_id, user.id, "auth.login", "user", user.id, {})
    except KeyError:
        pass  # no personal workspace found -- shouldn't happen post-signup fix, but don't block login over it

    return TokenResponse(access_token=token, user_id=user.id, name=user.name, email=user.email)