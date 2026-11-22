from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas, services as S
from ..config import WORKSPACE_NAME
from ..database import get_db
from ..deps import current_user
from ..models import Board, BoardColumn, BoardMember, Task, User

router = APIRouter(tags=["users"])


@router.get("/workspace", response_model=schemas.WorkspaceOut)
def workspace(db: Session = Depends(get_db)):
    return schemas.WorkspaceOut(name=WORKSPACE_NAME, members_count=db.scalar(select(func.count(User.id))) or 0)


@router.get("/users", response_model=list[schemas.UserStatsOut])
def list_users(db: Session = Depends(get_db)):
    users = list(db.scalars(select(User).order_by(User.id)))
    boards = dict(db.execute(
        select(BoardMember.user_id, func.count(BoardMember.id))
        .join(Board, Board.id == BoardMember.board_id).where(Board.is_archived.is_(False))
        .group_by(BoardMember.user_id)
    ).all())
    return [
        schemas.UserStatsOut(**S.user_out(u).model_dump(), boards_count=boards.get(u.id, 0),
                             active_tasks=S.active_tasks_count(db, u.id))
        for u in users
    ]


@router.post("/users", response_model=schemas.UserOut, status_code=201)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db), me: User = Depends(current_user)):
    if db.scalar(select(User).where(func.lower(User.email) == payload.email)):
        raise HTTPException(409, "Пользователь с таким email уже есть")
    user = S.find_or_create_user(db, payload.email, payload.name, payload.position)
    db.commit()
    return S.user_out(user)


@router.get("/me", response_model=schemas.MeOut)
def me_info(db: Session = Depends(get_db), me: User = Depends(current_user)):
    owned = db.scalar(select(func.count(BoardMember.id)).where(
        BoardMember.user_id == me.id, BoardMember.role == "owner")) or 0
    return schemas.MeOut(user=S.user_out(me), active_tasks=S.active_tasks_count(db, me.id), owned_boards=owned)


@router.get("/me/tasks", response_model=list[schemas.MyTaskOut])
def my_tasks(db: Session = Depends(get_db), me: User = Depends(current_user)):
    """Active tasks assigned to the current user (not in a final column, board not archived)."""
    rows = db.execute(
        select(Task, BoardColumn, Board)
        .join(BoardColumn, Task.column_id == BoardColumn.id)
        .join(Board, Task.board_id == Board.id)
        .join(BoardMember, (BoardMember.board_id == Board.id) & (BoardMember.user_id == me.id))
        .where(Task.assignee_id == me.id, BoardColumn.is_final.is_(False), Board.is_archived.is_(False))
    ).all()
    counts = S.comment_counts(db, [t.id for t, _, _ in rows])
    out = [
        schemas.MyTaskOut(task=S.task_out(t, counts.get(t.id, 0)),
                          board={"id": b.id, "name": b.name, "color": b.color},
                          column=S.column_out(c))
        for t, c, b in rows
    ]
    # overdue first, then by due date (no due date last), then by board
    out.sort(key=lambda r: (not r.task.is_overdue, r.task.due_date is None,
                            r.task.due_date or r.task.created_at.date(), r.board["id"]))
    return out
