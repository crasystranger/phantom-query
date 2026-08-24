import uuid
import datetime

from app.db.database import SessionLocal
from app.db.models import QueryHistory


def log_query(user_id: str, connection_id: str, question: str, sql: str, row_count: int, duration_ms: int) -> None:
    db = SessionLocal()
    try:
        record = QueryHistory(
            id=str(uuid.uuid4()),
            user_id=user_id,
            connection_id=connection_id,
            question=question,
            sql=sql,
            row_count=row_count,
            duration_ms=duration_ms,
            executed_at=datetime.datetime.utcnow().isoformat(),
        )
        db.add(record)
        db.commit()
    finally:
        db.close()


def list_history(user_id: str, limit: int = 20) -> list[QueryHistory]:
    db = SessionLocal()
    try:
        return (
            db.query(QueryHistory)
            .filter(QueryHistory.user_id == user_id)
            .order_by(QueryHistory.executed_at.desc())
            .limit(limit)
            .all()
        )
    finally:
        db.close()


def get_stats(user_id: str) -> dict:
    db = SessionLocal()
    try:
        rows = db.query(QueryHistory).filter(QueryHistory.user_id == user_id).all()
        avg_duration = sum(r.duration_ms for r in rows) / len(rows) if rows else 0
        return {
            "queries_executed": len(rows),
            "total_rows_retrieved": sum(r.row_count for r in rows),
            "avg_duration_ms": round(avg_duration),
        }
    finally:
        db.close()