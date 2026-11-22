"""Request and response schemas."""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Annotated, Any, Literal, Optional

from pydantic import AfterValidator, BaseModel, Field, PlainSerializer, field_validator

UTCDateTime = Annotated[
    datetime,
    PlainSerializer(lambda d: d.replace(microsecond=0).isoformat() + "Z", return_type=str),
]
Priority = Literal["low", "mid", "high"]
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _check_email(value: str) -> str:
    value = (value or "").strip().lower()
    if not _EMAIL_RE.match(value) or len(value) > 200:
        raise ValueError("Некорректный email")
    return value


Email = Annotated[str, AfterValidator(_check_email)]
Color = Annotated[str, Field(pattern=r"^#[0-9A-Fa-f]{6}$")]


def validate_title(v: str) -> str:
    v = (v or "").strip()
    if not v:
        raise ValueError("Введите название задачи")
    if len(v) > 200:
        raise ValueError("Название — не длиннее 200 символов")
    return v


def validate_due(v: Optional[date]) -> Optional[date]:
    if v is not None and v < date.today():
        raise ValueError("Срок раньше сегодняшней даты")
    return v


def _clean_name(value: str, field: str, max_len: int) -> str:
    value = (value or "").strip()
    if not value:
        raise ValueError(f"Введите {field}")
    if len(value) > max_len:
        raise ValueError(f"Не длиннее {max_len} символов")
    return value


# ---------------------------------------------------------------- output
class UserOut(BaseModel):
    id: int
    name: str
    email: str
    color: str
    initials: str
    gender: Optional[str] = None
    position: str = ""


class UserStatsOut(UserOut):
    boards_count: int = 0
    active_tasks: int = 0


class MemberOut(BaseModel):
    user: UserOut
    role: Literal["owner", "member"]
    active_tasks: int = 0


class ColumnOut(BaseModel):
    id: int
    name: str
    color: str
    position: int
    is_final: bool


class ColumnStatOut(ColumnOut):
    task_count: int


class TaskOut(BaseModel):
    id: int
    key: str
    board_id: int
    column_id: int
    position: int
    title: str
    description: str
    assignee: Optional[UserOut]
    due_date: Optional[date]
    priority: Priority
    author: UserOut
    created_at: UTCDateTime
    updated_at: UTCDateTime
    completed_at: Optional[UTCDateTime]
    is_done: bool
    is_overdue: bool
    comments_count: int


class BoardSummaryOut(BaseModel):
    id: int
    name: str
    description: str
    color: str
    is_archived: bool
    is_favorite: bool
    role: Literal["owner", "member"]
    updated_at: UTCDateTime
    members: list[UserOut]
    columns: list[ColumnStatOut]
    task_count: int
    done_count: int


class BoardOut(BaseModel):
    id: int
    name: str
    description: str
    color: str
    is_archived: bool
    is_favorite: bool
    role: Literal["owner", "member"]
    owner_id: int
    updated_at: UTCDateTime
    columns: list[ColumnOut]
    members: list[MemberOut]
    tasks: list[TaskOut]


class HistoryOut(BaseModel):
    id: int
    action: str
    actor: UserOut
    from_value: Any = None
    to_value: Any = None
    created_at: UTCDateTime


class CommentOut(BaseModel):
    id: int
    author: UserOut
    text: str
    created_at: UTCDateTime


class MyTaskOut(BaseModel):
    task: TaskOut
    board: dict
    column: ColumnOut


class MeOut(BaseModel):
    user: UserOut
    active_tasks: int
    owned_boards: int


class WorkspaceOut(BaseModel):
    name: str
    members_count: int


# ---------------------------------------------------------------- input
class UserCreate(BaseModel):
    name: str
    email: Email
    position: str = Field("", max_length=100)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _clean_name(v, "имя", 100)


class ColumnDraft(BaseModel):
    name: str
    color: Optional[Color] = None
    is_final: bool = False

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _clean_name(v, "название колонки", 60)


class BoardCreate(BaseModel):
    name: str
    description: str = ""
    template: Literal["basic", "dev", "empty"] = "basic"
    # Explicit column list (from the column editor) overrides the template
    columns: Optional[list[ColumnDraft]] = None
    member_ids: list[int] = []
    invite_emails: list[Email] = []

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _clean_name(v, "название доски", 100)


class BoardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_archived: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else _clean_name(v, "название доски", 100)


class FavoriteIn(BaseModel):
    is_favorite: bool


class MemberAdd(BaseModel):
    user_id: Optional[int] = None
    email: Optional[Email] = None
    name: Optional[str] = None


class ColumnCreate(BaseModel):
    name: str
    color: Optional[Color] = None
    position: Optional[int] = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _clean_name(v, "название колонки", 60)


class ColumnUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[Color] = None
    is_final: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else _clean_name(v, "название колонки", 60)


class ColumnOrder(BaseModel):
    column_ids: list[int]


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    column_id: Optional[int] = None
    assignee_id: Optional[int] = None
    due_date: Optional[date] = None
    priority: Priority = "mid"

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        return validate_title(v)

    @field_validator("due_date")
    @classmethod
    def _due(cls, v: Optional[date]) -> Optional[date]:
        return validate_due(v)


class TaskUpdate(BaseModel):
    """Only the fields that were sent are changed (``null`` clears assignee / due date)."""

    title: Optional[str] = None
    description: Optional[str] = None
    assignee_id: Optional[int] = None
    due_date: Optional[date] = None
    priority: Optional[Priority] = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else validate_title(v)

    @field_validator("due_date")
    @classmethod
    def _due(cls, v: Optional[date]) -> Optional[date]:
        return validate_due(v)


class TaskMove(BaseModel):
    column_id: int
    position: int = Field(ge=0)


class CommentCreate(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def _text(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Комментарий пустой")
        return v[:5000]
