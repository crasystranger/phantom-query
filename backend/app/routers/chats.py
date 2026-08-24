from fastapi import APIRouter, HTTPException, Depends

from app.schemas import ChatOut, ChatTurnOut, CreateChatRequest, AddTurnRequest, UpdateTurnRequest, NLQueryResponse
from app.db.chats import create_chat, list_chats, get_chat, touch_chat, add_turn, update_turn, list_turns, get_turn_with_ownership_check, delete_turn, edit_turn_question, list_turns_before, delete_turns_after
from app.services.nl_to_sql import generate_sql
from app.dependencies import get_current_user_id
from app.schemas import EditTurnRequest



router = APIRouter(prefix="/api/chats", tags=["chats"])


def _chat_out(c) -> ChatOut:
    return ChatOut(
        id=c.id, connection_id=c.connection_id, title=c.title,
        created_at=c.created_at, last_active_at=c.last_active_at,
    )


def _turn_out(t) -> ChatTurnOut:
    return ChatTurnOut(
        id=t.id, chat_id=t.chat_id, question=t.question, generated_sql=t.generated_sql,
        edited_sql=t.edited_sql, executed=t.executed, row_count=t.row_count,
        duration_ms=t.duration_ms, model_used=t.model_used, created_at=t.created_at,
    )


@router.post("/turns/{turn_id}/edit", response_model=ChatTurnOut)
def edit_turn(turn_id: str, payload: EditTurnRequest, user_id: str = Depends(get_current_user_id)):
    try:
        turn = get_turn_with_ownership_check(turn_id, user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Turn not found")

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


@router.get("/{chat_id}/turns", response_model=list[ChatTurnOut])
def get_turns(chat_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        get_chat(chat_id, user_id)  # ownership check
    except KeyError:
        raise HTTPException(status_code=404, detail="Chat not found")
    return [_turn_out(t) for t in list_turns(chat_id)]


@router.post("/{chat_id}/turns", response_model=ChatTurnOut)
def create_turn(chat_id: str, payload: AddTurnRequest, user_id: str = Depends(get_current_user_id)):
    try:
        chat = get_chat(chat_id, user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Chat not found")

    prior_turns = list_turns(chat_id)
    result: NLQueryResponse = generate_sql(chat.connection_id, user_id, payload.question, prior_turns)

    turn = add_turn(chat_id, payload.question, result.sql)
    touch_chat(chat_id)

    # First question in a chat becomes its title
    if len(prior_turns) == 0:
        db_update_title(chat_id, payload.question[:60])

    return _turn_out(turn)


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