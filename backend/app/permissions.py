"""
Workspace Roles & Permissions

The single place that answers "what is this user allowed to do in this
workspace." Routers call into here rather than comparing role strings
inline -- the previous model only had two roles, so `if role != "owner"`
was survivable; with three it isn't, and a scattered check that gets
missed is exactly how an authorization bug ships.

Role hierarchy (higher includes everything below it):

    owner  -- full control. Exactly one per workspace, and the only role
              that can change other members' roles.
    admin  -- trusted administrator. Invites members, removes ordinary
              members, and does everything a member can do. Cannot touch
              the owner in any way, and cannot create other admins.
    member -- normal collaborative access. Connections, folders, chats,
              saved queries -- unchanged from the pre-role behaviour.

Two deliberate decisions, documented because they were genuinely
ambiguous when read against the existing implementation:

1.  Folders / chats / saved queries stay at MEMBER level. They were
    member-level before roles existed, and the brief is explicit that
    members keep the collaborative functionality they already have.

    Connections are now additionally gated per-connection by access_level
    ("team" vs "restricted") -- see can_access_connection() below. Managing
    that gate is ADMIN level; using a connection you can see is still
    MEMBER level.

2.  Audit log reads move from MEMBER to ADMIN. An audit log is a record of
    every other member's activity -- an administrative surface, not a
    collaborative one -- and the brief says to pick the least-privileged
    reasonable reading where the intent is ambiguous. This is the one
    place a member loses an ability they previously had. To revert it,
    change the dependency in app/routers/audit.py back to
    require_workspace_member.

Authorization lives here and is enforced server-side. The frontend hides
controls a user cannot use, but hiding is presentation, never protection.
"""
from dataclasses import dataclass

from fastapi import Depends, HTTPException

from app.db.workspaces import get_role
from app.dependencies import get_current_user_id

ROLE_OWNER = "owner"
ROLE_ADMIN = "admin"
ROLE_MEMBER = "member"

#: Every role that may legally appear in workspace_members.role.
VALID_ROLES: tuple[str, ...] = (ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER)

#: Roles that may be granted through the role-management API. "owner" is
#: absent on purpose: ownership transfer is not a supported operation, and
#: allowing it here would be the easy way to end up with two owners (or none).
ASSIGNABLE_ROLES: tuple[str, ...] = (ROLE_ADMIN, ROLE_MEMBER)

_RANK: dict[str, int] = {ROLE_MEMBER: 1, ROLE_ADMIN: 2, ROLE_OWNER: 3}

# --- Per-connection access levels ----------------------------------------

ACCESS_TEAM = "team"
ACCESS_RESTRICTED = "restricted"

#: Every access_level that may legally appear in connections.access_level.
VALID_ACCESS_LEVELS: tuple[str, ...] = (ACCESS_TEAM, ACCESS_RESTRICTED)


def rank(role: str | None) -> int:
    """Unknown/absent roles rank 0, so they never satisfy any requirement."""
    return _RANK.get(role or "", 0)


def is_at_least(role: str | None, minimum: str) -> bool:
    return rank(role) >= rank(minimum)


@dataclass(frozen=True)
class WorkspaceContext:
    """The resolved answer to 'who is this, in this workspace'. Handed to
    routers by the require_* dependencies so they never re-query the role."""

    workspace_id: str
    user_id: str
    role: str

    @property
    def is_owner(self) -> bool:
        return self.role == ROLE_OWNER

    @property
    def is_admin(self) -> bool:
        """True for owners too -- owner includes every admin capability."""
        return is_at_least(self.role, ROLE_ADMIN)


_DENIED_MESSAGE = {
    ROLE_ADMIN: "This action requires workspace admin or owner permissions.",
    ROLE_OWNER: "This action can only be performed by the workspace owner.",
}


