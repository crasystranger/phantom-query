"""chat_turn_kind_author_display_name

Revision ID: 986bd4e2dfd0
Revises: 9d2b7ae4c118
Create Date: 2026-09-04 11:34:09.005687

This revision is written defensively. It lived untracked in a working tree for
some time while the columns it adds were already present in deployed
databases, so on those the version table still reads 9d2b7ae4c118 and a
straight ADD COLUMN would raise DuplicateColumn -- which, because the
container runs `alembic upgrade head && uvicorn`, stops the server from
starting at all rather than merely failing to migrate.

Every step therefore checks the live schema first and skips what is already
there, so the revision converges to the same end state whether it meets a
fresh database or one that was changed out of band.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '986bd4e2dfd0'
down_revision: Union[str, Sequence[str], None] = '9d2b7ae4c118'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _existing_indexes(table: str) -> set[str]:
    return {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    chat_turn_columns = _existing_columns("chat_turns")

    if "kind" not in chat_turn_columns:
        op.add_column(
            "chat_turns",
            sa.Column("kind", sa.String(), nullable=False, server_default="query"),
        )

    if "author_user_id" not in chat_turn_columns:
        op.add_column("chat_turns", sa.Column("author_user_id", sa.String(), nullable=True))

    # Message turns carry no SQL and no model, so these two stop being
    # required. Dropping NOT NULL on an already-nullable column is a no-op.
    op.alter_column("chat_turns", "generated_sql", existing_type=sa.String(), nullable=True)
    op.alter_column("chat_turns", "model_used", existing_type=sa.String(), nullable=True)

    if "ix_chat_turns_chat_id_created_at" not in _existing_indexes("chat_turns"):
        op.create_index(
            "ix_chat_turns_chat_id_created_at", "chat_turns", ["chat_id", "created_at"]
        )

    # Backfill authorship for turns written before the column existed. The
    # IS NULL guard makes this safe to run more than once.
    op.execute(
        """
        UPDATE chat_turns
        SET author_user_id = chats.user_id
        FROM chats
        WHERE chat_turns.chat_id = chats.id
          AND chat_turns.author_user_id IS NULL
        """
    )

    if "display_name" not in _existing_columns("workspace_members"):
        op.add_column("workspace_members", sa.Column("display_name", sa.String(), nullable=True))


def downgrade() -> None:
    if "display_name" in _existing_columns("workspace_members"):
        op.drop_column("workspace_members", "display_name")

    if "ix_chat_turns_chat_id_created_at" in _existing_indexes("chat_turns"):
        op.drop_index("ix_chat_turns_chat_id_created_at", table_name="chat_turns")

    # Message turns have NULL in both of these by design, so restoring NOT NULL
    # would fail against any database that has served a team conversation.
    # Clear them out first so the downgrade is actually runnable.
    op.execute("DELETE FROM chat_turns WHERE kind = 'message'")
    op.alter_column("chat_turns", "model_used", existing_type=sa.String(), nullable=False)
    op.alter_column("chat_turns", "generated_sql", existing_type=sa.String(), nullable=False)

    chat_turn_columns = _existing_columns("chat_turns")
    if "author_user_id" in chat_turn_columns:
        op.drop_column("chat_turns", "author_user_id")
    if "kind" in chat_turn_columns:
        op.drop_column("chat_turns", "kind")
