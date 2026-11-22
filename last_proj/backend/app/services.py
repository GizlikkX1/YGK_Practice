"""Domain logic shared by the routers: access checks, ordering, history, serialisation."""
from __future__ import annotations

from contextvars import ContextVar
from datetime import date
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import schemas
from .config import BOARD_COLORS, COLUMN_COLORS, USER_COLORS
from .models import (
    ROLE_OWNER, Board, BoardColumn, BoardMember, Comment, Task, TaskHistory, User, utcnow,
)

# Id of the browser tab that made the request (X-Client-Id); echoed in realtime events
request_origin: ContextVar[Optional[str]] = ContextVar("request_origin", default=None)

PRIORITY_LABELS = {"low": "Низкий", "mid": "Средний", "high": "Высокий"}

TEMPLATES = {
    "basic": [("Новые", "#868E96"), ("В работе", "#3B5BDB"), ("Готово", "#2F9E44")],
    "dev": [("Бэклог", "#868E96"), ("В работе", "#3B5BDB"), ("Ревью", "#F08C00"), ("Готово", "#2F9E44")],
    "empty": [],
}


# ---------------------------------------------------------------- helpers
def initials(name: str) -> str:
    parts = [p for p in name.replace("-", " ").split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


def verb(user: User, masc: str, fem: str) -> str:
    if user.gender == "f":
        return fem
    if user.gender == "m":
        return masc
    return masc + "(а)"


def touch(board: Board) -> None:
    board.updated_at = utcnow()


def column_snapshot(col: BoardColumn) -> dict:
    return {"id": col.id, "name": col.name, "color": col.color}


def user_snapshot(user: Optional[User]) -> Optional[dict]:
    return None if user is None else {"id": user.id, "name": user.name}


def next_color(palette: list[str], used: Iterable[str]) -> str:
    used = list(used)
    for c in palette:
        if c not in used:
            return c
    return palette[len(used) % len(palette)]


# ---------------------------------------------------------------- access
def get_board(db: Session, board_id: int) -> Board:
    board = db.get(Board, board_id)
    if board is None:
        raise HTTPException(404, "Доска не найдена")
    return board


def membership(db: Session, board: Board, user: User) -> Optional[BoardMember]:
    return db.scalar(
        select(BoardMember).where(BoardMember.board_id == board.id, BoardMember.user_id == user.id)
    )


def require_member(db: Session, board_id: int, user: User) -> tuple[Board, BoardMember]:
    board = get_board(db, board_id)
    m = membership(db, board, user)
    if m is None:
        raise HTTPException(403, "Вы не участник этой доски")
    return board, m


def require_owner(db: Session, board_id: int, user: User) -> tuple[Board, BoardMember]:
    board, m = require_member(db, board_id, user)
    if m.role != ROLE_OWNER:
        raise HTTPException(403, "Это может сделать только владелец доски")
    return board, m


def get_task(db: Session, task_id: int, user: User) -> tuple[Task, Board, BoardMember]:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "Задача не найдена")
    board, m = require_member(db, task.board_id, user)
    return task, board, m


def get_column(db: Session, column_id: int, user: User, owner: bool = False):
    col = db.get(BoardColumn, column_id)
    if col is None:
        raise HTTPException(404, "Колонка не найдена")
    board, m = (require_owner if owner else require_member)(db, col.board_id, user)
    return col, board, m


def ensure_member_user(db: Session, board: Board, user_id: Optional[int]) -> Optional[User]:
    if user_id is None:
        return None
    user = db.get(User, user_id)
    if user is None or membership(db, board, user) is None:
        raise HTTPException(400, "Исполнитель должен быть участником доски")
    return user


# ---------------------------------------------------------------- ordering
def column_tasks(db: Session, column_id: int, exclude_id: Optional[int] = None) -> list[Task]:
    q = select(Task).where(Task.column_id == column_id)
    if exclude_id is not None:
        q = q.where(Task.id != exclude_id)
    return list(db.scalars(q.order_by(Task.position, Task.id)))


def renumber(tasks: list[Task]) -> None:
    for i, t in enumerate(tasks):
        t.position = i


