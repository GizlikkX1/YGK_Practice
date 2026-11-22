from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from .. import schemas, services as S
from ..database import get_db
from ..deps import current_user
from ..models import Comment, Task, User, utcnow
from ..realtime import hub

router = APIRouter(tags=["tasks"])


def _broadcast(bg: BackgroundTasks, kind: str, board, me: User, text: str, task: Task, **extra) -> None:
    bg.add_task(hub.broadcast, board.id, S.event(kind, board, me, text, task_id=task.id, **extra))


@router.post("/boards/{board_id}/tasks", response_model=schemas.TaskOut, status_code=201)
def create_task(board_id: int, payload: schemas.TaskCreate, bg: BackgroundTasks,
                db: Session = Depends(get_db), me: User = Depends(current_user)):
    board, _ = S.require_member(db, board_id, me)
    cols = S.board_columns(db, board.id)
    if not cols:
        raise HTTPException(400, "На доске нет колонок — сначала добавьте колонку")
    if payload.column_id is None:
        col = cols[0]
    else:
        col = next((c for c in cols if c.id == payload.column_id), None)
        if col is None:
            raise HTTPException(400, "Колонка не принадлежит этой доске")
    assignee = S.ensure_member_user(db, board, payload.assignee_id)
    now = utcnow()
    task = Task(board_id=board.id, column_id=col.id, position=len(S.column_tasks(db, col.id)),
                title=payload.title, description=payload.description.strip(),
                assignee_id=assignee.id if assignee else None, due_date=payload.due_date,
                priority=payload.priority, author_id=me.id, created_at=now, updated_at=now)
    S.set_done_state(task, col)
    db.add(task)
    db.flush()
    S.log(db, task, me, "created", None, {
        "column": S.column_snapshot(col), "priority": payload.priority,
        "assignee": S.user_snapshot(assignee), "due": payload.due_date.isoformat() if payload.due_date else None,
    })
    S.touch(board)
    db.commit()
    _broadcast(bg, "task.created", board, me,
               f"{me.name} {S.verb(me, 'создал', 'создала')} задачу «{task.title}» в «{col.name}».", task)
    return S.task_out_db(db, task)


@router.get("/tasks/{task_id}", response_model=schemas.TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db), me: User = Depends(current_user)):
    task, _, _ = S.get_task(db, task_id, me)
    return S.task_out_db(db, task)


@router.patch("/tasks/{task_id}", response_model=schemas.TaskOut)
def update_task(task_id: int, payload: schemas.TaskUpdate, bg: BackgroundTasks,
                db: Session = Depends(get_db), me: User = Depends(current_user)):
    task, board, _ = S.get_task(db, task_id, me)
    data = payload.model_dump(exclude_unset=True)
    changes = []

    if "title" in data and data["title"] is not None and data["title"] != task.title:
        S.log(db, task, me, "title", task.title, data["title"])
        task.title = data["title"]
        changes.append("название")
    if "description" in data and data["description"] is not None:
        task.description = data["description"].strip()
        changes.append("описание")
    if "assignee_id" in data and data["assignee_id"] != task.assignee_id:
        new = S.ensure_member_user(db, board, data["assignee_id"])
        S.log(db, task, me, "assignee", S.user_snapshot(task.assignee), S.user_snapshot(new))
        task.assignee_id = new.id if new else None
        changes.append("исполнителя")
    if "due_date" in data and data["due_date"] != task.due_date:
        S.log(db, task, me, "due", task.due_date.isoformat() if task.due_date else None,
              data["due_date"].isoformat() if data["due_date"] else None)
        task.due_date = data["due_date"]
        changes.append("срок")
    if "priority" in data and data["priority"] is not None and data["priority"] != task.priority:
        S.log(db, task, me, "priority", task.priority, data["priority"])
        task.priority = data["priority"]
        changes.append("приоритет")

    if changes:
        task.updated_at = utcnow()
        S.touch(board)
        db.commit()
        db.refresh(task)
        _broadcast(bg, "task.updated", board, me,
                   f"{me.name} {S.verb(me, 'изменил', 'изменила')} {', '.join(changes)} задачи «{task.title}».", task)
    return S.task_out_db(db, task)


@router.post("/tasks/{task_id}/move", response_model=schemas.TaskOut)
def move_task(task_id: int, payload: schemas.TaskMove, bg: BackgroundTasks,
              db: Session = Depends(get_db), me: User = Depends(current_user)):
    """Move a task to ``column_id`` at index ``position`` (0-based) — the task itself is not copied."""
    task, board, _ = S.get_task(db, task_id, me)
    target = next((c for c in S.board_columns(db, board.id) if c.id == payload.column_id), None)
    if target is None:
        raise HTTPException(400, "Колонка не принадлежит этой доске")
    source = task.column
    if source.id == target.id and payload.position == task.position:
        return S.task_out_db(db, task)
    if source.id != target.id:
        S.log(db, task, me, "moved", S.column_snapshot(source), S.column_snapshot(target))
    S.place_task(db, task, target, payload.position)
    task.updated_at = utcnow()
    S.touch(board)
    db.commit()
    db.refresh(task)
    if source.id != target.id:
        text = f"{me.name} {S.verb(me, 'переместил', 'переместила')} «{task.title}» в «{target.name}»."
    else:
        text = f"{me.name} {S.verb(me, 'изменил', 'изменила')} порядок задач в «{target.name}»."
    _broadcast(bg, "task.moved", board, me, text, task,
               from_column_id=source.id, to_column_id=target.id)
    return S.task_out_db(db, task)


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, bg: BackgroundTasks, db: Session = Depends(get_db), me: User = Depends(current_user)):
    task, board, _ = S.get_task(db, task_id, me)
    column_id, title = task.column_id, task.title
    db.delete(task)
    db.flush()
    S.renumber(S.column_tasks(db, column_id))
    S.touch(board)
    db.commit()
    _broadcast(bg, "task.deleted", board, me, f"{me.name} {S.verb(me, 'удалил', 'удалила')} задачу «{title}».", task)
    return Response(status_code=204)


@router.get("/tasks/{task_id}/history", response_model=list[schemas.HistoryOut])
def task_history(task_id: int, db: Session = Depends(get_db), me: User = Depends(current_user)):
    task, _, _ = S.get_task(db, task_id, me)
    return [S.history_out(h) for h in sorted(task.history, key=lambda h: (h.created_at, h.id), reverse=True)]


@router.get("/tasks/{task_id}/comments", response_model=list[schemas.CommentOut])
def list_comments(task_id: int, db: Session = Depends(get_db), me: User = Depends(current_user)):
    task, _, _ = S.get_task(db, task_id, me)
    return [S.comment_out(c) for c in task.comments]


@router.post("/tasks/{task_id}/comments", response_model=schemas.CommentOut, status_code=201)
def add_comment(task_id: int, payload: schemas.CommentCreate, bg: BackgroundTasks,
                db: Session = Depends(get_db), me: User = Depends(current_user)):
    task, board, _ = S.get_task(db, task_id, me)
    comment = Comment(task_id=task.id, author_id=me.id, text=payload.text, created_at=utcnow())
    db.add(comment)
    S.touch(board)
    db.commit()
    db.refresh(comment)
    _broadcast(bg, "comment.created", board, me,
               f"{me.name} {S.verb(me, 'прокомментировал', 'прокомментировала')} «{task.title}».", task)
    return S.comment_out(comment)
