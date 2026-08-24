import json

from fastapi import APIRouter, Depends

from app.schemas import AuditLogOut
from app.db.audit import list_audit_logs
from app.db.database import SessionLocal
from app.db.models import User
from app.permissions import WorkspaceContext, require_workspace_admin

router = APIRouter(prefix="/api/audit-logs", tags=["audit-logs"])


@router.get("", response_model=list[AuditLogOut])
def get_audit_logs(
    action: str | None = None,
    ctx: WorkspaceContext = Depends(require_workspace_admin),
):
    """Admin-or-owner only.

    This is a deliberate narrowing from the previous member-level access:
    the log records every member's activity, which makes it an
    administrative surface rather than a collaborative one. See the note in
    app.permissions. `workspace_id` is still a required query parameter --
    it's consumed by the dependency.
    """
    logs = list_audit_logs(ctx.workspace_id, action_filter=action)

    # Resolve actor names in one batch query rather than N+1 lookups
    db = SessionLocal()
    try:
        actor_ids = {log.actor_user_id for log in logs}
        users = db.query(User).filter(User.id.in_(actor_ids)).all()
        name_by_id = {u.id: u.name for u in users}
    finally:
        db.close()

    return [
        AuditLogOut(
            id=log.id,
            actor_user_id=log.actor_user_id,
            actor_name=name_by_id.get(log.actor_user_id, "Unknown"),
            action=log.action,
            target_type=log.target_type,
            target_id=log.target_id,
            metadata=json.loads(log.metadata_json) if log.metadata_json else None,
            created_at=log.created_at,
        )
        for log in logs
    ]