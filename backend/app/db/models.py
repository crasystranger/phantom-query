from sqlalchemy import (
    Column, String, Integer, Boolean, CheckConstraint, UniqueConstraint,
)
from app.db.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(String, nullable=False)


class ConnectionRecord(Base):
    __tablename__ = "connections"

    # access_level values live in app.permissions.VALID_ACCESS_LEVELS. The
    # CHECK constraint is the last line of defence: an unrecognised value
    # would fall through can_access_connection()'s "team" branch and quietly
    # behave as restricted, which is the safe direction but still a bug.
    __table_args__ = (
        CheckConstraint(
            "access_level IN ('team', 'restricted')",
            name="ck_connections_access_level",
        ),
    )

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    workspace_id = Column(String, nullable=True, index=True)
    name = Column(String, nullable=False)
    host = Column(String, nullable=False)
    port = Column(Integer, nullable=False)
    database = Column(String, nullable=False)
    username = Column(String, nullable=False)
    encrypted_password = Column(String, nullable=False)
    created_at = Column(String, nullable=False)
    use_ssl = Column(Boolean, default=False, nullable =False)
    folder_id = Column(String, nullable=True, index=True)
    db_type = Column(String, nullable=False, default="postgres")
    # "team"       -- every workspace member can see and use this connection
    # "restricted" -- only admins, the creator, and explicitly granted users
    access_level = Column(
        String, nullable=False, default="team", server_default="team"
    )



class QueryHistory(Base):
    __tablename__ = "query_history"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    connection_id = Column(String, nullable=False)
    question = Column(String, nullable=False)
    sql = Column(String, nullable=False)
    row_count = Column(Integer, nullable=False)
    executed_at = Column(String, nullable=False)
    duration_ms = Column(Integer, nullable=False)

class Chat(Base):
    __tablename__ = "chats"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    workspace_id = Column(String, nullable=True, index=True)
    connection_id = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    created_at = Column(String, nullable=False)
    last_active_at = Column(String, nullable=False)


class ChatTurn(Base):
    __tablename__ = "chat_turns"

    id = Column(String, primary_key=True)
    chat_id = Column(String, nullable=False, index=True)
    question = Column(String, nullable=False)
    generated_sql = Column(String, nullable=False)
    edited_sql = Column(String, nullable=True)
    executed = Column(Boolean, default=False, nullable=False)
    row_count = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    model_used = Column(String, nullable=False)
    created_at = Column(String, nullable=False)

class TokenUsage(Base):
    __tablename__ = "token_usage"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    date = Column(String, nullable=False, index=True)  # "YYYY-MM-DD"
    prompt_tokens = Column(Integer, nullable=False, default=0)
    completion_tokens = Column(Integer, nullable=False, default=0)

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # "personal" | "team"
    owner_id = Column(String, nullable=False)
    created_at = Column(String, nullable=False)


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"

    # The role values live in app.permissions.VALID_ROLES. The CHECK
    # constraint is the last line of defence: application code should never
    # write anything else, but a typo in a future migration or a manual SQL
    # fix shouldn't be able to leave a membership in an unrecognised role
    # (which app.permissions.rank() would treat as no access at all).
    __table_args__ = (
        CheckConstraint(
            "role IN ('owner', 'admin', 'member')",
            name="ck_workspace_members_role",
        ),
    )

    id = Column(String, primary_key=True)
    workspace_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False)  # "owner" | "admin" | "member"
    joined_at = Column(String, nullable=False)

class SavedQuery(Base):
    __tablename__ = "saved_queries"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    workspace_id = Column(String, nullable=False, index=True)
    connection_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    question = Column(String, nullable=False)
    sql = Column(String, nullable=False)
    created_at = Column(String, nullable=False)

class ConnectionAccess(Base):
    """An explicit grant of access to a single restricted connection.

    Rows only matter when the connection's access_level is "restricted";
    they are harmless (and ignored) on a "team" connection, which means
    flipping a connection back to team and then to restricted again
    preserves whatever grants were already there rather than silently
    losing them.

    Grants are per-connection, and a connection belongs to exactly one
    workspace, so a grant can never leak across workspaces.
    """

    __tablename__ = "connection_access"

    # One grant per (connection, user). Makes granting idempotent at the
    # database level instead of relying on the application to check first.
    __table_args__ = (
        UniqueConstraint(
            "connection_id", "user_id", name="uq_connection_access_connection_user"
        ),
    )

    id = Column(String, primary_key=True)
    connection_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    granted_by = Column(String, nullable=False)
    created_at = Column(String, nullable=False)


class Folder(Base):
    __tablename__ = "folders"
    id = Column(String, primary_key=True)
    workspace_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    parent_id = Column(String, nullable=True, index=True)
    created_at = Column(String, nullable=False)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True)
    workspace_id = Column(String, nullable=False, index=True)
    actor_user_id = Column(String, nullable=False, index=True)
    action = Column(String, nullable=False, index=True)
    target_type = Column(String, nullable=False)
    target_id = Column(String, nullable=True)
    metadata_json = Column(String, nullable=True)
    created_at = Column(String, nullable=False, index=True)

