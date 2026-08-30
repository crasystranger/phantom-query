import uuid
import datetime

from app.db.database import SessionLocal
from app.db.models import TokenUsage

DAILY_TOKEN_LIMIT = 15_000  # adjust as needed


def _today() -> str:
    return datetime.datetime.utcnow().strftime("%Y-%m-%d")


def record_usage(user_id: str, prompt_tokens: int, completion_tokens: int) -> None:
    db = SessionLocal()
    try:
        today = _today()
        row = (
            db.query(TokenUsage)
            .filter(TokenUsage.user_id == user_id, TokenUsage.date == today)
            .first()
        )
        if row is None:
            row = TokenUsage(
                id=str(uuid.uuid4()), user_id=user_id, date=today,
                prompt_tokens=0, completion_tokens=0,
            )
            db.add(row)
        row.prompt_tokens += prompt_tokens
        row.completion_tokens += completion_tokens
        db.commit()
    finally:
        db.close()


def get_today_usage(user_id: str) -> dict:
    db = SessionLocal()
    try:
        today = _today()
        row = (
            db.query(TokenUsage)
            .filter(TokenUsage.user_id == user_id, TokenUsage.date == today)
            .first()
        )
        total = (row.prompt_tokens + row.completion_tokens) if row else 0
        return {
            "date": today,
            "prompt_tokens": row.prompt_tokens if row else 0,
            "completion_tokens": row.completion_tokens if row else 0,
            "total_tokens": total,
            "daily_limit": DAILY_TOKEN_LIMIT,
            "remaining": max(0, DAILY_TOKEN_LIMIT - total),
        }
    finally:
        db.close()


def is_over_budget(user_id: str) -> bool:
    usage = get_today_usage(user_id)
    return usage["total_tokens"] >= usage["daily_limit"]