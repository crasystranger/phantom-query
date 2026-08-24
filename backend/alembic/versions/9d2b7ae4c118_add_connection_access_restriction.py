"""add per-connection access restriction

Adds the "Team Access vs Restricted" gate to connections.

  1. connections.access_level -- String, NOT NULL, server default "team".
     Every existing connection therefore becomes "team", which is exactly
     the behaviour it had before this column existed: visible to every
     member of its workspace. No existing row changes meaning, and no
     existing data is rewritten beyond filling in that default.

  2. connection_access -- the explicit grant table. Starts empty, because
     nothing is restricted yet; grants only become meaningful once an admin
     switches a connection to "restricted".

  3. A CHECK constraint pinning access_level to the two legal values, and a
     UNIQUE constraint on (connection_id, user_id) so granting is
     idempotent at the database level rather than relying on application
     code to check first.

Nothing else is touched. Chats, chat turns and query history are
deliberately left alone: restricting a connection gates *new* access, and
does not retract history that already exists.

Revision ID: 9d2b7ae4c118
Revises: 7c4e1f9ab203
Create Date: 2026-08-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9d2b7ae4c118'
down_revision: Union[str, Sequence[str], None] = '7c4e1f9ab203'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CHECK_NAME = "ck_connections_access_level"
_CHECK_SQL = "access_level IN ('team', 'restricted')"


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    # 1. The column. server_default is what backfills existing rows -- it is
    #    kept (not dropped afterwards) so the model and the database agree,
    #    and so a raw INSERT that omits the column still lands on "team"
    #    rather than failing the NOT NULL.
    op.add_column(
        "connections",
        sa.Column(
            "access_level",
            sa.String(),
            nullable=False,
            server_default="team",
        ),
    )

    # 2. The grant table.
    op.create_table(
        "connection_access",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("connection_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("granted_by", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "connection_id", "user_id", name="uq_connection_access_connection_user"
        ),
    )
    op.create_index(
        op.f("ix_connection_access_connection_id"),
        "connection_access", ["connection_id"], unique=False,
    )
    op.create_index(
        op.f("ix_connection_access_user_id"),
        "connection_access", ["user_id"], unique=False,
    )

    # 3. Pin the legal values. SQLite cannot ALTER TABLE ADD CONSTRAINT, so
    #    it needs Alembic's copy-and-move batch mode; Postgres (production)
    #    takes it directly.
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("connections") as batch_op:
            batch_op.create_check_constraint(_CHECK_NAME, _CHECK_SQL)
    else:
        op.create_check_constraint(_CHECK_NAME, "connections", _CHECK_SQL)


def downgrade() -> None:
    """Downgrade schema.

    Drops the gate entirely. Every connection becomes visible to its whole
    workspace again, which is what the pre-feature code does anyway -- but
    it is a genuine widening of access, so it should not be run casually on
    a database where anything was actually restricted.
    """
    bind = op.get_bind()

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("connections") as batch_op:
            batch_op.drop_constraint(_CHECK_NAME, type_="check")
    else:
        op.drop_constraint(_CHECK_NAME, "connections", type_="check")

    op.drop_index(op.f("ix_connection_access_user_id"), table_name="connection_access")
    op.drop_index(op.f("ix_connection_access_connection_id"), table_name="connection_access")
    op.drop_table("connection_access")
    op.drop_column("connections", "access_level")
