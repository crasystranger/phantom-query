import { useState } from "react";
import { Check, ChevronsUpDown, Plus, User, Users } from "lucide-react";
import type { Workspace } from "../type";
import { Button, Input, Menu, MenuItem, MenuLabel, MenuSeparator } from "./ui";

interface Props {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSwitch: (id: string) => void;
  onCreateTeam: (name: string) => Promise<void> | void;
  onManageMembers: (workspaceId: string, workspaceName: string) => void;
}

/**
 * The primary workspace control, pinned to the top of the rail.
 *
 * This is the one place that always shows which workspace you are in, at full
 * width and with the name spelled out -- including inside the mobile drawer,
 * where the header's compact breadcrumb has no room for it. Switching
 * workspace changes which databases, chats and saved queries exist, so it
 * deserves to be stated rather than implied by an icon.
 */
export default function WorkspaceSwitcher({
  workspaces, activeWorkspaceId, onSwitch, onCreateTeam, onManageMembers,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

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
    <div className="px-2 pt-3 pb-2 border-b border-border-subtle">
      <Menu
        align="left"
        className="left-2 right-2 min-w-0 w-[calc(100%-1rem)]"
        trigger={(props) => (
          <button
            {...props}
            aria-label={
              active
                ? `Workspace: ${active.name}. Switch workspace`
                : "Select a workspace"
            }
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg
              border border-line bg-raised hover:bg-hover hover:border-faint
              transition-colors text-left"
          >
            <span
              className="shrink-0 w-7 h-7 rounded-md bg-accent/12 border border-accent/25 flex items-center justify-center text-accent"
              aria-hidden
            >
              {active?.type === "team" ? <Users size={14} /> : <User size={14} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-primary truncate">
                {active?.name ?? "Select workspace"}
              </span>
              <span className="block text-[11px] text-faint">
                {active?.type === "team" ? "Team workspace" : "Personal workspace"}
              </span>
            </span>
            <ChevronsUpDown size={14} className="text-faint shrink-0" aria-hidden />
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
                onClick={() => { onSwitch(ws.id); close(); }}
              >
                <span className="flex items-center gap-2">
                  <span className="truncate">{ws.name}</span>
                  {ws.id === activeWorkspaceId && (
                    <Check size={13} className="shrink-0" aria-hidden />
                  )}
                </span>
              </MenuItem>
            ))}

            {/* Any member may open the roster -- the panel itself decides which
                controls they get, and the server refuses the rest. */}
            {active?.type === "team" && (
              <>
                <MenuSeparator />
                <MenuItem
                  icon={<Users size={14} />}
                  onClick={() => { onManageMembers(active.id, active.name); close(); }}
                >
                  Members
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
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setCreating(false); setError(null); }}
                  >
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
    </div>
  );
}
