import { useState } from "react";
import type { Connection, SchemaSnapshot, Chat, SavedQuery } from "../type";
import {
  Activity, Bookmark, ChevronRight, Database, Key, Link2, Lock, MessageSquarePlus,
  MoreHorizontal, Plus, ShieldCheck, Table2, Trash2, Users, X,
} from "lucide-react";
import { api } from "../api/client";
import { Badge, Button, Menu, MenuItem, MenuSeparator, StatusIndicator } from "./ui";

interface Props {
  connections: Connection[];
  activeConnectionId: string | null;
  schema: SchemaSnapshot | null;
  chats: Chat[];
  activeChatId: string | null;
  savedQueries: SavedQuery[];
  connectionsLoading: boolean;
  onSelectConnection: (id: string) => void;
  onNewConnection: () => void;
  onDeleteConnection: (id: string) => void;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onOpenSavedQuery: (q: SavedQuery) => void;
  onDeleteSavedQuery: (id: string) => void;
  /** Admin or owner in the active workspace. Controls whether the "Manage
   *  access" menu item is offered -- the backend refuses it regardless. */
  canManageAccess: boolean;
  onManageConnectionAccess: (connection: Connection) => void;
}

/**
 * The workspace navigation rail. Four stacked sections, always in the same
 * order, so the answer to "where am I" never moves:
 *
 *   Databases -- what you can query
 *   Chats     -- conversations against the selected database
 *   Saved     -- questions worth keeping
 *   Schema    -- what the selected database actually contains
 *
 * Chats and Schema appear only once a database is selected, because neither
 * means anything without one.
 */
