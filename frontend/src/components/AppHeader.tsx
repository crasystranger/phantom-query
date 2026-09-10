import { useState } from "react";
import {
  Check, ChevronsUpDown, Database, LayoutDashboard, LogOut, Menu as MenuIcon,
  Plus, Settings, User, Users,
} from "lucide-react";
import type { Workspace, Connection } from "../type";
import { PhantomLogo } from "./PhantomLogo";
import { Badge, Button, Input, Menu, MenuItem, MenuLabel, MenuSeparator } from "./ui";

interface Props {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  connections: Connection[];
  activeConnectionId: string | null;
  userName: string;
  canManageMembers: boolean;
  onSwitchWorkspace: (id: string) => void;
  onSwitchConnection: (id: string) => void;
  onCreateTeam: (name: string) => Promise<void> | void;
  onManageMembers: (workspaceId: string, workspaceName: string) => void;
  onNewConnection: () => void;
  onGoToDashboard: () => void;
  onGoToProfile: () => void;
  onLogout: () => void;
  onToggleSidebar: () => void;
}

/**
 * The context bar. It answers "where am I" as a breadcrumb -- workspace, then
 * database -- because those two facts decide what a question will actually
 * run against. Both segments are also the switchers for their level, so
 * changing context happens where the context is displayed rather than in a
 * second control elsewhere.
 */
