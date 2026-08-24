import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AccessLevel, ConnectionGrant, WorkspaceMember } from "../type";
import { X, Users, Lock, Check, Plus } from "lucide-react";

interface Props {
  connectionId: string;
  connectionName: string;
  workspaceId: string;
  onClose: () => void;
  /** Lets the sidebar badge update without a full connection refetch. */
  onAccessLevelChange?: (connectionId: string, level: AccessLevel) => void;
}

/**
 * Admin/owner panel for one connection's access.
 *
 * Deliberately mirrors WorkspaceMembersModal's structure -- same overlay,
 * same row shape, same token usage -- so the two panels read as one system
 * rather than two people's ideas of a member picker.
 *
 * Everything here is presentation. A member who reached this panel by any
 * means still gets 403 from every endpoint it calls.
 */
export default function ConnectionAccessModal({
  connectionId, connectionName, workspaceId, onClose, onAccessLevelChange,
}: Props) {
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("team");
  const [grants, setGrants] = useState<ConnectionGrant[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No synchronous setState here: `loading` already starts true, and the
    // modal is mounted fresh each time it is opened, so there is no stale
    // state to reset.
    let cancelled = false;

    Promise.all([
      api.getConnectionAccess(connectionId),
      api.getWorkspaceMembers(workspaceId),
    ])
      .then(([access, memberList]) => {
        if (cancelled) return;
        setAccessLevel(access.access_level);
        setGrants(access.grants);
        setMembers(memberList);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load access settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connectionId, workspaceId]);

  const grantedIds = new Set(grants.map((g) => g.user_id));

  // Admins and owners always have access without a grant, so offering to
  // "add" them would imply a grant is doing something it isn't.
  const grantableMembers = members.filter((m) => m.role === "member");

  async function handleLevelChange(next: AccessLevel) {
    if (next === accessLevel) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateConnectionAccess(connectionId, next);
      setAccessLevel(updated.access_level);
      setGrants(updated.grants);
      onAccessLevelChange?.(connectionId, updated.access_level);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change access level.");
    } finally {
      setSaving(false);
    }
  }

  async function handleGrant(userId: string) {
    setBusyUserId(userId);
    setError(null);
    try {
      const updated = await api.grantConnectionAccess(connectionId, userId);
      setGrants(updated.grants);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grant access.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRevoke(userId: string) {
    setBusyUserId(userId);
    setError(null);
    try {
      const updated = await api.revokeConnectionAccess(connectionId, userId);
      setGrants(updated.grants);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke access.");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-panel border border-line rounded-lg w-120 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-slate-100 truncate">
              {connectionName} access
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Who in this workspace can use this database.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 shrink-0">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <AccessOption
                icon={Users}
                label="Team access"
                description="Every member of this workspace can see and query it."
                selected={accessLevel === "team"}
                disabled={saving}
                onSelect={() => handleLevelChange("team")}
              />
              <AccessOption
                icon={Lock}
                label="Restricted"
                description="Only admins, the creator, and people you add below."
                selected={accessLevel === "restricted"}
                disabled={saving}
                onSelect={() => handleLevelChange("restricted")}
              />
            </div>

            {accessLevel === "restricted" && (
              <div className="pt-3 border-t border-line space-y-2">
                <p className="text-xs text-slate-500">Members with access</p>

                {grantableMembers.length === 0 ? (
                  <p className="text-[11px] text-slate-600">
                    This workspace has no ordinary members yet. Admins and owners
                    already have access.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {grantableMembers.map((m) => {
                      const isGranted = grantedIds.has(m.user_id);
                      const busy = busyUserId === m.user_id;
                      return (
                        <div
                          key={m.user_id}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-ink border border-line"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-slate-200 truncate">{m.name}</p>
                            <p className="text-xs text-slate-500 truncate">{m.email}</p>
                          </div>
                          <button
                            disabled={busy}
                            onClick={() =>
                              isGranted ? handleRevoke(m.user_id) : handleGrant(m.user_id)
                            }
                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border shrink-0 disabled:opacity-50 ${
                              isGranted
                                ? "border-line text-slate-400 hover:text-danger hover:border-danger/40"
                                : "border-accent/30 text-accent hover:bg-accent/10"
                            }`}
                          >
                            {isGranted ? (
                              <>
                                <Check size={12} /> Has access
                              </>
                            ) : (
                              <>
                                <Plus size={12} /> Add
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="text-[11px] text-slate-600">
                  Admins and owners always have access. Existing chats keep their
                  history even after a connection is restricted.
                </p>
              </div>
            )}
          </>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}

function AccessOption({
  icon: Icon, label, description, selected, disabled, onSelect,
}: {
  icon: typeof Users;
  label: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`w-full flex items-start gap-2.5 text-left px-3 py-2.5 rounded-md border transition-colors disabled:opacity-50 ${
        selected
          ? "border-accent/40 bg-accent/10"
          : "border-line bg-ink hover:bg-hover"
      }`}
    >
      <Icon
        size={14}
        className={`mt-0.5 shrink-0 ${selected ? "text-accent" : "text-slate-500"}`}
      />
      <div className="min-w-0">
        <p className={`text-sm ${selected ? "text-slate-100" : "text-slate-300"}`}>
          {label}
        </p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      {selected && <Check size={14} className="text-accent shrink-0 ml-auto mt-0.5" />}
    </button>
  );
}
