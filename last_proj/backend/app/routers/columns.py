from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from .. import schemas, services as S
from ..database import get_db
from ..deps import current_user
from ..models import BoardColumn, User, utcnow
from ..realtime import hub

router = APIRouter(tags=["columns"])


def _changed(bg: BackgroundTasks, board, me: User, text: str, **extra) -> None:
    bg.add_task(hub.broadcast, board.id, S.event("columns.changed", board, me, text, **extra))


@router.post("/boards/{board_id}/columns", response_model=schemas.ColumnOut, status_code=201)
def create_column(board_id: int, payload: schemas.ColumnCreate, bg: BackgroundTasks,
                  db: Session = Depends(get_db), me: User = Depends(current_user)):
    board, _ = S.require_owner(db, board_id, me)
    cols = S.board_columns(db, board.id)
    col = BoardColumn(board_id=board.id, name=payload.name, color=payload.color or S.column_color(cols),
                      position=len(cols), is_final=False)
    db.add(col)
    db.flush()
    index = len(cols) if payload.position is None else max(0, min(payload.position, len(cols)))
    cols.insert(index, col)
    S.renumber_columns(cols)
    S.ensure_final_column(db, board)
    S.touch(board)
    db.commit()
    _changed(bg, board, me, f"{me.name} {S.verb(me, 'добавил', 'добавила')} колонку «{col.name}».")
    return S.column_out(col)


@router.patch("/columns/{column_id}", response_model=schemas.ColumnOut)
def update_column(column_id: int, payload: schemas.ColumnUpdate, bg: BackgroundTasks,
                  db: Session = Depends(get_db), me: User = Depends(current_user)):
    col, board, _ = S.get_column(db, column_id, me, owner=True)
    data = payload.model_dump(exclude_unset=True)
    if data.get("name"):
        col.name = data["name"]
    if data.get("color"):
        col.color = data["color"]
    if "is_final" in data and data["is_final"] is not None:
        if data["is_final"]:
            cols = S.board_columns(db, board.id)
            for c in cols:
                c.is_final = c.id == col.id
            S.refresh_done_flags(db, cols)
        elif col.is_final:
            raise HTTPException(400, "На доске должна быть финальная колонка — отметьте другую колонку")
    S.touch(board)
    db.commit()
    _changed(bg, board, me, f"{me.name} {S.verb(me, 'изменил', 'изменила')} колонку «{col.name}».")
    return S.column_out(col)


@router.put("/boards/{board_id}/columns/order", response_model=list[schemas.ColumnOut])
def reorder_columns(board_id: int, payload: schemas.ColumnOrder, bg: BackgroundTasks,
                    db: Session = Depends(get_db), me: User = Depends(current_user)):
    board, _ = S.require_owner(db, board_id, me)
    cols = S.board_columns(db, board.id)
    by_id = {c.id: c for c in cols}
    if sorted(payload.column_ids) != sorted(by_id) or len(set(payload.column_ids)) != len(payload.column_ids):
        raise HTTPException(400, "Передайте все колонки доски ровно по одному разу")
    ordered = [by_id[i] for i in payload.column_ids]
    S.renumber_columns(ordered)
    S.touch(board)
    db.commit()
    _changed(bg, board, me, f"{me.name} {S.verb(me, 'изменил', 'изменила')} порядок колонок.")
    return [S.column_out(c) for c in ordered]


@router.delete("/columns/{column_id}", status_code=204)
def delete_column(
    column_id: int, bg: BackgroundTasks,
    strategy: Literal["move", "delete"] = Query("move", description="Что сделать с задачами колонки"),
    target_column_id: Optional[int] = Query(None, description="Куда перенести задачи (strategy=move)"),
    db: Session = Depends(get_db), me: User = Depends(current_user),
):
    """A column with tasks is removed only with an explicit decision: move the tasks or delete them."""
    col, board, _ = S.get_column(db, column_id, me, owner=True)
    cols = S.board_columns(db, board.id)
    if len(cols) == 1:
        raise HTTPException(400, "Нельзя удалить единственную колонку доски")
    tasks = S.column_tasks(db, col.id)
    moved_to = None
    if tasks:
        if strategy == "move":
            if target_column_id is None:
                raise HTTPException(400, "В колонке есть задачи: выберите, куда их перенести")
            target = next((c for c in cols if c.id == target_column_id), None)
            if target is None or target.id == col.id:
                raise HTTPException(400, "Выберите другую колонку этой доски")
            start = len(S.column_tasks(db, target.id))
            for i, t in enumerate(tasks):  # keep order, append to the end
                S.log(db, t, me, "moved", S.column_snapshot(col), S.column_snapshot(target))
                t.column_id = target.id
                t.position = start + i
                t.updated_at = utcnow()
                S.set_done_state(t, target)
            moved_to = target
        else:
            for t in tasks:
                db.delete(t)
    db.flush()
    was_final = col.is_final
    db.delete(col)
    db.flush()
    rest = [c for c in cols if c.id != col.id]
    S.renumber_columns(rest)
    if was_final:
        rest[-1].is_final = True
        S.refresh_done_flags(db, rest)
    S.touch(board)
    db.commit()
    text = f"{me.name} {S.verb(me, 'удалил', 'удалила')} колонку «{col.name}»"
    if moved_to is not None:
        text += f", задачи перенесены в «{moved_to.name}»"
    _changed(bg, board, me, text + ".")
    return Response(status_code=204)
