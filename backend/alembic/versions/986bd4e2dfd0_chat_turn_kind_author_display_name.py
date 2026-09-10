"""chat_turn_kind_author_display_name

Revision ID: 986bd4e2dfd0
Revises: 9d2b7ae4c118
Create Date: 2026-09-04 11:34:09.005687

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '986bd4e2dfd0'
down_revision: Union[str, Sequence[str], None] = '9d2b7ae4c118'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chat_turns", sa.Column("kind", sa.String(), nullable=False, server_default="query"))
    op.add_column("chat_turns", sa.Column("author_user_id", sa.String(), nullable=True))
    op.alter_column("chat_turns", "generated_sql", nullable=True)
    op.alter_column("chat_turns", "model_used", nullable=True)
    op.create_index("ix_chat_turns_chat_id_created_at", "chat_turns", ["chat_id", "created_at"])

    op.execute("""
        UPDATE chat_turns
        SET author_user_id = chats.user_id
        FROM chats
        WHERE chat_turns.chat_id = chats.id
          AND chat_turns.author_user_id IS NULL
    """)

    op.add_column("workspace_members", sa.Column("display_name", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("workspace_members", "display_name")
    op.drop_index("ix_chat_turns_chat_id_created_at", table_name="chat_turns")
    op.alter_column("chat_turns", "model_used", nullable=False)
    op.alter_column("chat_turns", "generated_sql", nullable=False)
    op.drop_column("chat_turns", "author_user_id")
    op.drop_column("chat_turns", "kind")
