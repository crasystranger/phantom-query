from fastapi import APIRouter, HTTPException, Depends

from app.schemas import FolderOut, CreateFolderRequest, MoveConnectionRequest
from app.db.folders import create_folder, list_folders, delete_folder, move_connection
from app.dependencies import get_current_user_id

router = APIRouter(prefix="/api/folders", tags=["folders"])


def _to_out(f) -> FolderOut:
    return FolderOut(id=f.id, workspace_id=f.workspace_id, name=f.name, parent_id=f.parent_id, created_at=f.created_at)


@router.get("", response_model=list[FolderOut])
def get_folders(workspace_id: str, user_id: str = Depends(get_current_user_id)):
    return [_to_out(f) for f in list_folders(user_id, workspace_id)]


@router.post("", response_model=FolderOut)
def create_new_folder(payload: CreateFolderRequest, user_id: str = Depends(get_current_user_id)):
    try:
        folder = create_folder(user_id, payload.workspace_id, payload.name, payload.parent_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return _to_out(folder)


@router.delete("/{folder_id}")
def remove_folder(folder_id: str, user_id: str = Depends(get_current_user_id)):
    delete_folder(folder_id, user_id)
    return {"status": "deleted"}


@router.patch("/connections/{connection_id}/move")
def move_connection_to_folder(connection_id: str, payload: MoveConnectionRequest, user_id: str = Depends(get_current_user_id)):
    try:
        move_connection(connection_id, user_id, payload.folder_id)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return {"status": "moved"}