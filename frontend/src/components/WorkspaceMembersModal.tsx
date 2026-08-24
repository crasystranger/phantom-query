import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AssignableRole, WorkspaceMember, WorkspaceRole } from "../type";
import { X, UserPlus, Check, Crown, Shield, User } from "lucide-react";

interface Props {
  workspaceId: string;
  workspaceName: string;
  currentUserId: string;
  onClose: () => void;
}

/**
 * Role presentation. Every control this file hides is also refused by the
 * server (app/permissions.py) -- hiding is here to keep the panel honest
 * about what a person can do, not to enforce anything.
 */
const ROLE_STYLES: Record<WorkspaceRole, { label: string; icon: typeof Crown; className: string }> = {
  owner: {
    label: "Owner",
    icon: Crown,
    className: "bg-accent/15 text-accent border-accent/30",
  },
  admin: {
    label: "Admin",
    icon: Shield,
    className: "bg-warn/15 text-warn border-warn/30",
  },
  member: {
    label: "Member",
    icon: User,
    className: "bg-hover text-text-muted border-line",
  },
};

const ROLE_RANK: Record<WorkspaceRole, number> = { member: 1, admin: 2, owner: 3 };

function RoleBadge({ role }: { role: WorkspaceRole }) {
  const style = ROLE_STYLES[role] ?? ROLE_STYLES.member;
  const Icon = style.icon;
  return (
    <span
      className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wide ${style.className}`}
    >
      <Icon size={10} /> {style.label}
    </span>
  );
}

export default function WorkspaceMembersModal({
  workspaceId, workspaceName, currentUserId, onClose,
}: Props) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [savingRoleFor, setSavingRoleFor] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const myRole: WorkspaceRole | undefined =
    members.find((m) => m.user_id === currentUserId)?.role;
  const isOwner = myRole === "owner";
  const isAdmin = myRole === "owner" || myRole === "admin";

  useEffect(() => {
    loadMembers();
  }, [workspaceId]);

  function loadMembers() {
    setLoading(true);
    api.getWorkspaceMembers(workspaceId).then(setMembers).finally(() => setLoading(false));
  }

  /** Mirrors assert_can_remove_member: admins may only remove ordinary
   *  members, nobody removes the owner, nobody removes themselves. */
  function canRemove(member: WorkspaceMember): boolean {
    if (!isAdmin) return false;
    if (member.user_id === currentUserId) return false;
    if (member.role === "owner") return false;
    if (!isOwner && ROLE_RANK[member.role] >= ROLE_RANK.admin) return false;
    return true;
  }

  /** Only the owner changes roles, and never their own. */
  function canChangeRole(member: WorkspaceMember): boolean {
    return isOwner && member.role !== "owner" && member.user_id !== currentUserId;
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(false);
    try {
      await api.inviteMember(workspaceId, inviteEmail.trim());
      setInviteSuccess(true);
      setInviteEmail("");
      loadMembers();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite member.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(member: WorkspaceMember) {
    if (!confirm(`Remove ${member.name} from ${workspaceName}?`)) return;
    setActionError(null);
    try {
      await api.removeMember(workspaceId, member.user_id);
      loadMembers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove member.");
    }
  }

  async function handleRoleChange(member: WorkspaceMember, role: AssignableRole) {
    if (role === member.role) return;
    setActionError(null);
    setSavingRoleFor(member.user_id);
    try {
      const updated = await api.updateMemberRole(workspaceId, member.user_id, role);
      setMembers((prev) =>
        prev.map((m) => (m.user_id === updated.user_id ? updated : m))
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to change role.");
      // The server rejected it, so re-read rather than leaving the panel
      // showing a role that was never actually applied.
      loadMembers();
    } finally {
      setSavingRoleFor(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-panel border border-line rounded-lg w-120 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-slate-100">{workspaceName} members</h2>
            {myRole && (
              <p className="text-[11px] text-slate-600 mt-0.5">
                You are {myRole === "admin" ? "an" : "a"} {ROLE_STYLES[myRole].label.toLowerCase()} of this workspace.
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {members.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-ink border border-line"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">
                    {m.name}
                    {m.user_id === currentUserId && (
                      <span className="text-xs text-slate-600"> (you)</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{m.email}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {canChangeRole(m) ? (
                    <select
                      value={m.role}
                      disabled={savingRoleFor === m.user_id}
                      onChange={(e) => handleRoleChange(m, e.target.value as AssignableRole)}
                      className="rounded-md bg-panel border border-line px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-accent/60 disabled:opacity-50"
                      aria-label={`Role for ${m.name}`}
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}

                  {canRemove(m) && (
                    <button
                      onClick={() => handleRemove(m)}
                      className="text-xs text-danger hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {actionError && <p className="text-xs text-red-400">{actionError}</p>}

        {isOwner && (
          <p className="text-[11px] text-slate-600">
            Admins can invite and remove ordinary members. Only you can change roles.
          </p>
        )}

        {isAdmin && (
          <form onSubmit={handleInvite} className="pt-3 border-t border-line space-y-2">
            <label className="block">
              <span className="text-xs text-slate-500">Invite by email</span>
              <div className="flex gap-2 mt-1">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  className="flex-1 rounded-md bg-ink border border-line px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent/60"
                />
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
                >
                  <UserPlus size={14} /> {inviting ? "Inviting…" : "Invite"}
                </button>
              </div>
            </label>
            <p className="text-[11px] text-slate-600">
              They must already have a Phantom Query account. New members join as Members.
            </p>
            {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}
            {inviteSuccess && (
              <p className="flex items-center gap-1 text-xs text-accent-hover">
                <Check size={12} /> Member added.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
