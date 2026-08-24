import { useState } from "react";
import { type Connection, type SchemaSnapshot, type Chat, type SavedQuery, type Folder } from "../type";
import { Plus, MoreHorizontal, Trash2, ChevronRight, Key, Link2, Bookmark, Activity, X, FolderPlus, FolderOpen, Folder as FolderIcon, Lock, Users, ShieldCheck } from "lucide-react";
import { api } from "../api/client";

interface Props {
  connections: Connection[];
  activeConnectionId: string | null;
  schema: SchemaSnapshot | null;
  chats: Chat[];
  activeChatId: string | null;
  savedQueries: SavedQuery[];
  folders: Folder[];
  onSelectConnection: (id: string) => void;
  onNewConnection: () => void;
  onDeleteConnection: (id: string) => void;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onOpenSavedQuery: (q: SavedQuery) => void;
  onDeleteSavedQuery: (id: string) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveConnection: (connectionId: string, folderId: string | null) => void;
  /** Admin or owner in the active workspace. Controls whether the "Manage
   *  access" menu item is offered -- the backend refuses it regardless. */
  canManageAccess: boolean;
  onManageConnectionAccess: (connection: Connection) => void;
}

export default function Sidebar({
  connections,
  activeConnectionId,
  schema,
  activeChatId,
  chats,
  savedQueries,
  folders,
  onSelectConnection,
  onNewConnection,
  onDeleteConnection,
  onSelectChat,
  onNewChat,
  onOpenSavedQuery,
  onDeleteSavedQuery,
  onCreateFolder,
  onDeleteFolder,
  onMoveConnection,
  canManageAccess,
  onManageConnectionAccess,
}: Props) {
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const rootFolders = folders.filter((f) => f.parent_id === null);
  const unfiledConnections = connections.filter((c) => !c.folder_id);

  function handleCreateRootFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    onCreateFolder(newFolderName.trim(), null);
    setNewFolderName("");
    setCreatingFolder(false);
  }

  return (
    <aside className="w-72 shrink-0 border-r border-line bg-panel flex flex-col h-full">
      <div className="p-4 border-b border-line">
        <h1 className="font-mono text-sm text-slate-100">phantom_query</h1>
        <p className="text-xs text-slate-500 mt-0.5">read-only, always</p>
      </div>

      <div className="p-3 border-b border-line space-y-1.5">
        <button
          onClick={onNewConnection}
          className="w-full flex items-center gap-2 text-sm rounded-md border border-line bg-ink hover:border-accent/60 hover:text-accent-hover transition-colors px-3 py-2 text-left text-slate-300"
        >
          <Plus size={14} /> New connection
        </button>
        <button
          onClick={() => setCreatingFolder(true)}
          className="w-full flex items-center gap-2 text-xs rounded-md hover:bg-hover transition-colors px-3 py-1.5 text-left text-slate-500"
        >
          <FolderPlus size={13} /> New folder
        </button>
        {creatingFolder && (
          <form onSubmit={handleCreateRootFolder} className="px-1">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              autoFocus
              onBlur={() => !newFolderName && setCreatingFolder(false)}
              className="w-full rounded-md bg-ink border border-line px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60"
            />
          </form>
        )}
      </div>

      <div className="overflow-y-auto flex-1">
        <div className="px-3 pt-4 pb-1 text-[11px] uppercase tracking-wider text-slate-500">
          Connections
        </div>

        {rootFolders.map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            allFolders={folders}
            allConnections={connections}
            activeConnectionId={activeConnectionId}
            depth={0}
            onSelectConnection={onSelectConnection}
            onDeleteConnection={onDeleteConnection}
            onCreateFolder={onCreateFolder}
            onDeleteFolder={onDeleteFolder}
            onMoveConnection={onMoveConnection}
            canManageAccess={canManageAccess}
            onManageConnectionAccess={onManageConnectionAccess}
          />
        ))}

        {unfiledConnections.length === 0 && rootFolders.length === 0 && (
          <p className="px-3 py-2 text-xs text-slate-600">None yet.</p>
        )}
        {unfiledConnections.map((c) => (
          <ConnectionRow
            key={c.id}
            connection={c}
            allFolders={folders}
            isActive={activeConnectionId === c.id}
            onSelect={() => onSelectConnection(c.id)}
            onDelete={() => {
              if (confirm(`Delete connection "${c.name}"?`)) {
                onDeleteConnection(c.id);
              }
            }}
            onMove={(folderId) => onMoveConnection(c.id, folderId)}
            canManageAccess={canManageAccess}
            onManageAccess={() => onManageConnectionAccess(c)}
          />
        ))}

        {activeConnectionId && (
          <div className="mt-2">
            <div className="px-3 pt-4 pb-1 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">Recent chats</span>
              <button onClick={onNewChat} className="flex items-center gap-1 text-xs text-accent-hover hover:underline">
                <Plus size={12} /> New Chat
              </button>
            </div>
            {chats.length === 0 && (
              <p className="px-3 py-1 text-xs text-slate-600">No chats yet.</p>
            )}
            {chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={`w-full text-left px-3 py-2 text-sm border-l-2 transition-colors ${
                  activeChatId === chat.id
                    ? "border-accent bg-ink text-slate-100"
                    : "border-transparent text-slate-400 hover:bg-hover"
                }`}
              >
                <div className="truncate">{chat.title}</div>
                <div className="text-xs text-slate-600">{relativeDay(chat.last_active_at)}</div>
              </button>
            ))}
          </div>
        )}

        <div className="mt-2">
          <div className="px-3 pt-4 pb-1 text-[11px] uppercase tracking-wider text-slate-500">
            Saved
          </div>
          {savedQueries.length === 0 ? (
            <p className="px-3 py-1 text-xs text-slate-600">No saved queries yet.</p>
          ) : (
            savedQueries.map((q) => (
              <SavedQueryRow
                key={q.id}
                query={q}
                onOpen={() => onOpenSavedQuery(q)}
                onDelete={() => {
                  if (confirm(`Delete saved query "${q.name}"?`)) {
                    onDeleteSavedQuery(q.id);
                  }
                }}
              />
            ))
          )}
        </div>

        {schema && (
          <div className="mt-3">
            <div className="px-3 pt-4 pb-1 text-[11px] uppercase tracking-wider text-slate-500">
              Tables
            </div>
            {schema.tables.map((t) => (
              <details key={t.table_name} className="px-3 py-1.5 group">
                <summary className="text-sm text-slate-300 cursor-pointer list-none flex items-center gap-1.5">
                  <ChevronRight size={12} className="text-slate-600 group-open:rotate-90 transition-transform" />
                  <span className="font-mono">{t.table_name}</span>
                </summary>
                <div className="pl-5 pt-1.5 pb-1 space-y-0.5">
                  {t.columns.map((col) => (
                    <div key={col.name} className="text-xs text-slate-500 font-mono flex items-center gap-2">
                      <span className="text-slate-400">{col.name}</span>
                      <span>{col.data_type}</span>
                      {col.is_primary_key && (
                        <span className="flex items-center gap-0.5 text-warn">
                          <Key size={10} /> PK
                        </span>
                      )}
                      {col.is_foreign_key && (
                        <span className="flex items-center gap-0.5 text-accent-hover">
                          <Link2 size={10} /> FK
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function FolderNode({
  folder, allFolders, allConnections, activeConnectionId, depth,
  onSelectConnection, onDeleteConnection, onCreateFolder, onDeleteFolder, onMoveConnection,
  canManageAccess, onManageConnectionAccess,
}: {
  folder: Folder;
  allFolders: Folder[];
  allConnections: Connection[];
  activeConnectionId: string | null;
  depth: number;
  onSelectConnection: (id: string) => void;
  onDeleteConnection: (id: string) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveConnection: (connectionId: string, folderId: string | null) => void;
  canManageAccess: boolean;
  onManageConnectionAccess: (connection: Connection) => void;
}) {
  const [open, setOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [creatingSubfolder, setCreatingSubfolder] = useState(false);
  const [newSubfolderName, setNewSubfolderName] = useState("");

  const childFolders = allFolders.filter((f) => f.parent_id === folder.id);
  const childConnections = allConnections.filter((c) => c.folder_id === folder.id);

  function handleCreateSubfolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubfolderName.trim()) return;
    onCreateFolder(newSubfolderName.trim(), folder.id);
    setNewSubfolderName("");
    setCreatingSubfolder(false);
  }

  return (
    <div>
      <div
        className="group relative flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-300 hover:bg-hover rounded-md transition-colors"
        style={{ paddingLeft: `${12 + depth * 14}px` }}
      >
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 flex-1 min-w-0">
          <ChevronRight size={12} className={`text-slate-600 transition-transform shrink-0 ${open ? "rotate-90" : ""}`} />
          {open ? <FolderOpen size={13} className="text-accent-hover shrink-0" /> : <FolderIcon size={13} className="text-slate-500 shrink-0" />}
          <span className="truncate">{folder.name}</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="text-slate-600 hover:text-slate-300 p-1 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity shrink-0"
        >
          <MoreHorizontal size={14} />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-2 top-7 z-50 bg-elevated border border-line rounded-md shadow-lg py-1 min-w-36">
              <button
                onClick={() => { setMenuOpen(false); setCreatingSubfolder(true); setOpen(true); }}
                className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-secondary hover:bg-hover"
              >
                <FolderPlus size={14} /> New subfolder
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  if (confirm(`Delete folder "${folder.name}"? Connections inside will become unfiled.`)) {
                    onDeleteFolder(folder.id);
                  }
                }}
                className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-danger hover:bg-hover"
              >
                <Trash2 size={14} /> Delete folder
              </button>
            </div>
          </>
        )}
      </div>

      {open && (
        <div>
          {creatingSubfolder && (
            <form onSubmit={handleCreateSubfolder} style={{ paddingLeft: `${26 + depth * 14}px` }} className="pr-3 py-1">
              <input
                type="text"
                value={newSubfolderName}
                onChange={(e) => setNewSubfolderName(e.target.value)}
                placeholder="Folder name"
                autoFocus
                onBlur={() => !newSubfolderName && setCreatingSubfolder(false)}
                className="w-full rounded-md bg-ink border border-line px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60"
              />
            </form>
          )}
          {childFolders.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              allFolders={allFolders}
              allConnections={allConnections}
              activeConnectionId={activeConnectionId}
              depth={depth + 1}
              onSelectConnection={onSelectConnection}
              onDeleteConnection={onDeleteConnection}
              onCreateFolder={onCreateFolder}
              onDeleteFolder={onDeleteFolder}
              onMoveConnection={onMoveConnection}
              canManageAccess={canManageAccess}
              onManageConnectionAccess={onManageConnectionAccess}
            />
          ))}
          {childConnections.map((c) => (
            <div key={c.id} style={{ paddingLeft: `${depth * 14}px` }}>
              <ConnectionRow
                connection={c}
                allFolders={allFolders}
                isActive={activeConnectionId === c.id}
                onSelect={() => onSelectConnection(c.id)}
                onDelete={() => {
                  if (confirm(`Delete connection "${c.name}"?`)) {
                    onDeleteConnection(c.id);
                  }
                }}
                onMove={(folderId) => onMoveConnection(c.id, folderId)}
                canManageAccess={canManageAccess}
                onManageAccess={() => onManageConnectionAccess(c)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectionRow({
  connection, allFolders, isActive, onSelect, onDelete, onMove,
  canManageAccess, onManageAccess,
}: {
  connection: Connection;
  allFolders: Folder[];
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onMove: (folderId: string | null) => void;
  canManageAccess: boolean;
  onManageAccess: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveSubmenuOpen, setMoveSubmenuOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<{
    healthy: boolean; version: string | null; latency_ms: number | null;
    ssl_enabled: boolean | null; error: string | null;
  } | null>(null);

  async function handleCheckHealth() {
    setMenuOpen(false);
    setChecking(true);
    try {
      const result = await api.checkConnectionHealth(connection.id);
      setHealth(result);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div
      className={`group relative border-l-2 rounded-md transition-colors ${
        isActive ? "border-accent bg-accent/10" : "border-transparent hover:bg-hover"
      }`}
    >
      <button onClick={onSelect} className="w-full text-left px-3 py-2.5 pr-8 text-sm">
        <div className="flex items-center gap-1.5 truncate">
          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
          <span className={`truncate ${isActive ? "text-slate-100" : "text-slate-400"}`}>
            {connection.name}
          </span>
          {/* Restricted is called out in warn; team is the quiet default so
              the common case doesn't become visual noise on every row. */}
          {connection.access_level === "restricted" ? (
            <Lock size={10} className="text-warn shrink-0" aria-label="Restricted access" />
          ) : (
            <Users size={10} className="text-slate-600 shrink-0" aria-label="Team access" />
          )}
        </div>
        <div className="text-xs text-slate-600 truncate font-mono">
          {connection.database}@{connection.host}
        </div>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen(!menuOpen);
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 p-1 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity"
      >
        <MoreHorizontal size={15} />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setMenuOpen(false); setMoveSubmenuOpen(false); }} />
          <div className="absolute right-2 top-9 z-50 bg-elevated border border-line rounded-md shadow-lg py-1 min-w-40">
            <button
              onClick={handleCheckHealth}
              disabled={checking}
              className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-secondary hover:bg-hover disabled:opacity-50"
            >
              <Activity size={14} /> {checking ? "Checking…" : "Test connection"}
            </button>

            {canManageAccess && (
              <button
                onClick={() => { setMenuOpen(false); onManageAccess(); }}
                className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-secondary hover:bg-hover"
              >
                <ShieldCheck size={14} /> Manage access
              </button>
            )}

            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setMoveSubmenuOpen(!moveSubmenuOpen); }}
                className="w-full flex items-center justify-between gap-2 text-left px-3 py-1.5 text-sm text-secondary hover:bg-hover"
              >
                <span className="flex items-center gap-2"><FolderIcon size={14} /> Move to folder</span>
                <ChevronRight size={12} />
              </button>
              {moveSubmenuOpen && (
                <div className="absolute left-full top-0 ml-1 bg-elevated border border-line rounded-md shadow-lg py-1 min-w-36 max-h-48 overflow-y-auto">
                  {connection.folder_id && (
                    <button
                      onClick={() => { onMove(null); setMenuOpen(false); setMoveSubmenuOpen(false); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-secondary hover:bg-hover"
                    >
                      Unfiled
                    </button>
                  )}
                  {allFolders.length === 0 ? (
                    <p className="px-3 py-1.5 text-xs text-faint">No folders yet.</p>
                  ) : (
                    allFolders.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => { onMove(f.id); setMenuOpen(false); setMoveSubmenuOpen(false); }}
                        disabled={connection.folder_id === f.id}
                        className="w-full text-left px-3 py-1.5 text-sm text-secondary hover:bg-hover disabled:opacity-40"
                      >
                        {f.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="my-1 border-t border-line" />
            <button
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-danger hover:bg-hover"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>
      )}

      {health && (
        <div className="mx-3 mb-2 px-2.5 py-2 rounded-md bg-ink border border-line text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className={health.healthy ? "text-accent-hover" : "text-danger"}>
              {health.healthy ? "● Healthy" : "● Unreachable"}
            </span>
            <button onClick={() => setHealth(null)} className="text-faint hover:text-secondary">
              <X size={12} />
            </button>
          </div>
          {health.healthy ? (
            <>
              <div className="text-slate-500">Latency: {health.latency_ms}ms</div>
              <div className="text-slate-500">SSL: {health.ssl_enabled ? "on" : "off"}</div>
              {health.version && <div className="text-slate-500 truncate">{health.version}</div>}
            </>
          ) : (
            <div className="text-danger/80 truncate">{health.error}</div>
          )}
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group relative rounded-md hover:bg-hover transition-colors">
      <button onClick={onOpen} className="w-full text-left px-3 py-2 pr-8 text-sm flex items-start gap-1.5">
        <Bookmark size={12} className="text-accent-hover shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="truncate text-slate-300">{query.name}</div>
          <div className="text-xs text-slate-600 truncate">{query.question}</div>
        </div>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen(!menuOpen);
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 p-1 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity"
      >
        <MoreHorizontal size={15} />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-2 top-9 z-50 bg-elevated border border-line rounded-md shadow-lg py-1 min-w-30">
            <button
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-danger hover:bg-hover"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function relativeDay(isoString: string): string {
  const date = new Date(isoString + "Z");
  const today = new Date();
  const diffDays = Math.floor((today.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}