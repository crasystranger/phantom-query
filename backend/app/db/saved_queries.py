import uuid
import datetime

from app.db.database import SessionLocal
from app.db.models import SavedQuery
from app.db.workspaces import is_member
from app.db.audit import log_action


def save_query(user_id: str, workspace_id: str, connection_id: str, name: str, question: str, sql: str) -> SavedQuery:
    if not is_member(user_id, workspace_id):
        raise PermissionError("You are not a member of this workspace.")

    db = SessionLocal()
    try:
        record = SavedQuery(
            id=str(uuid.uuid4()), user_id=user_id, workspace_id=workspace_id,
            connection_id=connection_id, name=name, question=question, sql=sql,
            created_at=datetime.datetime.utcnow().isoformat(),
        )
        db.add(record)
        db.commit()
        db.refresh(record)
    finally:
        db.close()

    log_action(
        workspace_id, user_id, "saved_query.created", "saved_query", record.id,
        {"name": name, "connection_id": connection_id},
    )

    return record


def list_saved_queries(user_id: str, workspace_id: str) -> list[SavedQuery]:
    if not is_member(user_id, workspace_id):
        return []
    db = SessionLocal()
    try:
        return db.query(SavedQuery).filter(SavedQuery.workspace_id == workspace_id).all()
    finally:
        db.close()


def delete_saved_query(query_id: str, user_id: str) -> None:
    db = SessionLocal()
    try:
        record = db.query(SavedQuery).filter(SavedQuery.id == query_id).first()
        if record is None:
            return
        if not is_member(user_id, record.workspace_id):
            return

        workspace_id = record.workspace_id
        name = record.name

        db.query(SavedQuery).filter(SavedQuery.id == query_id).delete()
        db.commit()
    finally:
        db.close()

    log_action(
        workspace_id, user_id, "saved_query.deleted", "saved_query", query_id,
        {"name": name},
    )