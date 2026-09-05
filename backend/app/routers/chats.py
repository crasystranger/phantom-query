from fastapi import APIRouter, HTTPException, Depends

from app.schemas import ChatOut, ChatTurnOut, CreateChatRequest, AddTurnRequest, UpdateTurnRequest, NLQueryResponse
from app.db.chats import (
    create_chat, list_chats, get_chat, touch_chat, add_turn, add_message_turn,
    update_turn, list_turns, get_turn_with_ownership_check, delete_turn,
    edit_turn_question, list_turns_before, delete_turns_after
)
from app.db.workspaces import resolve_author_names
from app.services.nl_to_sql import generate_sql
from app.dependencies import get_current_user_id
from app.schemas import EditTurnRequest
from app.db.token_usage import is_over_budget
from app.db.models import Workspace
from app.db.database import SessionLocal



router = APIRouter(prefix="/api/chats", tags=["chats"])


def _chat_out(c) -> ChatOut:
    return ChatOut(
        id=c.id, connection_id=c.connection_id, title=c.title,
        created_at=c.created_at, last_active_at=c.last_active_at,
    )


def _turn_out(t, author_name: str | None = None) -> ChatTurnOut:
    return ChatTurnOut(
        id=t.id, chat_id=t.chat_id, kind=t.kind,
        author_user_id=t.author_user_id, author_name=author_name,
        question=t.question, generated_sql=t.generated_sql,
        edited_sql=t.edited_sql, executed=t.executed,
        row_count=t.row_count, duration_ms=t.duration_ms,
        model_used=t.model_used, created_at=t.created_at,
    )


@router.post("/turns/{turn_id}/edit", response_model=ChatTurnOut)
def edit_turn(turn_id: str, payload: EditTurnRequest, user_id: str = Depends(get_current_user_id)):
    try:
        turn = get_turn_with_ownership_check(turn_id, user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Turn not found")

    if is_over_budget(user_id):
        raise HTTPException(
            status_code=429,
            detail="Daily AI usage limit reached. This resets at midnight UTC.",
        )

    chat = get_chat(turn.chat_id, user_id)

    

    # Only turns strictly before this one provide conversation context --
    # everything after gets discarded, since it was built on top of the
    # question we're now replacing.
    prior_turns = list_turns_before(turn.chat_id, turn.created_at)

    result = generate_sql(chat.connection_id, user_id, payload.question, prior_turns)

    delete_turns_after(turn.chat_id, turn.created_at)
    updated = edit_turn_question(turn_id, payload.question, result.sql, user_id, chat.workspace_id)
    touch_chat(turn.chat_id)

    return _turn_out(updated)


@router.get("/by-connection/{connection_id}", response_model=list[ChatOut])
def get_chats_for_connection(connection_id: str, user_id: str = Depends(get_current_user_id)):
    return [_chat_out(c) for c in list_chats(user_id, connection_id)]


@router.post("", response_model=ChatOut)
def start_chat(payload: CreateChatRequest, user_id: str = Depends(get_current_user_id)):
    try:
        chat = create_chat(user_id, payload.workspace_id, payload.connection_id, title="New chat")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return _chat_out(chat)


def _get_workspace_type(workspace_id: str) -> str:
    db = SessionLocal()
    try:
        ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
        return ws.type if ws else "personal"
    finally:
        db.close()


@router.post("/{chat_id}/turns", response_model=ChatTurnOut)
def create_turn(chat_id: str, payload: AddTurnRequest, user_id: str = Depends(get_current_user_id)):
    try:
        chat = get_chat(chat_id, user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Chat not found")

    workspace_type = _get_workspace_type(chat.workspace_id) if chat.workspace_id else "personal"

    raw = payload.question.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    if workspace_type == "personal":
        kind, body = "query", raw
    else:
        if raw.startswith("//"):
            kind, body = "message", raw[1:]
        elif raw.startswith("/"):
            kind, body = "query", raw[1:].strip()
        else:
            kind, body = "message", raw

    if not body:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    if kind == "message":
        turn = add_message_turn(chat_id, user_id, body)
        touch_chat(chat_id)
        return _turn_out(turn)

    # --- query path only below this line ---
    if is_over_budget(user_id):
        raise HTTPException(status_code=429, detail="Daily AI usage limit reached. This resets at midnight UTC.")

    prior_turns = [t for t in list_turns(chat_id) if t.kind == "query"]
    result: NLQueryResponse = generate_sql(chat.connection_id, user_id, body, prior_turns)

    turn = add_turn(chat_id, user_id, body, result.sql)
    touch_chat(chat_id)

    if len(prior_turns) == 0:
        db_update_title(chat_id, body[:60])

    return _turn_out(turn)


@router.get("/{chat_id}/turns", response_model=list[ChatTurnOut])
def get_turns(chat_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        chat = get_chat(chat_id, user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Chat not found")

    turns = list_turns(chat_id)
    author_ids = {t.author_user_id for t in turns if t.author_user_id}
    names = resolve_author_names(chat.workspace_id, author_ids)
    return [_turn_out(t, author_name=names.get(t.author_user_id)) for t in turns]


@router.patch("/turns/{turn_id}", response_model=ChatTurnOut)
def patch_turn(turn_id: str, payload: UpdateTurnRequest, user_id: str = Depends(get_current_user_id)):
    try:
        get_turn_with_ownership_check(turn_id, user_id)  # raises KeyError if not owned
    except KeyError:
        raise HTTPException(status_code=404, detail="Turn not found")

    turn = update_turn(
        turn_id, edited_sql=payload.edited_sql, executed=payload.executed,
        row_count=payload.row_count, duration_ms=payload.duration_ms,
    )
    return _turn_out(turn)


@router.delete("/turns/{turn_id}")
def remove_turn(turn_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        turn = get_turn_with_ownership_check(turn_id, user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Turn not found")
    chat = get_chat(turn.chat_id, user_id)
    delete_turn(turn_id, user_id, chat.workspace_id)
    return {"status": "deleted"}


def db_update_title(chat_id: str, title: str) -> None:
    from app.db.database import SessionLocal
    from app.db.models import Chat
    db = SessionLocal()
    try:
        db.query(Chat).filter(Chat.id == chat_id).update({"title": title})
        db.commit()
    finally:
        db.close()