def require_role(user_id: str, workspace_id: str, minimum: str) -> WorkspaceContext:
    """Core guard. Non-members get 404 rather than 403 so the API never
    confirms that a workspace they cannot see exists at all."""
    role = get_role(user_id, workspace_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if not is_at_least(role, minimum):
        raise HTTPException(
            status_code=403,
            detail=_DENIED_MESSAGE.get(minimum, "You do not have permission to perform this action."),
        )
    return WorkspaceContext(workspace_id=workspace_id, user_id=user_id, role=role)


def require_member(user_id: str, workspace_id: str) -> WorkspaceContext:
    return require_role(user_id, workspace_id, ROLE_MEMBER)


def require_admin(user_id: str, workspace_id: str) -> WorkspaceContext:
    return require_role(user_id, workspace_id, ROLE_ADMIN)


def require_owner(user_id: str, workspace_id: str) -> WorkspaceContext:
    return require_role(user_id, workspace_id, ROLE_OWNER)


# --- FastAPI dependencies -------------------------------------------------
# These resolve `workspace_id` from wherever FastAPI finds it: a path
# parameter on /api/workspaces/{workspace_id}/..., or a query parameter on
# /api/audit-logs?workspace_id=... Routes that carry workspace_id in the
# request *body* can't use these -- they call require_admin/require_owner
# directly with payload.workspace_id.

def require_workspace_member(
    workspace_id: str, user_id: str = Depends(get_current_user_id)
) -> WorkspaceContext:
    return require_member(user_id, workspace_id)


def require_workspace_admin(
    workspace_id: str, user_id: str = Depends(get_current_user_id)
) -> WorkspaceContext:
    return require_admin(user_id, workspace_id)


def require_workspace_owner(
    workspace_id: str, user_id: str = Depends(get_current_user_id)
) -> WorkspaceContext:
    return require_owner(user_id, workspace_id)


# --- Member-management rules ---------------------------------------------
# Kept as pure functions (context in, HTTPException or nothing out) so the
# rules can be read in one place and tested without a request.

def assert_can_remove_member(actor: WorkspaceContext, target_user_id: str, target_role: str) -> None:
    """Who may remove whom.

    owner  -> may remove admins and members, never themselves.
    admin  -> may remove ordinary members only. Not the owner, not other
              admins, not themselves.
    member -> never gets here (require_admin rejects them first).
    """
    if target_user_id == actor.user_id:
        detail = (
            "Owners cannot remove themselves. Transfer or delete the workspace instead."
            if actor.is_owner
            else "You cannot remove yourself from a workspace."
        )
        raise HTTPException(status_code=400, detail=detail)

    if target_role == ROLE_OWNER:
        raise HTTPException(status_code=403, detail="The workspace owner cannot be removed.")

    if actor.role == ROLE_ADMIN and target_role == ROLE_ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Admins can only remove ordinary members. Ask the owner to remove another admin.",
        )


def assert_can_change_role(actor: WorkspaceContext, target_user_id: str, target_role: str, new_role: str) -> None:
    """Who may change whose role, and to what.

    Only the owner reaches this (the route depends on require_workspace_owner),
    which by itself rules out self-promotion and admins minting other admins.
    What's left to enforce is that the owner cannot demote or duplicate
    themselves.
    """
    if new_role not in ASSIGNABLE_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Must be one of: {', '.join(ASSIGNABLE_ROLES)}.",
        )

    if target_role == ROLE_OWNER or target_user_id == actor.user_id:
        raise HTTPException(
            status_code=400,
            detail="The workspace owner's role cannot be changed. Every workspace must keep exactly one owner.",
        )


# --- Per-connection access rules -----------------------------------------

def can_access_connection(
    access_level: str,
    creator_user_id: str,
    user_id: str,
    role: str | None,
    has_explicit_grant: bool,
) -> bool:
    """Whether this user may see and use this connection.

    Pure by design -- every input is already-fetched state, so the rule can
    be read in one place and tested without a database, exactly like
    assert_can_remove_member(). The caller is responsible for having already
    established that the user is a member of the connection's workspace;
    this answers the narrower per-connection question only.

    Priority order, as designed:

      1. "team" connections are open to the whole workspace. This is the
         default and the pre-existing behaviour, so nothing regresses.
      2. Admins and owners always have access. An admin who cannot see a
         restricted connection cannot administer it -- they could not fix a
         bad grant or hand it to the right person.
      3. The creator always has access. Restricting a connection you made
         should not lock you out of it.
      4. Otherwise, only an explicit grant.

    Anything that is not exactly "team" is treated as restricted. An
    unrecognised value therefore fails closed rather than open.
    """
    if access_level == ACCESS_TEAM:
        return True
    if is_at_least(role, ROLE_ADMIN):
        return True
    if creator_user_id == user_id:
        return True
    return has_explicit_grant


def assert_valid_access_level(access_level: str) -> None:
    """Rejects an unrecognised access_level with a readable 400 rather than
    letting it reach the database and fail on the CHECK constraint."""
    if access_level not in VALID_ACCESS_LEVELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid access level. Must be one of: {', '.join(VALID_ACCESS_LEVELS)}.",
        )
