import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { AssignableRole, WorkspaceMember, WorkspaceRole } from "../type";
import { Crown, Shield, User, UserPlus } from "lucide-react";
import { Alert, Badge, Button, Dialog, Input, Skeleton } from "./ui";
import type { BadgeTone } from "./ui";

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
const ROLE_STYLES: Record<WorkspaceRole, { label: string; icon: typeof Crown; tone: BadgeTone }> = {
  owner: { label: "Owner", icon: Crown, tone: "accent" },
  admin: { label: "Admin", icon: Shield, tone: "warn" },
  member: { label: "Member", icon: User, tone: "neutral" },
};

const ROLE_RANK: Record<WorkspaceRole, number> = { member: 1, admin: 2, owner: 3 };

function RoleBadge({ role }: { role: WorkspaceRole }) {
  const style = ROLE_STYLES[role] ?? ROLE_STYLES.member;
  const Icon = style.icon;
  return (
    <Badge tone={style.tone} icon={<Icon size={9} />}>
      {style.label}
    </Badge>
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

  const loadMembers = useCallback(() => {
    setLoading(true);
    api
      .getWorkspaceMembers(workspaceId)
      .then(setMembers)
      .catch(() => setActionError("Couldn't load the member list."))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

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
      setMembers((prev) => prev.map((m) => (m.user_id === updated.user_id ? updated : m)));
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
    <Dialog
      title={`${workspaceName} members`}
      description={
        myRole
          ? `You are ${myRole === "admin" ? "an" : "a"} ${ROLE_STYLES[myRole].label.toLowerCase()} of this workspace.`
          : "Who can see and query this workspace."
      }
      onClose={onClose}
    >
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : (
        <ul className="space-y-2">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-raised border border-line"
            >
              <div className="min-w-0">
                <p className="text-sm text-primary truncate">
                  {m.name}
                  {m.user_id === currentUserId && (
                    <span className="text-xs text-faint"> (you)</span>
                  )}
                </p>
                <p className="text-xs text-muted truncate">{m.email}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {canChangeRole(m) ? (
                  <select
                    value={m.role}
                    disabled={savingRoleFor === m.user_id}
                    onChange={(e) => handleRoleChange(m, e.target.value as AssignableRole)}
                    className="h-8 rounded-md bg-elevated border border-line px-2 text-xs text-secondary
                      focus:outline-none focus:border-accent disabled:opacity-50"
                    aria-label={`Role for ${m.name}`}
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                ) : (
                  <RoleBadge role={m.role} />
                )}

                {canRemove(m) && (
                  <Button size="sm" variant="danger" onClick={() => handleRemove(m)}>
                    Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {actionError && (
        <Alert tone="danger" className="mt-3" title="That didn't work">
          {actionError}
        </Alert>
      )}

      {isOwner && (
        <p className="text-xs text-faint mt-3">
          Admins can invite and remove ordinary members. Only you can change roles.
        </p>
      )}

      {isAdmin && (
        <form onSubmit={handleInvite} className="mt-5 pt-5 border-t border-border-subtle space-y-3">
          <div className="flex items-end gap-2">
            <Input
              containerClassName="flex-1 min-w-0"
              label="Invite by email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@example.com"
              hint="They need an existing Phantom Query account. New members join as Members."
            />
            <Button
              type="submit"
              variant="primary"
              icon={<UserPlus size={14} />}
              loading={inviting}
              disabled={!inviteEmail.trim()}
              className="mb-6"
            >
              Invite
            </Button>
          </div>

          {inviteError && <Alert tone="danger" title="Couldn't invite them">{inviteError}</Alert>}
          {inviteSuccess && <Alert tone="success" title="Member added" />}
        </form>
      )}
    </Dialog>
  );
}
