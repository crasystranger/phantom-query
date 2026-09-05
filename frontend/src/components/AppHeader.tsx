import { useState } from "react";
import { User, Users, ChevronsUpDown, Settings, LogOut, Database, Check, Menu } from "lucide-react";
import type { Workspace, Connection } from "../type";

interface Props {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  connections: Connection[];
  activeConnectionId: string | null;
  userName: string;
  onSwitchWorkspace: (id: string) => void;
  onSwitchConnection: (id: string) => void;
  onGoToDashboard: () => void;
  onGoToProfile: () => void;
  onLogout: () => void;
  onToggleSidebar: () => void;
}

export default function AppHeader({
  workspaces, activeWorkspaceId, connections, activeConnectionId, userName,
  onSwitchWorkspace, onSwitchConnection, onGoToDashboard, onGoToProfile, onLogout, onToggleSidebar
}: Props) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [connectionMenuOpen, setConnectionMenuOpen] = useState(false);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeConnection = connections.find((c) => c.id === activeConnectionId);
  const initials = userName ? userName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() : "?";

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle shrink-0">
      <div className="flex items-center gap-2 min-w-0">

          <button
            onClick={onToggleSidebar}
            className="sm:hidden w-7 h-7 rounded-md border border-line flex items-center justify-center text-secondary hover:bg-hover transition-colors shrink-0"
            title="Toggle sidebar"
          >
            <Menu size={15} />
          </button>

        <button
          onClick={onGoToDashboard}
          className="w-7 h-7 rounded-md border border-accent/40 bg-accent/10 flex items-center justify-center text-accent-hover hover:bg-accent/20 transition-colors shrink-0"
          title="Dashboard"
        >
          <img src="/logo.jpeg" alt="Phantom Query" className="h-7 w-auto rounded-sm" />
        </button>

        {activeWorkspace && (
          <>
            <span className="text-faint shrink-0">/</span>
            <div className="relative">
              <button
                onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-hover transition-colors min-w-0"
              >
                {activeWorkspace.type === "team" ? (
                  <Users size={13} className="text-secondary shrink-0" />
                ) : (
                  <User size={13} className="text-secondary shrink-0" />
                )}
                <span className="text-sm text-secondary truncate max-w-24 sm:max-w-40">{activeWorkspace.name}</span>
                <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-hover text-faint uppercase shrink-0">
                  {activeWorkspace.type === "team" ? "Team" : "Personal"}
                </span>
                <ChevronsUpDown size={12} className="text-faint shrink-0" />
              </button>

              {workspaceMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setWorkspaceMenuOpen(false)} />
                  <div className="absolute left-0 top-9 z-50 bg-elevated border border-border-subtle rounded-lg shadow-lg py-1 min-w-56">
                    {workspaces.map((ws) => (
                      <button
                        key={ws.id}
                        onClick={() => { onSwitchWorkspace(ws.id); setWorkspaceMenuOpen(false); }}
                        className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm transition-colors ${
                          ws.id === activeWorkspaceId ? "text-accent-hover bg-accent/10" : "text-secondary hover:bg-hover"
                        }`}
                      >
                        {ws.type === "team" ? <Users size={13} /> : <User size={13} />}
                        <span className="truncate flex-1">{ws.name}</span>
                        {ws.id === activeWorkspaceId && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {activeConnection && (
          <>
            <span className="text-faint shrink-0">/</span>
            <div className="relative">
              <button
                onClick={() => setConnectionMenuOpen(!connectionMenuOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-hover min-w-0"
              >
                <Database size={13} className="text-primary shrink-0" />
                <span className="text-sm text-primary font-medium truncate max-w-24 sm:max-w-40">{activeConnection.name}</span>
                <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent-hover shrink-0">
                  Active
                </span>
                <ChevronsUpDown size={12} className="text-faint shrink-0" />
              </button>

              {connectionMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setConnectionMenuOpen(false)} />
                  <div className="absolute left-0 top-9 z-50 bg-elevated border border-border-subtle rounded-lg shadow-lg py-1 min-w-56 max-h-72 overflow-y-auto">
                    {connections.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-faint">No connections in this workspace.</p>
                    ) : (
                      connections.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => { onSwitchConnection(c.id); setConnectionMenuOpen(false); }}
                          className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm transition-colors ${
                            c.id === activeConnectionId ? "text-accent-hover bg-accent/10" : "text-secondary hover:bg-hover"
                          }`}
                        >
                          <Database size={13} className="shrink-0" />
                          <span className="truncate flex-1">{c.name}</span>
                          {c.id === activeConnectionId && <Check size={13} />}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="relative shrink-0">
        <button
          onClick={() => setAccountMenuOpen(!accountMenuOpen)}
          className="w-7 h-7 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-[11px] text-accent-hover font-medium hover:border-accent/60 transition-colors"
        >
          {initials}
        </button>
        {accountMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setAccountMenuOpen(false)} />
            <div className="absolute right-0 top-9 z-50 bg-elevated border border-border-subtle rounded-lg shadow-lg py-1 min-w-40">
              <div className="px-3 py-2 border-b border-border-subtle">
                <p className="text-sm text-primary truncate">{userName || "Account"}</p>
              </div>
              <button
                onClick={() => { setAccountMenuOpen(false); onGoToProfile(); }}
                className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-secondary hover:bg-hover"
              >
                <Settings size={14} /> Profile & Settings
              </button>
              <div className="my-1 border-t border-border-subtle" />
              <button
                onClick={() => { setAccountMenuOpen(false); onLogout(); }}
                className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-danger hover:bg-hover"
              >
                <LogOut size={14} /> Log out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}