export default function AppHeader({
  workspaces, activeWorkspaceId, connections, activeConnectionId, userName,
  canManageMembers, onSwitchWorkspace, onSwitchConnection, onCreateTeam,
  onManageMembers, onNewConnection, onGoToDashboard, onGoToProfile, onLogout,
  onToggleSidebar,
}: Props) {
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeConnection = connections.find((c) => c.id === activeConnectionId);
  const initials = userName
    ? userName.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <header className="flex items-center justify-between gap-2 px-3 sm:px-4 h-14 border-b border-border-subtle bg-panel shrink-0">
      <div className="flex items-center gap-1 min-w-0 overflow-hidden">
        <button
          onClick={onToggleSidebar}
          aria-label="Open workspace navigation"
          className="lg:hidden w-9 h-9 -ml-1 rounded-md flex items-center justify-center text-muted hover:text-primary hover:bg-hover transition-colors shrink-0"
        >
          <MenuIcon size={18} />
        </button>

        {/* Below `sm` the hamburger already anchors the left edge and Dashboard
            lives in the account menu, so the mark yields its 36px to the
            breadcrumb -- which is the context a person actually needs. */}
        <button
          onClick={onGoToDashboard}
          title="Go to dashboard"
          aria-label="Go to dashboard"
          className="hidden sm:flex h-9 px-2 rounded-md items-center text-primary hover:bg-hover transition-colors shrink-0"
        >
          <PhantomLogo className="h-5 w-auto" />
        </button>

        {activeWorkspace && (
          <>
            <Divider />
            <WorkspacePicker
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              canManageMembers={canManageMembers}
              onSwitchWorkspace={onSwitchWorkspace}
              onCreateTeam={onCreateTeam}
              onManageMembers={onManageMembers}
            />
          </>
        )}

        {activeConnection && (
          <>
            <Divider />
            <Menu
              align="left"
              trigger={(props) => (
                <button
                  {...props}
                  className="flex items-center gap-1.5 h-8 px-2 rounded-md hover:bg-hover transition-colors min-w-0"
                >
                  <Database size={14} className="text-accent shrink-0" aria-hidden />
                  <span className="text-sm font-medium text-primary truncate min-w-0 sm:max-w-44">
                    {activeConnection.name}
                  </span>
                  <ChevronsUpDown size={12} className="text-faint shrink-0" aria-hidden />
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuLabel>Query against</MenuLabel>
                  {connections.map((c) => (
                    <MenuItem
                      key={c.id}
                      icon={<Database size={14} />}
                      selected={c.id === activeConnectionId}
                      onClick={() => { onSwitchConnection(c.id); close(); }}
                    >
                      {c.name}
                    </MenuItem>
                  ))}
                  <MenuSeparator />
                  <MenuItem
                    icon={<Plus size={14} />}
                    onClick={() => { onNewConnection(); close(); }}
                  >
                    New connection
                  </MenuItem>
                </>
              )}
            </Menu>
          </>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <div className="hidden sm:block">
          <Button
            variant="ghost"
            size="sm"
            icon={<LayoutDashboard size={15} />}
            onClick={onGoToDashboard}
          >
            Dashboard
          </Button>
        </div>

        <Menu
          trigger={(props) => (
            <button
              {...props}
              aria-label="Account menu"
              className="w-9 h-9 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-[11px] font-semibold text-accent-text hover:border-accent/60 transition-colors"
            >
              {initials}
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="px-3 py-2 border-b border-border-subtle">
                <p className="text-sm font-medium text-primary truncate">{userName || "Account"}</p>
              </div>
              <MenuItem
                icon={<LayoutDashboard size={14} />}
                className="sm:hidden"
                onClick={() => { close(); onGoToDashboard(); }}
              >
                Dashboard
              </MenuItem>
              <MenuItem icon={<Settings size={14} />} onClick={() => { close(); onGoToProfile(); }}>
                Settings
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger icon={<LogOut size={14} />} onClick={() => { close(); onLogout(); }}>
                Log out
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}

function Divider() {
  return (
    <span className="text-faint select-none shrink-0" aria-hidden>
      /
    </span>
  );
}

function WorkspacePicker({
  workspaces, activeWorkspace, canManageMembers, onSwitchWorkspace, onCreateTeam, onManageMembers,
}: {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  canManageMembers: boolean;
  onSwitchWorkspace: (id: string) => void;
  onCreateTeam: (name: string) => Promise<void> | void;
  onManageMembers: (workspaceId: string, workspaceName: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent, close: () => void) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreateTeam(newName.trim());
      setNewName("");
      setCreating(false);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the workspace.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Menu
      align="left"
      className="min-w-64"
      trigger={(props) => (
        <button
          {...props}
          aria-label={`Workspace: ${activeWorkspace.name}. Switch workspace`}
          className="flex items-center gap-1.5 h-8 px-2 rounded-md hover:bg-hover transition-colors min-w-0"
        >
          {activeWorkspace.type === "team" ? (
            <Users size={14} className="text-muted shrink-0" aria-hidden />
          ) : (
            <User size={14} className="text-muted shrink-0" aria-hidden />
          )}
          <span className="hidden sm:block text-sm text-secondary truncate min-w-0 sm:max-w-40">
            {activeWorkspace.name}
          </span>
          <ChevronsUpDown size={12} className="text-faint shrink-0" aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Workspaces</MenuLabel>
          {workspaces.map((ws) => (
            <div key={ws.id} className="flex items-center gap-1 pr-1.5">
              <MenuItem
                icon={ws.type === "team" ? <Users size={14} /> : <User size={14} />}
                selected={ws.id === activeWorkspace.id}
                onClick={() => { onSwitchWorkspace(ws.id); close(); }}
              >
                {ws.name}
              </MenuItem>
              {ws.id === activeWorkspace.id && (
                <Check size={13} className="text-accent-text shrink-0" aria-hidden />
              )}
            </div>
          ))}

          {activeWorkspace.type === "team" && canManageMembers && (
            <>
              <MenuSeparator />
              <MenuItem
                icon={<Users size={14} />}
                onClick={() => { onManageMembers(activeWorkspace.id, activeWorkspace.name); close(); }}
              >
                Manage members
              </MenuItem>
            </>
          )}

          <MenuSeparator />
          {creating ? (
            <form onSubmit={(e) => handleCreate(e, close)} className="px-3 py-2 space-y-2">
              <Input
                label="Team name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Data team"
                error={error}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setError(null); }}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" type="submit" loading={submitting}>
                  Create
                </Button>
              </div>
            </form>
          ) : (
            <MenuItem icon={<Plus size={14} />} onClick={() => setCreating(true)}>
              New team workspace
            </MenuItem>
          )}
        </>
      )}
    </Menu>
  );
}

/** Compact workspace-type marker, used where a full picker would be noise. */
export function WorkspaceBadge({ type }: { type: Workspace["type"] }) {
  return type === "team" ? (
    <Badge tone="info" icon={<Users size={9} />}>Team</Badge>
  ) : (
    <Badge tone="neutral" icon={<User size={9} />}>Personal</Badge>
  );
}
