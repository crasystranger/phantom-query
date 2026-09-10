import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AccessLevel, ConnectionGrant, WorkspaceMember } from "../type";
import { Check, Lock, Plus, Users } from "lucide-react";
import { Alert, Button, Dialog, Skeleton } from "./ui";

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
 * Deliberately mirrors WorkspaceMembersModal's structure -- same dialog shell,
 * same row shape, same tokens -- so the two panels read as one system rather
 * than two people's ideas of a member picker.
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

  async function handleToggleGrant(userId: string, isGranted: boolean) {
    setBusyUserId(userId);
    setError(null);
    try {
      const updated = isGranted
        ? await api.revokeConnectionAccess(connectionId, userId)
        : await api.grantConnectionAccess(connectionId, userId);
      setGrants(updated.grants);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isGranted
            ? "Failed to revoke access."
            : "Failed to grant access."
      );
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <Dialog
      title={`${connectionName} access`}
      description="Who in this workspace can see and query this database."
      onClose={onClose}
    >
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : (
        <>
          <div
            role="radiogroup"
            aria-label="Access level"
            className="space-y-2"
          >
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
              description="Only admins, the creator, and the people you add below."
              selected={accessLevel === "restricted"}
              disabled={saving}
              onSelect={() => handleLevelChange("restricted")}
            />
          </div>

          {accessLevel === "restricted" && (
            <div className="mt-5 pt-5 border-t border-border-subtle">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-faint mb-2.5">
                Members with access
              </p>

              {grantableMembers.length === 0 ? (
                <p className="text-xs text-muted">
                  This workspace has no ordinary members yet. Admins and owners already
                  have access.
                </p>
              ) : (
                <ul className="space-y-2">
                  {grantableMembers.map((m) => {
                    const isGranted = grantedIds.has(m.user_id);
                    const busy = busyUserId === m.user_id;
                    return (
                      <li
                        key={m.user_id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-raised border border-line"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-primary truncate">{m.name}</p>
                          <p className="text-xs text-muted truncate">{m.email}</p>
                        </div>
                        <Button
                          size="sm"
                          variant={isGranted ? "secondary" : "primary"}
                          loading={busy}
                          icon={isGranted ? <Check size={12} /> : <Plus size={12} />}
                          onClick={() => handleToggleGrant(m.user_id, isGranted)}
                          aria-label={
                            isGranted
                              ? `Revoke ${m.name}'s access to ${connectionName}`
                              : `Give ${m.name} access to ${connectionName}`
                          }
                        >
                          {isGranted ? "Has access" : "Add"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="text-xs text-faint mt-3">
                Admins and owners always have access. Existing chats keep their history
                even after a connection is restricted.
              </p>
            </div>
          )}
        </>
      )}

      {error && (
        <Alert tone="danger" className="mt-3" title="That didn't work">
          {error}
        </Alert>
      )}
    </Dialog>
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
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={`w-full flex items-start gap-2.5 text-left px-3 py-3 rounded-lg border transition-colors
        disabled:opacity-50 disabled:pointer-events-none ${
          selected
            ? "border-accent/45 bg-accent/8"
            : "border-line bg-raised hover:bg-hover hover:border-faint"
        }`}
    >
      <Icon
        size={15}
        className={`mt-0.5 shrink-0 ${selected ? "text-accent" : "text-muted"}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${selected ? "text-primary" : "text-secondary"}`}>
          {label}
        </span>
        <span className="block text-xs text-muted mt-0.5">{description}</span>
      </span>
      {selected && <Check size={15} className="text-accent shrink-0 mt-0.5" aria-hidden />}
    </button>
  );
}
