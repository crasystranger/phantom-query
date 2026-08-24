"""
Workspace Service

Owns all workspace and membership logic. ConnectionManager and chats.py
call into this rather than checking user_id directly -- this is the single
place that answers "which workspaces does this user belong to" and
"is this user allowed in this workspace."
"""
import uuid
import datetime

from app.db.database import SessionLocal
from app.db.models import Workspace, WorkspaceMember, User
from app.db.audit import log_action


def get_user_workspace_ids(user_id: str) -> list[str]:
    """Every workspace this user is a member of (personal + all teams)."""
    db = SessionLocal()
    try:
        rows = db.query(WorkspaceMember.workspace_id).filter(
            WorkspaceMember.user_id == user_id
        ).all()
        return [r[0] for r in rows]
    finally:
        db.close()


def is_member(user_id: str, workspace_id: str) -> bool:
    db = SessionLocal()
    try:
        return db.query(WorkspaceMember).filter(
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.workspace_id == workspace_id,
        ).first() is not None
    finally:
        db.close()


def get_role(user_id: str, workspace_id: str) -> str | None:
    """The caller's role in this workspace, or None if they aren't a member.

    Role semantics ("owner" > "admin" > "member") are defined in
    app.permissions -- this function only reads the stored value. Nothing
    here should compare roles directly; that comparison belongs in one place.
    """
    db = SessionLocal()
    try:
        member = db.query(WorkspaceMember).filter(
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.workspace_id == workspace_id,
        ).first()
        return member.role if member else None
    finally:
        db.close()


def get_membership(workspace_id: str, user_id: str) -> dict | None:
    """One membership, scoped to one workspace, in the same shape
    list_workspace_members() returns.

    Scoping by workspace_id as well as user_id is what stops a caller from
    reaching a membership that belongs to a different workspace by guessing
    a user id -- the route only knows the workspace it was called on.
    """
    db = SessionLocal()
    try:
        member = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        ).first()
        if member is None:
            return None
        user = db.query(User).filter(User.id == member.user_id).first()
        return {
            "user_id": member.user_id,
            "name": user.name if user else "Unknown",
            "email": user.email if user else "",
            "role": member.role,
            "joined_at": member.joined_at,
        }
    finally:
        db.close()


def get_personal_workspace_id(user_id: str) -> str:
    """Every user has exactly one personal workspace, created at signup."""
    db = SessionLocal()
    try:
        ws = db.query(Workspace).filter(
            Workspace.owner_id == user_id, Workspace.type == "personal"
        ).first()
        if ws is None:
            raise KeyError(f"No personal workspace found for user {user_id}")
        return ws.id
    finally:
        db.close()


def create_personal_workspace(user_id: str) -> Workspace:
    """Not audit-logged -- this happens automatically at signup, before
    there's a meaningful "actor performing an action" in the compliance
    sense. The account creation itself is the relevant event, not this."""
    db = SessionLocal()
    try:
        now = datetime.datetime.utcnow().isoformat()
        workspace = Workspace(
            id=str(uuid.uuid4()), name="Personal", type="personal",
            owner_id=user_id, created_at=now,
        )
        db.add(workspace)
        db.flush()

        member = WorkspaceMember(
            id=str(uuid.uuid4()), workspace_id=workspace.id,
            user_id=user_id, role="owner", joined_at=now,
        )
        db.add(member)
        db.commit()
        db.refresh(workspace)
        return workspace
    finally:
        db.close()


def list_user_workspaces(user_id: str) -> list[Workspace]:
    db = SessionLocal()
    try:
        workspace_ids = [
            r[0] for r in db.query(WorkspaceMember.workspace_id)
            .filter(WorkspaceMember.user_id == user_id).all()
        ]
        return db.query(Workspace).filter(Workspace.id.in_(workspace_ids)).all()
    finally:
        db.close()


def create_team_workspace(owner_id: str, name: str) -> Workspace:
    db = SessionLocal()
    try:
        now = datetime.datetime.utcnow().isoformat()
        workspace = Workspace(
            id=str(uuid.uuid4()), name=name, type="team",
            owner_id=owner_id, created_at=now,
        )
        db.add(workspace)
        db.flush()

        member = WorkspaceMember(
            id=str(uuid.uuid4()), workspace_id=workspace.id,
            user_id=owner_id, role="owner", joined_at=now,
        )
        db.add(member)
        db.commit()
        db.refresh(workspace)
    finally:
        db.close()

    log_action(
        workspace.id, owner_id, "workspace.created", "workspace", workspace.id,
        {"name": name, "type": "team"},
    )

    return workspace


def invite_member_by_email(workspace_id: str, email: str, inviter_user_id: str) -> WorkspaceMember:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email.lower().strip()).first()
        if user is None:
            raise KeyError(f"No user found with email {email}")

        existing = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
        ).first()
        if existing is not None:
            raise ValueError("This user is already a member of the workspace.")

        member = WorkspaceMember(
            id=str(uuid.uuid4()), workspace_id=workspace_id,
            user_id=user.id, role="member",
            joined_at=datetime.datetime.utcnow().isoformat(),
        )
        db.add(member)
        db.commit()
        db.refresh(member)
    finally:
        db.close()

    log_action(
        workspace_id, inviter_user_id, "member.invited", "workspace_member", member.id,
        {"invited_email": email},
    )

    return member


def list_workspace_members(workspace_id: str) -> list[dict]:
    db = SessionLocal()
    try:
        members = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == workspace_id
        ).all()
        result = []
        for m in members:
            user = db.query(User).filter(User.id == m.user_id).first()
            result.append({
                "user_id": m.user_id,
                "name": user.name if user else "Unknown",
                "email": user.email if user else "",
                "role": m.role,
                "joined_at": m.joined_at,
            })
        return result
    finally:
        db.close()


def remove_member(workspace_id: str, user_id: str, remover_user_id: str) -> None:
    """Deletes a membership. Deliberately unguarded -- *who* may remove
    *whom* is decided by app.permissions.assert_can_remove_member before
    this is called, so the rule lives in exactly one place."""
    db = SessionLocal()
    try:
        member = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        ).first()
        removed_role = member.role if member else None
        db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        ).delete()
        db.commit()
    finally:
        db.close()

    log_action(
        workspace_id, remover_user_id, "member.removed", "workspace_member", user_id,
        {"removed_user_id": user_id, "removed_role": removed_role},
    )


def set_member_role(
    workspace_id: str, target_user_id: str, new_role: str, actor_user_id: str
) -> dict:
    """Changes a member's role and records it in the audit log.

    Also deliberately unguarded: app.permissions.assert_can_change_role
    decides whether this is allowed at all, including that the owner's role
    is never the target, which is what keeps "exactly one owner" true.

    Returns the updated membership, joined to the user record so the caller
    can respond with the same shape list_workspace_members() produces.
    """
    db = SessionLocal()
    try:
        member = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == target_user_id,
        ).first()
        if member is None:
            raise KeyError(f"No membership for user {target_user_id} in workspace {workspace_id}")

        previous_role = member.role
        member.role = new_role
        db.commit()

        user = db.query(User).filter(User.id == target_user_id).first()
        result = {
            "user_id": target_user_id,
            "name": user.name if user else "Unknown",
            "email": user.email if user else "",
            "role": new_role,
            "joined_at": member.joined_at,
        }
        target_email = result["email"]
    finally:
        db.close()

    log_action(
        workspace_id, actor_user_id, "member.role_changed", "workspace_member", target_user_id,
        {
            "target_user_id": target_user_id,
            "target_email": target_email,
            "previous_role": previous_role,
            "new_role": new_role,
        },
    )

    return result