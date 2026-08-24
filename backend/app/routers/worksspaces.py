from fastapi import APIRouter, HTTPException, Depends

from app.dependencies import get_current_user_id
from app.permissions import (
    WorkspaceContext, assert_can_change_role, assert_can_remove_member,
    require_workspace_admin, require_workspace_member, require_workspace_owner,
)
from app.schemas import (
    WorkspaceOut, CreateWorkspaceRequest, InviteMemberRequest, WorkspaceMemberOut,
    UpdateMemberRoleRequest,
)
from app.db.workspaces import (
    list_user_workspaces, create_team_workspace, invite_member_by_email,
    list_workspace_members, remove_member, get_membership, set_member_role,
)

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


def _to_out(ws) -> WorkspaceOut:
    return WorkspaceOut(id=ws.id, name=ws.name, type=ws.type, owner_id=ws.owner_id, created_at=ws.created_at)


@router.get("", response_model=list[WorkspaceOut])
def get_my_workspaces(user_id: str = Depends(get_current_user_id)):
    # Membership is the filter -- there is no workspace here to be a member
    # of yet, so there is no role to require.
    return [_to_out(w) for w in list_user_workspaces(user_id)]


@router.post("", response_model=WorkspaceOut)
def create_workspace(payload: CreateWorkspaceRequest, user_id: str = Depends(get_current_user_id)):
    # Unchanged: any authenticated user may create a team workspace, and
    # becomes its owner. Roles govern existing workspaces, not creating one.
    workspace = create_team_workspace(user_id, payload.name)
    return _to_out(workspace)


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberOut])
def get_members(ctx: WorkspaceContext = Depends(require_workspace_member)):
    # Every member can see who else is in the workspace -- unchanged. The
    # frontend needs this to know the caller's own role, so restricting it
    # would break role-aware UI for ordinary members.
    return [WorkspaceMemberOut(**m) for m in list_workspace_members(ctx.workspace_id)]


@router.post("/{workspace_id}/invite")
def invite_member(
    payload: InviteMemberRequest,
    ctx: WorkspaceContext = Depends(require_workspace_admin),
):
    # Widened from owner-only to admin-or-owner: inviting members is an
    # explicit admin capability in the role model.
    try:
        invite_member_by_email(ctx.workspace_id, payload.email, ctx.user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="No account found with that email.")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "invited"}


@router.delete("/{workspace_id}/members/{member_user_id}")
def remove_workspace_member(
    member_user_id: str,
    ctx: WorkspaceContext = Depends(require_workspace_admin),
):
    # Widened to admin-or-owner, then narrowed by target: an admin may only
    # remove ordinary members, and nobody may remove the owner.
    membership = get_membership(ctx.workspace_id, member_user_id)
    if membership is None:
        raise HTTPException(status_code=404, detail="This user is not a member of this workspace.")

    assert_can_remove_member(ctx, member_user_id, membership["role"])

    remove_member(ctx.workspace_id, member_user_id, ctx.user_id)
    return {"status": "removed"}


@router.patch("/{workspace_id}/members/{member_user_id}/role", response_model=WorkspaceMemberOut)
def update_member_role(
    member_user_id: str,
    payload: UpdateMemberRoleRequest,
    ctx: WorkspaceContext = Depends(require_workspace_owner),
):
    """Promote a member to admin, or demote an admin back to member.

    Owner-only. The owner's own role is never a valid target, so a workspace
    always keeps exactly one owner; ownership transfer would need its own
    endpoint and is not supported.

    Looking the membership up by (workspace_id, user_id) is also what stops
    a caller editing a membership that belongs to a different workspace --
    a valid user id from elsewhere simply isn't found here.
    """
    membership = get_membership(ctx.workspace_id, member_user_id)
    if membership is None:
        raise HTTPException(status_code=404, detail="This user is not a member of this workspace.")

    new_role = payload.role.strip().lower()
    assert_can_change_role(ctx, member_user_id, membership["role"], new_role)

    if membership["role"] == new_role:
        return WorkspaceMemberOut(**membership)

    updated = set_member_role(ctx.workspace_id, member_user_id, new_role, ctx.user_id)
    return WorkspaceMemberOut(**updated)
