"""Data model: board → column → task.

A task references exactly one column (``column_id``) and keeps its place inside
the column in ``position``. Moving a task only changes these two fields, so a
task is never duplicated when the board structure changes.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

PRIORITIES = ("low", "mid", "high")
ROLE_OWNER = "owner"
ROLE_MEMBER = "member"


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200), unique=True)
    color: Mapped[str] = mapped_column(String(7))
    # "f" / "m" — used for Russian verb forms in the history ("переместил" / "переместила")
    gender: Mapped[str | None] = mapped_column(String(1), nullable=True)
    # role in the team, e.g. «Backend-разработчик» (not the role on a board)
    position: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Board(Base):
    __tablename__ = "boards"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(7))
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    owner: Mapped[User] = relationship()
    columns: Mapped[list[BoardColumn]] = relationship(
        back_populates="board", order_by="BoardColumn.position", cascade="all, delete-orphan"
    )
    members: Mapped[list[BoardMember]] = relationship(
        back_populates="board", order_by="BoardMember.id", cascade="all, delete-orphan"
    )
    tasks: Mapped[list[Task]] = relationship(back_populates="board", cascade="all, delete-orphan")


class BoardMember(Base):
    __tablename__ = "board_members"
    __table_args__ = (UniqueConstraint("board_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    board_id: Mapped[int] = mapped_column(ForeignKey("boards.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(10), default=ROLE_MEMBER)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    board: Mapped[Board] = relationship(back_populates="members")
    user: Mapped[User] = relationship()


class BoardColumn(Base):
    __tablename__ = "columns"

    id: Mapped[int] = mapped_column(primary_key=True)
    board_id: Mapped[int] = mapped_column(ForeignKey("boards.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(60))
    color: Mapped[str] = mapped_column(String(7))
    position: Mapped[int] = mapped_column(Integer, default=0)
    # Tasks in the final column are considered completed
    is_final: Mapped[bool] = mapped_column(Boolean, default=False)

    board: Mapped[Board] = relationship(back_populates="columns")


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (Index("ix_tasks_column_position", "column_id", "position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    board_id: Mapped[int] = mapped_column(ForeignKey("boards.id", ondelete="CASCADE"))
    column_id: Mapped[int] = mapped_column(ForeignKey("columns.id", ondelete="RESTRICT"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    assignee_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    priority: Mapped[str] = mapped_column(String(4), default="mid")
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    board: Mapped[Board] = relationship(back_populates="tasks")
    column: Mapped[BoardColumn] = relationship()
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id])
    author: Mapped[User] = relationship(foreign_keys=[author_id])
    history: Mapped[list[TaskHistory]] = relationship(
        back_populates="task", cascade="all, delete-orphan", order_by="TaskHistory.id"
    )
    comments: Mapped[list[Comment]] = relationship(
        back_populates="task", cascade="all, delete-orphan", order_by="Comment.id"
    )


class TaskHistory(Base):
    """One entry of the task change log: who did what, value before → after."""

    __tablename__ = "task_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    # created | moved | assignee | due | priority | title
    action: Mapped[str] = mapped_column(String(20))
    from_value: Mapped[dict | str | None] = mapped_column(JSON, nullable=True)
    to_value: Mapped[dict | str | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    task: Mapped[Task] = relationship(back_populates="history")
    actor: Mapped[User] = relationship()


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    task: Mapped[Task] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()