def board_columns(db: Session, board_id: int) -> list[BoardColumn]:
    return list(db.scalars(
        select(BoardColumn).where(BoardColumn.board_id == board_id)
        .order_by(BoardColumn.position, BoardColumn.id)
    ))


def renumber_columns(cols: list[BoardColumn]) -> None:
    for i, c in enumerate(cols):
        c.position = i


def set_done_state(task: Task, column: BoardColumn) -> None:
    if column.is_final and task.completed_at is None:
        task.completed_at = utcnow()
    elif not column.is_final:
        task.completed_at = None


def place_task(db: Session, task: Task, column: BoardColumn, index: int) -> None:
    """Put ``task`` into ``column`` at ``index``; neighbours are renumbered 0..n-1."""
    if task.column_id is not None and task.column_id != column.id:
        renumber(column_tasks(db, task.column_id, exclude_id=task.id))
    target = column_tasks(db, column.id, exclude_id=task.id)
    index = max(0, min(index, len(target)))
    target.insert(index, task)
    task.column_id = column.id
    renumber(target)
    set_done_state(task, column)


def ensure_final_column(db: Session, board: Board) -> None:
    """Exactly one column on a non-empty board is final (the last one by default)."""
    cols = board_columns(db, board.id)
    if not cols:
        return
    finals = [c for c in cols if c.is_final]
    if len(finals) == 1:
        return
    keep = finals[-1] if finals else cols[-1]
    for c in cols:
        c.is_final = c is keep
    refresh_done_flags(db, cols)


def refresh_done_flags(db: Session, cols: list[BoardColumn]) -> None:
    for c in cols:
        for t in column_tasks(db, c.id):
            set_done_state(t, c)


# ---------------------------------------------------------------- history
def log(db: Session, task: Task, actor: User, action: str, before=None, after=None) -> TaskHistory:
    entry = TaskHistory(task=task, actor_id=actor.id, action=action,
                        from_value=before, to_value=after, created_at=utcnow())
    db.add(entry)
    return entry


# ---------------------------------------------------------------- serialisation
def user_out(u: User) -> schemas.UserOut:
    return schemas.UserOut(id=u.id, name=u.name, email=u.email, color=u.color,
                           initials=initials(u.name), gender=u.gender, position=u.position or "")


def column_out(c: BoardColumn) -> schemas.ColumnOut:
    return schemas.ColumnOut(id=c.id, name=c.name, color=c.color, position=c.position, is_final=c.is_final)


def comment_counts(db: Session, task_ids: list[int]) -> dict[int, int]:
    if not task_ids:
        return {}
    rows = db.execute(
        select(Comment.task_id, func.count(Comment.id)).where(Comment.task_id.in_(task_ids))
        .group_by(Comment.task_id)
    )
    return {tid: n for tid, n in rows}


def task_out(t: Task, comments: int = 0, final_ids: Optional[set[int]] = None) -> schemas.TaskOut:
    is_done = t.column.is_final if final_ids is None else t.column_id in final_ids
    overdue = bool(t.due_date and not is_done and t.due_date < date.today())
    return schemas.TaskOut(
        id=t.id, key=f"TB-{t.id}", board_id=t.board_id, column_id=t.column_id, position=t.position,
        title=t.title, description=t.description or "",
        assignee=user_out(t.assignee) if t.assignee else None,
        due_date=t.due_date, priority=t.priority, author=user_out(t.author),
        created_at=t.created_at, updated_at=t.updated_at, completed_at=t.completed_at,
        is_done=is_done, is_overdue=overdue, comments_count=comments,
    )


def task_out_db(db: Session, t: Task) -> schemas.TaskOut:
    return task_out(t, comment_counts(db, [t.id]).get(t.id, 0))


def active_tasks_count(db: Session, user_id: int, board_id: Optional[int] = None) -> int:
    q = (select(func.count(Task.id)).join(BoardColumn, Task.column_id == BoardColumn.id)
         .join(Board, Task.board_id == Board.id)
         .where(Task.assignee_id == user_id, BoardColumn.is_final.is_(False), Board.is_archived.is_(False)))
    if board_id is not None:
        q = q.where(Task.board_id == board_id)
    return db.scalar(q) or 0