export default function Sidebar({
  connections, activeConnectionId, schema, activeChatId, chats, savedQueries,
  connectionsLoading, onSelectConnection, onNewConnection, onDeleteConnection,
  onSelectChat, onNewChat, onOpenSavedQuery, onDeleteSavedQuery,
  canManageAccess, onManageConnectionAccess,
}: Props) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <nav className="flex-1 overflow-y-auto min-h-0 px-2 py-3 space-y-5" aria-label="Workspace">
        {/* -------------------------------------------------- Databases -- */}
        <section>
          <SidebarHeading
            action={
              <IconAction label="Add a database connection" onClick={onNewConnection}>
                <Plus size={14} />
              </IconAction>
            }
          >
            Databases
          </SidebarHeading>

          {connectionsLoading ? (
            <div className="space-y-1.5 px-1" aria-hidden>
              <div className="skeleton h-11 rounded-md" />
              <div className="skeleton h-11 rounded-md" />
            </div>
          ) : connections.length === 0 ? (
            <div className="mx-1 rounded-lg border border-dashed border-line px-3 py-4 text-center">
              <p className="text-xs text-muted leading-relaxed">No databases connected yet.</p>
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus size={13} />}
                onClick={onNewConnection}
                className="mt-2.5"
              >
                Connect a database
              </Button>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {connections.map((c) => (
                <li key={c.id}>
                  <ConnectionRow
                    connection={c}
                    isActive={activeConnectionId === c.id}
                    onSelect={() => onSelectConnection(c.id)}
                    onDelete={() => onDeleteConnection(c.id)}
                    canManageAccess={canManageAccess}
                    onManageAccess={() => onManageConnectionAccess(c)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ------------------------------------------------------ Chats -- */}
        {activeConnectionId && (
          <section>
            <SidebarHeading
              action={
                <IconAction label="Start a new chat" onClick={onNewChat}>
                  <MessageSquarePlus size={14} />
                </IconAction>
              }
            >
              Chats
            </SidebarHeading>

            {chats.length === 0 ? (
              <p className="px-3 py-1.5 text-xs text-faint">
                No chats yet. Start one to ask a question.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {chats.map((chat) => {
                  const isActive = activeChatId === chat.id;
                  return (
                    <li key={chat.id}>
                      <button
                        onClick={() => onSelectChat(chat.id)}
                        aria-current={isActive ? "page" : undefined}
                        className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                          isActive
                            ? "bg-accent/10 text-primary"
                            : "text-secondary hover:bg-hover hover:text-primary"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {isActive && (
                            <span className="w-1 h-3.5 rounded-full bg-accent shrink-0" aria-hidden />
                          )}
                          <span className="truncate text-sm">{chat.title}</span>
                        </span>
                        <span className="block text-[11px] text-faint mt-0.5">
                          {relativeDay(chat.last_active_at)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* ------------------------------------------------------ Saved -- */}
        <section>
          <SidebarHeading>Saved queries</SidebarHeading>
          {savedQueries.length === 0 ? (
            <p className="px-3 py-1.5 text-xs text-faint">
              Save a question from a chat to reuse it later.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {savedQueries.map((q) => (
                <li key={q.id}>
                  <SavedQueryRow
                    query={q}
                    onOpen={() => onOpenSavedQuery(q)}
                    onDelete={() => onDeleteSavedQuery(q.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ----------------------------------------------------- Schema -- */}
        {schema && schema.tables.length > 0 && (
          <section>
            <SidebarHeading>
              {`Schema · ${schema.tables.length} table${schema.tables.length !== 1 ? "s" : ""}`}
            </SidebarHeading>
            <ul>
              {schema.tables.map((t) => (
                <li key={t.table_name}>
                  <details className="group">
                    <summary className="flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer list-none text-sm text-secondary hover:bg-hover hover:text-primary transition-colors">
                      <ChevronRight
                        size={12}
                        className="text-faint group-open:rotate-90 transition-transform shrink-0"
                        aria-hidden
                      />
                      <Table2 size={12} className="text-faint shrink-0" aria-hidden />
                      <span className="font-mono text-xs truncate">{t.table_name}</span>
                    </summary>
                    <ul className="pl-8 pr-3 pt-1 pb-1.5 space-y-1">
                      {t.columns.map((col) => (
                        <li key={col.name} className="flex items-baseline gap-2 text-[11px] font-mono">
                          <span className="text-secondary truncate">{col.name}</span>
                          <span className="text-faint truncate">{col.data_type}</span>
                          {col.is_primary_key && (
                            <span className="flex items-center gap-0.5 text-warn shrink-0" title="Primary key">
                              <Key size={9} aria-hidden /> PK
                            </span>
                          )}
                          {col.is_foreign_key && (
                            <span
                              className="flex items-center gap-0.5 text-info shrink-0"
                              title={col.references ? `References ${col.references}` : "Foreign key"}
                            >
                              <Link2 size={9} aria-hidden /> FK
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        )}
      </nav>

      <div className="shrink-0 border-t border-border-subtle px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[11px] text-faint">
          <ShieldCheck size={12} className="text-accent shrink-0" aria-hidden />
          Read-only sessions, always
        </p>
      </div>
    </div>
  );
}

function SidebarHeading({
  action, children,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 mb-1.5 h-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-faint truncate">
        {children}
      </h2>
      {action}
    </div>
  );
}

function IconAction({
  label, onClick, children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-faint hover:text-primary hover:bg-hover transition-colors"
    >
      {children}
    </button>
  );
}

function ConnectionRow({
  connection, isActive, onSelect, onDelete, canManageAccess, onManageAccess,
}: {
  connection: Connection;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  canManageAccess: boolean;
  onManageAccess: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<{
    healthy: boolean; version: string | null; latency_ms: number | null;
    ssl_enabled: boolean | null; error: string | null;
  } | null>(null);

  async function handleCheckHealth() {
    setChecking(true);
    setHealth(null);
    try {
      setHealth(await api.checkConnectionHealth(connection.id));
    } catch (err) {
      setHealth({
        healthy: false, version: null, latency_ms: null, ssl_enabled: null,
        error: err instanceof Error ? err.message : "Could not reach this database.",
      });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div
      className={`group relative rounded-md transition-colors ${
        isActive ? "bg-accent/10" : "hover:bg-hover"
      }`}
    >
      <button
        onClick={onSelect}
        aria-current={isActive ? "true" : undefined}
        className="w-full text-left pl-3 pr-9 py-2 rounded-md"
      >
        <span className="flex items-center gap-1.5">
          {isActive && <span className="w-1 h-3.5 rounded-full bg-accent shrink-0" aria-hidden />}
          <Database
            size={13}
            className={`shrink-0 ${isActive ? "text-accent" : "text-faint"}`}
            aria-hidden
          />
          <span className={`truncate text-sm ${isActive ? "text-primary font-medium" : "text-secondary"}`}>
            {connection.name}
          </span>
          {connection.access_level === "restricted" && (
            <Lock size={10} className="text-warn shrink-0" aria-label="Restricted access" />
          )}
        </span>
        <span className="block text-[11px] text-faint truncate font-mono mt-0.5">
          {connection.database}@{connection.host}
        </span>
      </button>

      <div className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity">
        <Menu
          trigger={(props) => (
            <button
              {...props}
              aria-label={`Actions for ${connection.name}`}
              className="w-7 h-7 rounded flex items-center justify-center text-faint hover:text-primary hover:bg-hover transition-colors"
            >
              <MoreHorizontal size={15} />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<Activity size={14} />}
                disabled={checking}
                onClick={() => { close(); handleCheckHealth(); }}
              >
                {checking ? "Testing…" : "Test connection"}
              </MenuItem>
              {canManageAccess && (
                <MenuItem
                  icon={connection.access_level === "restricted" ? <Lock size={14} /> : <Users size={14} />}
                  onClick={() => { close(); onManageAccess(); }}
                >
                  Manage access
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem
                danger
                icon={<Trash2 size={14} />}
                onClick={() => {
                  close();
                  if (confirm(`Delete the connection "${connection.name}"? Chats that used it keep their history.`)) {
                    onDelete();
                  }
                }}
              >
                Delete connection
              </MenuItem>
            </>
          )}
        </Menu>
      </div>

      {(checking || health) && (
        <div className="mx-3 mb-2 px-2.5 py-2 rounded-md bg-raised border border-line animate-fade-in">
          {checking ? (
            <StatusIndicator tone="busy" label="Testing connection…" pulse />
          ) : health ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <StatusIndicator
                  tone={health.healthy ? "ok" : "danger"}
                  label={health.healthy ? "Reachable" : "Unreachable"}
                />
                <button
                  onClick={() => setHealth(null)}
                  aria-label="Dismiss connection test result"
                  className="text-faint hover:text-primary shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
              {health.healthy ? (
                <dl className="mt-1.5 space-y-0.5 text-[11px] text-faint">
                  <div className="flex justify-between gap-2">
                    <dt>Latency</dt>
                    <dd className="font-mono text-muted">{health.latency_ms}ms</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>SSL</dt>
                    <dd className="font-mono text-muted">{health.ssl_enabled ? "on" : "off"}</dd>
                  </div>
                  {health.version && (
                    <div className="truncate pt-0.5 text-muted" title={health.version}>
                      {health.version}
                    </div>
                  )}
                </dl>
              ) : (
                <p className="mt-1.5 text-[11px] text-danger/90 break-words">{health.error}</p>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SavedQueryRow({
  query, onOpen, onDelete,
}: {
  query: SavedQuery;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative rounded-md hover:bg-hover transition-colors">
      <button onClick={onOpen} className="w-full text-left pl-3 pr-9 py-2 rounded-md">
        <span className="flex items-center gap-1.5">
          <Bookmark size={12} className="text-accent shrink-0" aria-hidden />
          <span className="truncate text-sm text-secondary">{query.name}</span>
        </span>
        <span className="block text-[11px] text-faint truncate mt-0.5">{query.question}</span>
      </button>

      <div className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity">
        <Menu
          trigger={(props) => (
            <button
              {...props}
              aria-label={`Actions for saved query ${query.name}`}
              className="w-7 h-7 rounded flex items-center justify-center text-faint hover:text-primary hover:bg-hover transition-colors"
            >
              <MoreHorizontal size={15} />
            </button>
          )}
        >
          {(close) => (
            <MenuItem
              danger
              icon={<Trash2 size={14} />}
              onClick={() => {
                close();
                if (confirm(`Delete the saved query "${query.name}"?`)) onDelete();
              }}
            >
              Delete
            </MenuItem>
          )}
        </Menu>
      </div>
    </div>
  );
}

/** Exported so the header can label a connection the same way the rail does. */
export function AccessBadge({ level }: { level: Connection["access_level"] }) {
  return level === "restricted" ? (
    <Badge tone="warn" icon={<Lock size={9} />}>Restricted</Badge>
  ) : (
    <Badge tone="neutral" icon={<Users size={9} />}>Team</Badge>
  );
}

function relativeDay(isoString: string): string {
  const date = new Date(isoString + "Z");
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
