"""
Audit Log

Records who did what, to what, and when, per workspace. This is deliberately
NOT middleware-based -- each mutation point calls log_action() explicitly,
right after its own db.commit(), so the log captures real, meaningful
context (e.g. a connection's name before it's deleted) rather than generic
request metadata. Explicit calls also make it obvious, reading any given
piece of code, whether that action is audited.
"""
import uuid
import json
import datetime

from app.db.database import SessionLocal
from app.db.models import AuditLog


def log_action(
    workspace_id: str,
    actor_user_id: str,
    action: str,
    target_type: str,
    target_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Fire-and-forget: failures here should never break the actual
    mutation that triggered them, so this deliberately swallows errors
    rather than letting a logging failure cascade into a user-facing 500."""
    db = SessionLocal()
    try:
        entry = AuditLog(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            metadata_json=json.dumps(metadata) if metadata else None,
            created_at=datetime.datetime.utcnow().isoformat(),
        )
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def list_audit_logs(
    workspace_id: str,
    action_filter: str | None = None,
    limit: int = 100,
) -> list[AuditLog]:
    db = SessionLocal()
    try:
        query = db.query(AuditLog).filter(AuditLog.workspace_id == workspace_id)
        if action_filter:
            query = query.filter(AuditLog.action == action_filter)
        return query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    finally:
        db.close()