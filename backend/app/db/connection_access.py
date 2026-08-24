"""
Per-Connection Access Grants

Owns the ConnectionAccess table: who has been explicitly granted access to
an individual restricted connection.

This module deliberately only answers "is there a grant row" and mutates
grant rows. It does NOT decide whether a user can reach a connection --
that rule is app.permissions.can_access_connection(), which combines a
grant with the connection's access_level, the caller's workspace role, and
who created it. Keeping the rule out of here is what stops the access
policy drifting into two places.

Audit logging lives here rather than in the router, matching how
folders.py, saved_queries.py and workspaces.py already log right after
their own commit.
"""
import uuid
import datetime

from sqlalchemy.exc import IntegrityError

from app.db.database import SessionLocal
from app.db.models import ConnectionAccess, ConnectionRecord, User
from app.db.audit import log_action


def has_grant(connection_id: str, user_id: str) -> bool:
    db = SessionLocal()
    try:
        return db.query(ConnectionAccess).filter(
            ConnectionAccess.connection_id == connection_id,
            ConnectionAccess.user_id == user_id,
        ).first() is not None
    finally:
        db.close()


def granted_connection_ids(user_id: str, connection_ids: list[str]) -> set[str]:
    """Batch form of has_grant, for filtering a whole connection list.

    list_connections() would otherwise issue one grant query per connection;
    this keeps it at one query regardless of how many connections a
    workspace has.
    """
    if not connection_ids:
        return set()
    db = SessionLocal()
    try:
        rows = db.query(ConnectionAccess.connection_id).filter(
            ConnectionAccess.user_id == user_id,
            ConnectionAccess.connection_id.in_(connection_ids),
        ).all()
        return {r[0] for r in rows}
    finally:
        db.close()


def list_grants(connection_id: str) -> list[dict]:
    """Grants on one connection, joined to user details for display."""
    db = SessionLocal()
    try:
        grants = db.query(ConnectionAccess).filter(
            ConnectionAccess.connection_id == connection_id
        ).all()
        result = []
        for g in grants:
            user = db.query(User).filter(User.id == g.user_id).first()
            result.append({
                "user_id": g.user_id,
                "name": user.name if user else "Unknown",
                "email": user.email if user else "",
                "granted_by": g.granted_by,
                "created_at": g.created_at,
            })
        return result
    finally:
        db.close()


def grant_access(connection_id: str, target_user_id: str, granted_by: str) -> bool:
    """Grants access. Idempotent: re-granting an existing grant is a no-op
    and returns False, so the caller can avoid writing a duplicate audit
    entry for something that did not actually change.

    The unique constraint is caught rather than pre-checked, so two
    simultaneous grants cannot both pass a check-then-insert race.
    """
    db = SessionLocal()
    try:
        connection = db.query(ConnectionRecord).filter(
            ConnectionRecord.id == connection_id
        ).first()
        if connection is None:
            raise KeyError(f"No connection with id {connection_id}")

        workspace_id = connection.workspace_id
        connection_name = connection.name

        existing = db.query(ConnectionAccess).filter(
            ConnectionAccess.connection_id == connection_id,
            ConnectionAccess.user_id == target_user_id,
        ).first()
        if existing is not None:
            return False

        db.add(ConnectionAccess(
            id=str(uuid.uuid4()),
            connection_id=connection_id,
            user_id=target_user_id,
            granted_by=granted_by,
            created_at=datetime.datetime.utcnow().isoformat(),
        ))
        try:
            db.commit()
        except IntegrityError:
            # Lost a race against a concurrent identical grant. The end
            # state is the one the caller asked for, so this is not an error.
            db.rollback()
            return False

        target = db.query(User).filter(User.id == target_user_id).first()
        target_email = target.email if target else ""
    finally:
        db.close()

    log_action(
        workspace_id, granted_by, "connection.access_granted", "connection", connection_id,
        {
            "name": connection_name,
            "target_user_id": target_user_id,
            "target_email": target_email,
        },
    )
    return True


def revoke_access(connection_id: str, target_user_id: str, revoked_by: str) -> bool:
    """Revokes a grant. Returns False if there was nothing to revoke, so a
    no-op does not produce a misleading audit entry."""
    db = SessionLocal()
    try:
        connection = db.query(ConnectionRecord).filter(
            ConnectionRecord.id == connection_id
        ).first()
        if connection is None:
            raise KeyError(f"No connection with id {connection_id}")

        workspace_id = connection.workspace_id
        connection_name = connection.name

        existing = db.query(ConnectionAccess).filter(
            ConnectionAccess.connection_id == connection_id,
            ConnectionAccess.user_id == target_user_id,
        ).first()
        if existing is None:
            return False

        db.query(ConnectionAccess).filter(
            ConnectionAccess.connection_id == connection_id,
            ConnectionAccess.user_id == target_user_id,
        ).delete()
        db.commit()

        target = db.query(User).filter(User.id == target_user_id).first()
        target_email = target.email if target else ""
    finally:
        db.close()

    log_action(
        workspace_id, revoked_by, "connection.access_revoked", "connection", connection_id,
        {
            "name": connection_name,
            "target_user_id": target_user_id,
            "target_email": target_email,
        },
    )
    return True


def delete_grants_for_connection(connection_id: str) -> None:
    """Called when a connection is deleted, so grants don't outlive their
    connection as orphan rows that a recycled id could resurrect."""
    db = SessionLocal()
    try:
        db.query(ConnectionAccess).filter(
            ConnectionAccess.connection_id == connection_id
        ).delete()
        db.commit()
    finally:
        db.close()
