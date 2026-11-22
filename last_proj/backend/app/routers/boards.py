from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas, services as S
from ..database import get_db
from ..deps import current_user
from ..models import ROLE_OWNER, Board, BoardColumn, BoardMember, Task, User, utcnow
from ..realtime import hub

router = APIRouter(prefix="/boards", tags=["boards"])


@router.get("", response_model=list[schemas.BoardSummaryOut])
def list_boards(
    filter: Literal["all", "favorites", "archived"] = "all",
    db: Session = Depends(get_db), me: User = Depends(current_user),
):
    q = select(Board, BoardMember).join(BoardMember, BoardMember.board_id == Board.id).where(BoardMember.user_id == me.id)
    if filter == "archived":
        q = q.where(Board.is_archived.is_(True))
    else:
        q = q.where(Board.is_archived.is_(False))
        if filter == "favorites":
            q = q.where(BoardMember.is_favorite.is_(True))
    rows = db.execute(q.order_by(Board.id)).all()
    return [S.board_summary(db, b, m) for b, m in rows]


@router.post("", response_model=schemas.BoardOut, status_code=201)
def create_board(payload: schemas.BoardCreate, db: Session = Depends(get_db), me: User = Depends(current_user)):
    if payload.columns is not None:
        drafts = payload.columns
        if sum(1 for c in drafts if c.is_final) > 1:
            raise HTTPException(400, "Финальной может быть только одна колонка")
        cols = [(c.name, c.color, c.is_final) for c in drafts]
    else:
        cols = [(n, color, False) for n, color in S.TEMPLATES[payload.template]]

    board = Board(name=payload.name, description=payload.description.strip(), color=S.board_color(db),
                  owner_id=me.id, created_at=utcnow(), updated_at=utcnow())
    db.add(board)
    db.flush()
    S.add_member(db, board, me, ROLE_OWNER)

    created: list[BoardColumn] = []
    for i, (name, color, final) in enumerate(cols):
        col = BoardColumn(board_id=board.id, name=name, color=color or S.column_color(created),
                          position=i, is_final=final)
        db.add(col)
        created.append(col)
    db.flush()
    S.ensure_final_column(db, board)

    for uid in dict.fromkeys(payload.member_ids):
        user = db.get(User, uid)
        if user is None:
            raise HTTPException(400, f"Пользователь {uid} не найден")
        S.add_member(db, board, user)
    for email in dict.fromkeys(payload.invite_emails):
        S.add_member(db, board, S.find_or_create_user(db, email))
    db.commit()
    return S.board_out(db, board, S.membership(db, board, me))


@router.get("/{board_id}", response_model=schemas.BoardOut)
def get_board(board_id: int, db: Session = Depends(get_db), me: User = Depends(current_user)):
    board, m = S.require_member(db, board_id, me)
    return S.board_out(db, board, m)


@router.patch("/{board_id}", response_model=schemas.BoardOut)
def update_board(board_id: int, payload: schemas.BoardUpdate, bg: BackgroundTasks,
                 db: Session = Depends(get_db), me: User = Depends(current_user)):
    board, m = S.require_owner(db, board_id, me)
    data = payload.model_dump(exclude_unset=True)
    for field in ("name", "description", "is_archived"):
        if data.get(field) is not None:
            setattr(board, field, data[field].strip() if isinstance(data[field], str) else data[field])
    S.touch(board)
    db.commit()
    bg.add_task(hub.broadcast, board.id, S.event(
        "board.updated", board, me, f"{me.name} {S.verb(me, 'изменил', 'изменила')} доску."))
    return S.board_out(db, board, m)


@router.delete("/{board_id}", status_code=204)
def delete_board(board_id: int, bg: BackgroundTasks, db: Session = Depends(get_db), me: User = Depends(current_user)):
    board, _ = S.require_owner(db, board_id, me)
    payload = S.event("board.deleted", board, me, f"{me.name} {S.verb(me, 'удалил', 'удалила')} доску.")
    db.delete(board)
    db.commit()
    bg.add_task(hub.broadcast, board_id, payload)
    return Response(status_code=204)


@router.put("/{board_id}/favorite", response_model=schemas.BoardSummaryOut)
def set_favorite(board_id: int, payload: schemas.FavoriteIn, db: Session = Depends(get_db),
                 me: User = Depends(current_user)):
    board, m = S.require_member(db, board_id, me)
    m.is_favorite = payload.is_favorite
    db.commit()
    return S.board_summary(db, board, m)


# ---------------------------------------------------------------- members
@router.get("/{board_id}/members", response_model=list[schemas.MemberOut])
def list_members(board_id: int, db: Session = Depends(get_db), me: User = Depends(current_user)):
    board, m = S.require_member(db, board_id, me)
    return S.board_out(db, board, m).members


@router.post("/{board_id}/members", response_model=schemas.MemberOut, status_code=201)
def add_member(board_id: int, payload: schemas.MemberAdd, bg: BackgroundTasks,
               db: Session = Depends(get_db), me: User = Depends(current_user)):
    """Invite a user to the board: by id (existing user) or by email (creates the user if needed)."""
    board, _ = S.require_owner(db, board_id, me)
    if payload.user_id is not None:
        user = db.get(User, payload.user_id)
        if user is None:
            raise HTTPException(404, "Пользователь не найден")
    elif payload.email:
        user = S.find_or_create_user(db, payload.email, payload.name)
    else:
        raise HTTPException(400, "Укажите пользователя или email")
    if S.membership(db, board, user):
        raise HTTPException(409, f"{user.name} уже участник доски")
    member = S.add_member(db, board, user)
    S.touch(board)
    db.commit()
    bg.add_task(hub.broadcast, board.id, S.event(
        "members.changed", board, me,
        f"{me.name} {S.verb(me, 'пригласил', 'пригласила')} {user.name} на доску."))
    return schemas.MemberOut(user=S.user_out(user), role=member.role, active_tasks=0)


@router.delete("/{board_id}/members/{user_id}", status_code=204)
def remove_member(board_id: int, user_id: int, bg: BackgroundTasks,
                  db: Session = Depends(get_db), me: User = Depends(current_user)):
    board, _ = S.require_owner(db, board_id, me)
    user = db.get(User, user_id)
    member = S.membership(db, board, user) if user else None
    if member is None:
        raise HTTPException(404, "Участник не найден")
    if member.role == ROLE_OWNER:
        raise HTTPException(400, "Нельзя исключить владельца доски")
    # Tasks of the removed member become unassigned (and this is logged)
    for task in db.scalars(select(Task).where(Task.board_id == board.id, Task.assignee_id == user.id)):
        S.log(db, task, me, "assignee", S.user_snapshot(user), None)
        task.assignee_id = None
        task.updated_at = utcnow()
    db.delete(member)
    S.touch(board)
    db.commit()
    bg.add_task(hub.broadcast, board.id, S.event(
        "members.changed", board, me, f"{me.name} {S.verb(me, 'исключил', 'исключила')} {user.name} из доски.",
        removed_user_id=user.id))
    return Response(status_code=204)
