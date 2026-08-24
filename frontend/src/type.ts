/**
 * Per-connection access gate. Mirrors app/permissions.py.
 *   "team"       -- every workspace member can see and use it
 *   "restricted" -- admins, the creator, and explicitly granted users only
 */
export type AccessLevel = "team" | "restricted";

export interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  created_at: string;
  folder_id: string | null;
  db_type: string;
  access_level: AccessLevel;
}

export interface ConnectionGrant {
  user_id: string;
  name: string;
  email: string;
  granted_by: string;
  created_at: string;
}

export interface ConnectionAccess {
  connection_id: string;
  access_level: AccessLevel;
  grants: ConnectionGrant[];
}

export interface TableColumn {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  references: string | null;
}

export interface TableSchema {
  table_name: string;
  columns: TableColumn[];
}

export interface SchemaSnapshot {
  connection_id: string;
  tables: TableSchema[];
}

export interface NLQueryResponse {
  sql: string;
  explanation: string;
  tables_used: string[];
  confidence: number;
  warnings: string[];
}

export interface ValidationResult {
  is_safe: boolean;
  reasons: string[];
  sanitized_sql: string | null;
}

export interface ExecuteQueryResponse {
  columns: string[];
  rows: unknown[][];
  row_count: number;
  truncated: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  name: string;
  email: string;
}

export interface QueryHistoryItem {
  id: string;
  connection_id:string;
  question: string;
  sql: string;
  row_count: number;
  duration_ms: number;
  executed_at: string;
}

export interface Chat {
  id: string;
  connection_id: string;
  title: string;
  created_at: string;
  last_active_at: string;
}

export interface ChatTurn {
  id: string;
  chat_id: string;
  question: string;
  generated_sql: string;
  edited_sql: string | null;
  executed: boolean;
  row_count: number | null;
  duration_ms: number | null;
  model_used: string;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  type: "personal" | "team";
  owner_id: string;
  created_at: string;
}

/**
 * Owner > Admin > Member. Mirrors app/permissions.py on the backend.
 * The UI uses this to decide which controls to show; the server decides
 * whether the action is actually allowed.
 */
export type WorkspaceRole = "owner" | "admin" | "member";

/** Roles the role-management API accepts. "owner" is deliberately absent:
 *  ownership transfer is not a supported operation. */
export type AssignableRole = Exclude<WorkspaceRole, "owner">;

export interface WorkspaceMember {
  user_id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joined_at: string;
}

export interface SavedQuery {
  id: string;
  connection_id: string;
  name: string;
  question: string;
  sql: string;
  created_at: string;
}
export interface ConnectionHealth {
  healthy: boolean;
  version: string | null;
  latency_ms: number | null;
  ssl_enabled: boolean | null;
  error: string | null;
}

export interface Folder {
  id: string;
  workspace_id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}
export interface AuditLog {
  id: string;
  actor_user_id: string;
  actor_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}