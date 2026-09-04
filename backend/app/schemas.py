from typing import Optional, Any
from pydantic import BaseModel, Field


class ConnectionCreate(BaseModel):
    name: str = Field(..., description="Friendly name for this connection")
    host: str
    port: int = 5432
    database: str
    username: str
    password: str
    use_ssl: bool = False
    workspace_id: str
    db_type: str = "postgres"
    # "team" | "restricted" -- see app.permissions.VALID_ACCESS_LEVELS.
    # Defaults to team so existing clients that omit it keep the current
    # behaviour exactly.
    access_level: str = "team"


class ConnectionOut(BaseModel):
    id: str
    name: str
    host: str
    port: int
    database: str
    created_at: str
    folder_id: Optional[str] = None
    db_type: str = "postgres"
    access_level: str = "team"


class UpdateConnectionAccessRequest(BaseModel):
    # Validated against app.permissions.VALID_ACCESS_LEVELS in the router
    # rather than with a Literal, so the allowed set has one definition and
    # an invalid value comes back as a readable 400.
    access_level: str


class GrantConnectionAccessRequest(BaseModel):
    user_id: str


class ConnectionGrantOut(BaseModel):
    user_id: str
    name: str
    email: str
    granted_by: str
    created_at: str


class ConnectionAccessOut(BaseModel):
    """The full access picture for one connection, for the management UI."""
    connection_id: str
    access_level: str
    grants: list[ConnectionGrantOut]


class TableColumn(BaseModel):
    name: str
    data_type: str
    is_nullable: bool
    is_primary_key: bool = False
    is_foreign_key: bool = False
    references: Optional[str] = None


class TableSchema(BaseModel):
    table_name: str
    columns: list[TableColumn]


class SchemaSnapshot(BaseModel):
    connection_id: str
    tables: list[TableSchema]


class NLQueryRequest(BaseModel):
    connection_id: str
    question: str


class NLQueryResponse(BaseModel):
    sql: str
    explanation: str
    tables_used: list[str]
    confidence: float
    warnings: list[str] = []


class ValidationResult(BaseModel):
    is_safe: bool
    reasons: list[str] = []
    sanitized_sql: Optional[str] = None


class ExecuteQueryRequest(BaseModel):
    connection_id: str
    sql: str


class ExecuteQueryResponse(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    truncated: bool

class RetryQueryRequest(BaseModel):
    connection_id: str
    question: str
    failed_sql: str
    error_message: str

class SignUpRequest(BaseModel):
    email: str
    name: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    name: str
    email: str

class QueryHistoryOut(BaseModel):
    id: str
    connection_id: str
    question: str
    sql: str
    row_count: int
    duration_ms: int
    executed_at: str

class ExecuteQueryRequest(BaseModel):
    connection_id: str
    sql: str
    question: str | None = None


class ChatOut(BaseModel):
    id: str
    connection_id: str
    title: str
    created_at: str
    last_active_at: str


class ChatTurnOut(BaseModel):
    id: str
    chat_id: str
    kind: str                           # "query" | "message"
    author_user_id: Optional[str] = None
    author_name: Optional[str] = None   # resolved server-side
    question: str
    generated_sql: Optional[str] = None
    edited_sql: Optional[str] = None
    executed: bool
    row_count: Optional[int] = None
    duration_ms: Optional[int] = None
    model_used: Optional[str] = None
    created_at: str


class CreateChatRequest(BaseModel):
    connection_id: str
    workspace_id: str


class AddTurnRequest(BaseModel):
    question: str


class UpdateTurnRequest(BaseModel):
    edited_sql: Optional[str] = None
    executed: Optional[bool] = None
    row_count: Optional[int] = None
    duration_ms: Optional[int] = None

class SummarizeRequest(BaseModel):
    question: str
    sql: str
    columns: list[str]
    rows: list[list[Any]]


class SummarizeResponse(BaseModel):
    summary: str

class EditTurnRequest(BaseModel):
    question: str

class UserProfileOut(BaseModel):
    id: str
    name: str
    email: str
    created_at: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
class WorkspaceOut(BaseModel):
    id: str
    name: str
    type: str
    owner_id: str
    created_at: str


class CreateWorkspaceRequest(BaseModel):
    name: str


class InviteMemberRequest(BaseModel):
    email: str


class WorkspaceMemberOut(BaseModel):
    user_id: str
    name: str
    email: str
    role: str  # "owner" | "admin" | "member" -- see app.permissions
    joined_at: str


class UpdateMemberRoleRequest(BaseModel):
    # Validated against app.permissions.ASSIGNABLE_ROLES in the router rather
    # than with a Literal here, so the allowed set has exactly one definition
    # and an invalid value comes back as a 400 with a readable message.
    role: str


class ExplainRequest(BaseModel):
    sql: str


class ExplainResponse(BaseModel):
    explanation: str

class SavedQueryOut(BaseModel):
    id: str
    connection_id: str
    name: str
    question: str
    sql: str
    created_at: str


class SaveQueryRequest(BaseModel):
    connection_id: str
    workspace_id: str
    name: str
    question: str
    sql: str

class ConnectionHealthOut(BaseModel):
    healthy: bool
    version: str | None = None
    latency_ms: int | None = None
    ssl_enabled: bool | None = None
    error: str | None = None

class FolderOut(BaseModel):
    id: str
    workspace_id: str
    name: str
    parent_id: Optional[str] = None
    created_at: str


class CreateFolderRequest(BaseModel):
    workspace_id: str
    name: str
    parent_id: Optional[str] = None


class MoveConnectionRequest(BaseModel):
    folder_id: Optional[str] = None

class AuditLogOut(BaseModel):
    id: str
    actor_user_id: str
    actor_name: Optional[str] = None
    action: str
    target_type: str
    target_id: Optional[str] = None
    metadata: Optional[dict] = None
    created_at: str