def board_members(db: Session, board: Board) -> list[BoardMember]:
    ms = list(db.scalars(select(BoardMember).where(BoardMember.board_id == board.id).order_by(BoardMember.id)))
    # owner first, then in joining order
    return sorted(ms, key=lambda m: (m.role != ROLE_OWNER, m.id))


def board_out(db: Session, board: Board, me: BoardMember) -> schemas.BoardOut:
    cols = board_columns(db, board.id)
    final_ids = {c.id for c in cols if c.is_final}
    col_pos = {c.id: c.position for c in cols}
    tasks = list(db.scalars(select(Task).where(Task.board_id == board.id)))
    tasks.sort(key=lambda t: (col_pos.get(t.column_id, 0), t.position, t.id))
    counts = comment_counts(db, [t.id for t in tasks])
    members = [
        schemas.MemberOut(user=user_out(m.user), role=m.role,
                          active_tasks=sum(1 for t in tasks if t.assignee_id == m.user_id and t.column_id not in final_ids))
        for m in board_members(db, board)
    ]
    return schemas.BoardOut(
        id=board.id, name=board.name, description=board.description or "", color=board.color,
        is_archived=board.is_archived, is_favorite=me.is_favorite, role=me.role, owner_id=board.owner_id,
        updated_at=board.updated_at, columns=[column_out(c) for c in cols], members=members,
        tasks=[task_out(t, counts.get(t.id, 0), final_ids) for t in tasks],
    )


def board_summary(db: Session, board: Board, me: BoardMember) -> schemas.BoardSummaryOut:
    cols = board_columns(db, board.id)
    rows = dict(db.execute(
        select(Task.column_id, func.count(Task.id)).where(Task.board_id == board.id).group_by(Task.column_id)
    ).all())
    col_stats = [schemas.ColumnStatOut(**column_out(c).model_dump(), task_count=rows.get(c.id, 0)) for c in cols]
    total = sum(rows.values())
    done = sum(rows.get(c.id, 0) for c in cols if c.is_final)
    return schemas.BoardSummaryOut(
        id=board.id, name=board.name, description=board.description or "", color=board.color,
        is_archived=board.is_archived, is_favorite=me.is_favorite, role=me.role, updated_at=board.updated_at,
        members=[user_out(m.user) for m in board_members(db, board)], columns=col_stats,
        task_count=total, done_count=done,
    )


def history_out(h: TaskHistory) -> schemas.HistoryOut:
    return schemas.HistoryOut(id=h.id, action=h.action, actor=user_out(h.actor),
                              from_value=h.from_value, to_value=h.to_value, created_at=h.created_at)


def comment_out(c: Comment) -> schemas.CommentOut:
    return schemas.CommentOut(id=c.id, author=user_out(c.author), text=c.text, created_at=c.created_at)


# ---------------------------------------------------------------- users / invitations
def find_or_create_user(db: Session, email: str, name: Optional[str] = None, position: str = "") -> User:
    email = email.strip().lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user:
        return user
    if not name or not name.strip():
        local = email.split("@")[0].replace(".", " ").replace("_", " ").strip()
        name = " ".join(w.capitalize() for w in local.split()) or email
    used = list(db.scalars(select(User.color)))
    user = User(name=name.strip()[:100], email=email, color=next_color(USER_COLORS, used), gender=None,
                position=(position or "").strip()[:100])
    db.add(user)
    db.flush()
    return user


def add_member(db: Session, board: Board, user: User, role: str = "member") -> BoardMember:
    m = membership(db, board, user)
    if m:
        return m
    m = BoardMember(board_id=board.id, user_id=user.id, role=role, joined_at=utcnow())
    db.add(m)
    db.flush()
    return m


def board_color(db: Session) -> str:
    return next_color(BOARD_COLORS, list(db.scalars(select(Board.color))))


def column_color(board_cols: list[BoardColumn]) -> str:
    return next_color(COLUMN_COLORS, [c.color for c in board_cols])


# ---------------------------------------------------------------- realtime messages
def event(kind: str, board: Board, actor: User, message: str = "", **extra) -> dict:
    return {"type": kind, "board_id": board.id, "actor": user_out(actor).model_dump(),
            "message": message, "origin": request_origin.get(), **extra}
