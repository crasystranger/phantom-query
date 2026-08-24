"""add admin workspace role

Adds the "admin" tier to workspace_members.role, turning the old
owner/member split into owner > admin > member.

The column itself needs no schema change -- role has always been a plain
String, so "admin" already fits. What this migration actually does is make
the *set of legal values* explicit and repair any membership data that
would be ambiguous under the new three-role model:

  1. Any role outside ('owner', 'admin', 'member') is normalised to
     'member'. app.permissions.rank() treats an unrecognised role as no
     access at all, so leaving stray values would silently lock people out.

  2. Every workspace's declared owner (workspaces.owner_id) is guaranteed a
     membership row with role='owner' -- repaired if it says something else,
     inserted if it is missing entirely. This is what makes "no workspace
     ends up without an owner" true rather than assumed.

  3. Any *other* membership row claiming 'owner' in a workspace it does not
     own is demoted to 'admin'. That state should not exist, but if it does,
     admin preserves the elevated access those users had while restoring the
     exactly-one-owner invariant.

  4. A CHECK constraint pins the legal values at the database level.

Existing owners stay owners. Existing members stay members. No membership
row is deleted and no other table is touched.

Revision ID: 7c4e1f9ab203
Revises: b59747d6e48a
Create Date: 2026-08-20

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c4e1f9ab203'
down_revision: Union[str, Sequence[str], None] = 'b59747d6e48a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CHECK_NAME = "ck_workspace_members_role"
_CHECK_SQL = "role IN ('owner', 'admin', 'member')"


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()

    # 1. Normalise anything unrecognised down to the least-privileged role.
    conn.execute(
        sa.text(
            "UPDATE workspace_members SET role = 'member' "
            "WHERE role IS NULL OR role NOT IN ('owner', 'admin', 'member')"
        )
    )

    # 2a. The declared owner keeps (or regains) the owner role.
    conn.execute(
        sa.text(
            "UPDATE workspace_members SET role = 'owner' "
            "WHERE role <> 'owner' AND EXISTS ("
            "  SELECT 1 FROM workspaces w "
            "  WHERE w.id = workspace_members.workspace_id "
            "    AND w.owner_id = workspace_members.user_id"
            ")"
        )
    )

    # 2b. A workspace whose owner has no membership row at all gets one.
    #     Ids are generated in Python to match how every other membership row
    #     in this codebase is created.
    orphaned = conn.execute(
        sa.text(
            "SELECT w.id, w.owner_id, w.created_at FROM workspaces w "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM workspace_members m "
            "  WHERE m.workspace_id = w.id AND m.user_id = w.owner_id"
            ")"
        )
    ).fetchall()

    for workspace_id, owner_id, created_at in orphaned:
        conn.execute(
            sa.text(
                "INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at) "
                "VALUES (:id, :workspace_id, :user_id, 'owner', :joined_at)"
            ),
            {
                "id": str(uuid.uuid4()),
                "workspace_id": workspace_id,
                "user_id": owner_id,
                "joined_at": created_at,
            },
        )

    # 3. Exactly one owner per workspace: demote any impostor to admin.
    conn.execute(
        sa.text(
            "UPDATE workspace_members SET role = 'admin' "
            "WHERE role = 'owner' AND NOT EXISTS ("
            "  SELECT 1 FROM workspaces w "
            "  WHERE w.id = workspace_members.workspace_id "
            "    AND w.owner_id = workspace_members.user_id"
            ")"
        )
    )

    # 4. Pin the legal values. SQLite cannot ALTER TABLE ADD CONSTRAINT, so
    #    it needs Alembic's copy-and-move batch mode; Postgres (production)
    #    takes it directly.
    if conn.dialect.name == "sqlite":
        with op.batch_alter_table("workspace_members") as batch_op:
            batch_op.create_check_constraint(_CHECK_NAME, _CHECK_SQL)
    else:
        op.create_check_constraint(_CHECK_NAME, "workspace_members", _CHECK_SQL)


def downgrade() -> None:
    """Downgrade schema.

    Drops the constraint and collapses admins back to members. This cannot
    restore who *was* an admin -- that information only exists in the audit
    log (member.role_changed) -- but it does return the table to a state the
    old two-role code can read safely.
    """
    conn = op.get_bind()

    if conn.dialect.name == "sqlite":
        with op.batch_alter_table("workspace_members") as batch_op:
            batch_op.drop_constraint(_CHECK_NAME, type_="check")
    else:
        op.drop_constraint(_CHECK_NAME, "workspace_members", type_="check")

    conn.execute(sa.text("UPDATE workspace_members SET role = 'member' WHERE role = 'admin'"))
