"""
Connection Manager

Connections belong to a workspace, not directly to a user. A user can
access a connection if they're a member of the workspace it belongs to,
and -- for restricted connections -- if they're also specifically granted
access, an owner/admin, or the connection's creator.

All database-engine-specific behavior (drivers, pooling, read-only
enforcement, timeouts) lives behind app.db.dialects -- this file only
orchestrates, it never talks to psycopg2/pymysql directly. This is what
lets new database types be added without touching this file's logic.

Safety note: Phantom Query does NOT assume the credentials it's given belong
to a read-only role. It defends in depth by forcing every session into
read-only mode at connect time, per-dialect.
"""
import uuid
import datetime
import logging

from app.security import encrypt_value, decrypt_value
from app.db.database import SessionLocal
from app.db.models import ConnectionRecord
from app.db.workspaces import is_member, get_role
from app.db.dialects import get_dialect
from app.db.audit import log_action
from app.db.connection_access import has_grant, granted_connection_ids, delete_grants_for_connection
from app.permissions import (
    ACCESS_TEAM, VALID_ACCESS_LEVELS, can_access_connection,
)

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self._pools: dict[str, object] = {}

    def add_connection(
        self, user_id: str, workspace_id: str, name: str, host: str, port: int,
        database: str, username: str, password: str, use_ssl: bool = False,
        db_type: str = "postgres", access_level: str = ACCESS_TEAM,
    ) -> ConnectionRecord:
        if not is_member(user_id, workspace_id):
            raise PermissionError("You are not a member of this workspace.")

        if access_level not in VALID_ACCESS_LEVELS:
            raise ValueError(f"Invalid access_level: {access_level!r}")

        self.test_connection(host, port, database, username, password, use_ssl, db_type)

        record = ConnectionRecord(
            id=str(uuid.uuid4()),
            user_id=user_id,
            workspace_id=workspace_id,
            name=name,
            host=host,
            port=port,
            database=database,
            username=username,
            encrypted_password=encrypt_value(password),
            use_ssl=use_ssl,
            db_type=db_type,
            access_level=access_level,
            created_at=datetime.datetime.utcnow().isoformat(),
        )

        db = SessionLocal()
        try:
            db.add(record)
            db.commit()
            db.refresh(record)
        finally:
            db.close()

        log_action(
            workspace_id, user_id, "connection.created", "connection", record.id,
            {"name": name, "host": host, "database": database, "db_type": db_type,
             "access_level": access_level},
        )

        return record

    def list_connections(self, user_id: str, workspace_id: str) -> list[ConnectionRecord]:
        role = get_role(user_id, workspace_id)
        if role is None:
            return []

        db = SessionLocal()
        try:
            all_records = db.query(ConnectionRecord).filter(
                ConnectionRecord.workspace_id == workspace_id
            ).all()

            # One batched lookup for this user's grants across every
            # restricted connection in the workspace, rather than a query
            # per connection -- avoids an N+1 as the connection list grows.
            restricted_ids = [r.id for r in all_records if r.access_level != ACCESS_TEAM]
            grants = granted_connection_ids(user_id, restricted_ids) if restricted_ids else set()

            return [
                r for r in all_records
                if can_access_connection(r.access_level, r.user_id, user_id, role, r.id in grants)
            ]
        finally:
            db.close()

    def get_connection(self, connection_id: str, user_id: str) -> ConnectionRecord:
        db = SessionLocal()
        try:
            record = db.query(ConnectionRecord).filter(
                ConnectionRecord.id == connection_id
            ).first()
            if record is None:
                raise KeyError(f"No connection with id {connection_id}")

            role = get_role(user_id, record.workspace_id)
            if role is None:
                raise KeyError(f"No connection with id {connection_id}")

            grant = (
                granted_connection_ids(user_id, [connection_id])
                if record.access_level != ACCESS_TEAM else set()
            )
            if not can_access_connection(record.access_level, record.user_id, user_id, role, grant):
                # Same KeyError as "doesn't exist" -- a user who can't see
                # a restricted connection shouldn't be able to distinguish
                # it from one that was never there (404, not 403).
                raise KeyError(f"No connection with id {connection_id}")

            return record
        finally:
            db.close()

    def delete_connection(self, connection_id: str, user_id: str) -> None:
        db = SessionLocal()
        try:
            record = db.query(ConnectionRecord).filter(
                ConnectionRecord.id == connection_id
            ).first()
            if record is None:
                return

            role = get_role(user_id, record.workspace_id)
            if role is None:
                return

            grant = (
                granted_connection_ids(user_id, [connection_id])
                if record.access_level != ACCESS_TEAM else set()
            )
            if not can_access_connection(record.access_level, record.user_id, user_id, role, grant):
                return

            # Capture details before deletion -- the audit log needs to
            # describe what was deleted, and the row won't exist to query
            # afterward.
            workspace_id = record.workspace_id
            name = record.name
            host = record.host

            if record.id in self._pools:
                dialect = get_dialect(record.db_type)
                dialect.close_pool(self._pools[record.id])
                del self._pools[record.id]
            db.query(ConnectionRecord).filter(ConnectionRecord.id == connection_id).delete()
            db.commit()
        finally:
            db.close()

        delete_grants_for_connection(connection_id)

        log_action(
            workspace_id, user_id, "connection.deleted", "connection", connection_id,
            {"name": name, "host": host},
        )

    def set_access_level(self, connection_id: str, user_id: str, new_level: str) -> ConnectionRecord:
        """Admin/owner-only -- enforced by the router dependency before this
        is ever called. Grants are left in place when switching back to
        "team" rather than deleted, so a round trip to "restricted" doesn't
        silently lose them.

        A no-op change is not audited, matching grant_access/revoke_access:
        an audit entry should mean something actually changed."""
        if new_level not in VALID_ACCESS_LEVELS:
            raise ValueError(f"Invalid access_level: {new_level!r}")

        db = SessionLocal()
        try:
            record = db.query(ConnectionRecord).filter(
                ConnectionRecord.id == connection_id
            ).first()
            if record is None:
                raise KeyError(f"No connection with id {connection_id}")

            old_level = record.access_level
            workspace_id = record.workspace_id
            name = record.name

            if old_level == new_level:
                return record

            record.access_level = new_level
            db.commit()
            db.refresh(record)
        finally:
            db.close()

        log_action(
            workspace_id, user_id, "connection.access_changed", "connection", connection_id,
            {"name": name, "old_level": old_level, "new_level": new_level},
        )

        return record

    def test_connection(self, host, port, database, username, password,
                         use_ssl: bool = False, db_type: str = "postgres") -> bool:
        dialect = get_dialect(db_type)
        try:
            conn = dialect.connect(host, port, database, username, password, use_ssl)
            conn.close()
            return True
        except Exception as e:
            logger.warning(f"Connection test failed for host {host} ({db_type}): {e}")
            raise ConnectionError("Could not connect to the database. Check your host, port, credentials, and SSL setting.")

    def _get_pool(self, stored: ConnectionRecord):
        if stored.id not in self._pools:
            dialect = get_dialect(stored.db_type)
            password = decrypt_value(stored.encrypted_password)
            self._pools[stored.id] = dialect.create_pool(
                minconn=1, maxconn=5,
                host=stored.host, port=stored.port, database=stored.database,
                username=stored.username, password=password, use_ssl=stored.use_ssl,
            )
        return self._pools[stored.id]

    def get_live_connection(self, connection_id: str, user_id: str, read_only: bool = True):
        stored = self.get_connection(connection_id, user_id)  # already access-checked
        dialect = get_dialect(stored.db_type)
        pool = self._get_pool(stored)
        conn = dialect.get_pooled_connection(pool)
        if read_only:
            dialect.enforce_read_only(conn)
        return conn

    def release_connection(self, connection_id: str, conn) -> None:
        if connection_id in self._pools:
            record = None
            db = SessionLocal()
            try:
                record = db.query(ConnectionRecord).filter(ConnectionRecord.id == connection_id).first()
            finally:
                db.close()
            if record:
                dialect = get_dialect(record.db_type)
                dialect.return_pooled_connection(self._pools[connection_id], conn)


connection_manager = ConnectionManager()