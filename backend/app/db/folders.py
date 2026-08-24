import uuid
import datetime

from app.db.database import SessionLocal
from app.db.models import Folder, ConnectionRecord
from app.db.workspaces import is_member
from app.db.audit import log_action


def create_folder(user_id: str, workspace_id: str, name: str, parent_id: str | None) -> Folder:
    if not is_member(user_id, workspace_id):
        raise PermissionError("You are not a member of this workspace.")

    db = SessionLocal()
    try:
        folder = Folder(
            id=str(uuid.uuid4()), workspace_id=workspace_id, name=name,
            parent_id=parent_id, created_at=datetime.datetime.utcnow().isoformat(),
        )
        db.add(folder)
        db.commit()
        db.refresh(folder)
    finally:
        db.close()

    log_action(
        workspace_id, user_id, "folder.created", "folder", folder.id,
        {"name": name, "parent_id": parent_id},
    )

    return folder


def list_folders(user_id: str, workspace_id: str) -> list[Folder]:
    if not is_member(user_id, workspace_id):
        return []
    db = SessionLocal()
    try:
        return db.query(Folder).filter(Folder.workspace_id == workspace_id).all()
    finally:
        db.close()


def delete_folder(folder_id: str, user_id: str) -> None:
    db = SessionLocal()
    try:
        folder = db.query(Folder).filter(Folder.id == folder_id).first()
        if folder is None or not is_member(user_id, folder.workspace_id):
            return

        # Capture details before deletion for the audit log.
        workspace_id = folder.workspace_id
        name = folder.name
        reassigned_count = db.query(ConnectionRecord).filter(
            ConnectionRecord.folder_id == folder_id
        ).count()

        # Un-file any connections directly in this folder, and re-parent any
        # child folders up to this folder's own parent, rather than cascading
        # a delete through the whole subtree.
        db.query(ConnectionRecord).filter(ConnectionRecord.folder_id == folder_id).update(
            {"folder_id": None}
        )
        db.query(Folder).filter(Folder.parent_id == folder_id).update(
            {"parent_id": folder.parent_id}
        )
        db.query(Folder).filter(Folder.id == folder_id).delete()
        db.commit()
    finally:
        db.close()

    log_action(
        workspace_id, user_id, "folder.deleted", "folder", folder_id,
        {"name": name, "reassigned_connections_count": reassigned_count},
    )


def move_connection(connection_id: str, user_id: str, folder_id: str | None) -> None:
    db = SessionLocal()
    try:
        conn = db.query(ConnectionRecord).filter(ConnectionRecord.id == connection_id).first()
        if conn is None or not is_member(user_id, conn.workspace_id):
            raise PermissionError("Connection not found or access denied.")

        workspace_id = conn.workspace_id
        name = conn.name
        from_folder_id = conn.folder_id

        conn.folder_id = folder_id
        db.commit()
    finally:
        db.close()

    log_action(
        workspace_id, user_id, "connection.moved", "connection", connection_id,
        {"name": name, "from_folder_id": from_folder_id, "to_folder_id": folder_id},
    )