import { useState } from "react";
import type { Workspace } from "../type";
import { User, Users, ChevronDown, Plus } from "lucide-react";

interface Props {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSwitch: (id: string) => void;
  onCreateTeam: (name: string) => void;
  onManageMembers: (workspaceId: string, workspaceName: string) => void;
}

export default function WorkspaceSwitcher({
  workspaces, activeWorkspaceId, onSwitch, onCreateTeam, onManageMembers,
}: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const active = workspaces.find((w) => w.id === activeWorkspaceId);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateTeam(newName.trim());
    setNewName("");
    setCreating(false);
  }

  return (
    <div className="relative border-b border-line">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-slate-200 hover:bg-hover transition-colors"
      >
        <span className="flex items-center gap-2 truncate">
          {active?.type === "team" ? <Users size={14} /> : <User size={14} />}
          <span className="truncate">{active?.name ?? "Select workspace"}</span>
        </span>
        <ChevronDown size={14} className="text-slate-500" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-2 right-2 top-full z-50 bg-elevated border border-line rounded-md shadow-lg py-1 mt-1">
            {workspaces.map((ws) => (
              <div key={ws.id} className="flex items-center justify-between px-1">
                <button
                  onClick={() => {
                    onSwitch(ws.id);
                    setOpen(false);
                  }}
                  className={`flex-1 flex items-center gap-2 text-left px-2 py-2 text-sm transition-colors rounded ${
                    ws.id === activeWorkspaceId ? "text-accent-hover bg-accent/10" : "text-slate-300 hover:bg-hover"
                  }`}
                >
                  {ws.type === "team" ? <Users size={14} /> : <User size={14} />}
                  <span className="truncate">{ws.name}</span>
                </button>
                {ws.type === "team" && (
                  <button
                    onClick={() => {
                      onManageMembers(ws.id, ws.name);
                      setOpen(false);
                    }}
                    className="text-[10px] text-slate-500 hover:text-accent-hover px-1.5 shrink-0"
                  >
                    Manage
                  </button>
                )}
              </div>
            ))}

            <div className="my-1 border-t border-line" />

            {creating ? (
              <form onSubmit={handleCreate} className="px-3 py-2 space-y-1.5">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Team name"
                  autoFocus
                  className="w-full rounded-md bg-ink border border-line px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60"
                />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setCreating(false)} className="text-xs text-slate-500">
                    Cancel
                  </button>
                  <button type="submit" className="text-xs px-2 py-1 rounded bg-accent hover:bg-accent-hover text-white">
                    Create
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-1.5 text-left px-3 py-2 text-sm text-accent-hover hover:bg-hover"
              >
                <Plus size={14} /> New team workspace
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}