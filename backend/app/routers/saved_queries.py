from fastapi import APIRouter, HTTPException, Depends

from app.schemas import SavedQueryOut, SaveQueryRequest
from app.db.saved_queries import save_query, list_saved_queries, delete_saved_query
from app.dependencies import get_current_user_id

router = APIRouter(prefix="/api/saved-queries", tags=["saved-queries"])


def _to_out(q) -> SavedQueryOut:
    return SavedQueryOut(
        id=q.id, connection_id=q.connection_id, name=q.name,
        question=q.question, sql=q.sql, created_at=q.created_at,
    )


@router.get("", response_model=list[SavedQueryOut])
def get_saved_queries(workspace_id: str, user_id: str = Depends(get_current_user_id)):
    return [_to_out(q) for q in list_saved_queries(user_id, workspace_id)]


@router.post("", response_model=SavedQueryOut)
def create_saved_query(payload: SaveQueryRequest, user_id: str = Depends(get_current_user_id)):
    try:
        record = save_query(
            user_id, payload.workspace_id, payload.connection_id,
            payload.name, payload.question, payload.sql,
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return _to_out(record)


@router.delete("/{query_id}")
def remove_saved_query(query_id: str, user_id: str = Depends(get_current_user_id)):
    delete_saved_query(query_id, user_id)
    return {"status": "deleted"}