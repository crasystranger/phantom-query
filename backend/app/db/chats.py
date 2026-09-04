"""
Chats & Chat Turns

Chats belong to a workspace, same as connections. A chat is created by a
specific user (tracked for attribution) but visible to every member of the
workspace it lives in.
"""
import uuid
import datetime

from app.db.database import SessionLocal
from app.db.models import Chat, ChatTurn
from app.db.workspaces import is_member
from app.db.audit import log_action

_MODEL_NAME = "gemini-3.5-flash-lite"


def create_chat(user_id: str, workspace_id: str, connection_id: str, title: str) -> Chat:
    if not is_member(user_id, workspace_id):
        raise PermissionError("You are not a member of this workspace.")

    db = SessionLocal()
    try:
        now = datetime.datetime.utcnow().isoformat()
        chat = Chat(
            id=str(uuid.uuid4()), user_id=user_id, workspace_id=workspace_id,
            connection_id=connection_id, title=title, created_at=now, last_active_at=now,
        )
        db.add(chat)
        db.commit()
        db.refresh(chat)
    finally:
        db.close()

    log_action(
        workspace_id, user_id, "chat.created", "chat", chat.id,
        {"connection_id": connection_id},
    )

    return chat


def list_chats(user_id: str, connection_id: str) -> list[Chat]:
    db = SessionLocal()
    try:
        chats = db.query(Chat).filter(Chat.connection_id == connection_id).all()
        return [c for c in chats if is_member(user_id, c.workspace_id)]
    finally:
        db.close()


def get_chat(chat_id: str, user_id: str) -> Chat:
    db = SessionLocal()
    try:
        chat = db.query(Chat).filter(Chat.id == chat_id).first()
        if chat is None:
            raise KeyError(f"No chat with id {chat_id}")
        if not is_member(user_id, chat.workspace_id):
            raise KeyError(f"No chat with id {chat_id}")
        return chat
    finally:
        db.close()


def touch_chat(chat_id: str) -> None:
    """Updates last_active_at so this chat sorts to the top of 'recent chats'."""
    db = SessionLocal()
    try:
        db.query(Chat).filter(Chat.id == chat_id).update(
            {"last_active_at": datetime.datetime.utcnow().isoformat()}
        )
        db.commit()
    finally:
        db.close()


def add_turn(chat_id: str, author_user_id: str, question: str, generated_sql: str) -> ChatTurn:
    db = SessionLocal()
    try:
        turn = ChatTurn(
            id=str(uuid.uuid4()), chat_id=chat_id, kind="query",
            author_user_id=author_user_id, question=question,
            generated_sql=generated_sql, executed=False, model_used=_MODEL_NAME,
            created_at=datetime.datetime.utcnow().isoformat(),
        )
        db.add(turn)
        db.commit()
        db.refresh(turn)
        return turn
    finally:
        db.close()


def add_message_turn(chat_id: str, author_user_id: str, text: str) -> ChatTurn:
    db = SessionLocal()
    try:
        turn = ChatTurn(
            id=str(uuid.uuid4()), chat_id=chat_id, kind="message",
            author_user_id=author_user_id, question=text,
            generated_sql=None, model_used=None, executed=False,
            created_at=datetime.datetime.utcnow().isoformat(),
        )
        db.add(turn)
        db.commit()
        db.refresh(turn)
        return turn
    finally:
        db.close()


def update_turn(
    turn_id: str, edited_sql: str | None = None, executed: bool | None = None,
    row_count: int | None = None, duration_ms: int | None = None,
) -> ChatTurn:
    db = SessionLocal()
    try:
        turn = db.query(ChatTurn).filter(ChatTurn.id == turn_id).first()
        if turn is None:
            raise KeyError(f"No turn with id {turn_id}")
        if edited_sql is not None:
            turn.edited_sql = edited_sql
        if executed is not None:
            turn.executed = executed
        if row_count is not None:
            turn.row_count = row_count
        if duration_ms is not None:
            turn.duration_ms = duration_ms
        db.commit()
        db.refresh(turn)
        return turn
    finally:
        db.close()


def list_turns(chat_id: str) -> list[ChatTurn]:
    db = SessionLocal()
    try:
        return (
            db.query(ChatTurn)
            .filter(ChatTurn.chat_id == chat_id)
            .order_by(ChatTurn.created_at.asc())
            .all()
        )
    finally:
        db.close()


def list_turns_before(chat_id: str, before_created_at: str) -> list[ChatTurn]:
    db = SessionLocal()
    try:
        return (
            db.query(ChatTurn)
            .filter(ChatTurn.chat_id == chat_id, ChatTurn.created_at < before_created_at)
            .order_by(ChatTurn.created_at.asc())
            .all()
        )
    finally:
        db.close()


def delete_turns_after(chat_id: str, after_created_at: str) -> None:
    db = SessionLocal()
    try:
        db.query(ChatTurn).filter(
            ChatTurn.chat_id == chat_id, ChatTurn.created_at > after_created_at
        ).delete()
        db.commit()
    finally:
        db.close()


def edit_turn_question(turn_id: str, new_question: str, new_sql: str, user_id: str, workspace_id: str) -> ChatTurn:
    db = SessionLocal()
    try:
        turn = db.query(ChatTurn).filter(ChatTurn.id == turn_id).first()
        if turn is None:
            raise KeyError(f"No turn with id {turn_id}")
        old_question = turn.question
        turn.question = new_question
        turn.generated_sql = new_sql
        turn.edited_sql = None
        turn.executed = False
        turn.row_count = None
        turn.duration_ms = None
        db.commit()
        db.refresh(turn)
    finally:
        db.close()

    log_action(
        workspace_id, user_id, "turn.edited", "turn", turn_id,
        {"old_question": old_question, "new_question": new_question},
    )

    return turn


def get_turn_with_ownership_check(turn_id: str, user_id: str) -> ChatTurn:
    """Verifies the requesting user is a member of the workspace the
    turn's parent chat belongs to -- not a direct owner match anymore,
    since any workspace member can act on shared chats."""
    db = SessionLocal()
    try:
        turn = (
            db.query(ChatTurn)
            .join(Chat, ChatTurn.chat_id == Chat.id)
            .filter(ChatTurn.id == turn_id)
            .first()
        )
        if turn is None:
            raise KeyError(f"No turn with id {turn_id}")
        chat = db.query(Chat).filter(Chat.id == turn.chat_id).first()
        if chat is None or not is_member(user_id, chat.workspace_id):
            raise KeyError(f"No turn with id {turn_id}")
        return turn
    finally:
        db.close()


def delete_turn(turn_id: str, user_id: str, workspace_id: str) -> None:
    db = SessionLocal()
    try:
        turn = db.query(ChatTurn).filter(ChatTurn.id == turn_id).first()
        question = turn.question if turn else None
        db.query(ChatTurn).filter(ChatTurn.id == turn_id).delete()
        db.commit()
    finally:
        db.close()

    log_action(
        workspace_id, user_id, "turn.deleted", "turn", turn_id,
        {"question": question},
    )