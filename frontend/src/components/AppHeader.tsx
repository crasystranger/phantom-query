import {
  ChevronsUpDown, Database, LayoutDashboard, LogOut, Menu as MenuIcon,
  Plus, Settings, User, Users,
} from "lucide-react";
import type { Workspace, Connection } from "../type";
import { PhantomLogo } from "./PhantomLogo";
import { Badge, Button, Menu, MenuItem, MenuLabel, MenuSeparator } from "./ui";

interface Props {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  connections: Connection[];
  activeConnectionId: string | null;
  userName: string;
  onSwitchWorkspace: (id: string) => void;
  onSwitchConnection: (id: string) => void;
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
  onSwitchWorkspace, onSwitchConnection, onNewConnection, onGoToDashboard,
  onGoToProfile, onLogout, onToggleSidebar,
}: Props) {
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeConnection = connections.find((c) => c.id === activeConnectionId);
  const initials = userName
    ? userName.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <header className="flex items-center justify-between gap-2 px-3 sm:px-4 h-14 border-b border-border-subtle bg-panel shrink-0">
      {/* No `overflow-hidden` here: the breadcrumb dropdowns are absolutely
          positioned inside this group, and clipping it renders them invisible
          and un-hittable. Fit is handled by letting the labels truncate. */}
      <div className="flex items-center gap-1 min-w-0">
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
          <div className="hidden sm:flex items-center gap-1 min-w-0">
            <Divider />
            <Menu
              align="left"
              className="min-w-56"
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
                  <span className="text-sm text-secondary truncate min-w-0 max-w-40">
                    {activeWorkspace.name}
                  </span>
                  <ChevronsUpDown size={12} className="text-faint shrink-0" aria-hidden />
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuLabel>Switch workspace</MenuLabel>
                  {workspaces.map((ws) => (
                    <MenuItem
                      key={ws.id}
                      icon={ws.type === "team" ? <Users size={14} /> : <User size={14} />}
                      selected={ws.id === activeWorkspaceId}
                      onClick={() => { onSwitchWorkspace(ws.id); close(); }}
                    >
                      {ws.name}
                    </MenuItem>
                  ))}
                </>
              )}
            </Menu>
          </div>
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

/** Compact workspace-type marker, used where a full picker would be noise. */
export function WorkspaceBadge({ type }: { type: Workspace["type"] }) {
  return type === "team" ? (
    <Badge tone="info" icon={<Users size={9} />}>Team</Badge>
  ) : (
    <Badge tone="neutral" icon={<User size={9} />}>Personal</Badge>
  );
}
