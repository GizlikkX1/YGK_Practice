import os
import sys
import tempfile
from pathlib import Path

import pytest

_DB = Path(tempfile.gettempdir()) / f"taskboard_test_{os.getpid()}.db"
os.environ["TASKBOARD_DATABASE_URL"] = f"sqlite:///{_DB.as_posix()}"
os.environ["TASKBOARD_SEED"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed_demo  # noqa: E402

# Demo users: 1 Соколов (owner of boards 1, 2), 2 Гукасян, 3 Тюрин, 4 Шлыков (owner of board 3), 5 Кириллов, 6 Гречишкин
SOKOLOV, GUKASYAN, TYURIN, SHLYKOV, KIRILLOV, GRECHISHKIN = 1, 2, 3, 4, 5, 6


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_demo(db)
    with TestClient(app) as c:
        yield c


def as_user(user_id: int) -> dict:
    return {"X-User-Id": str(user_id)}


def board_state(client, board_id: int, user_id: int = SOKOLOV) -> dict:
    """{column name: [task titles in order]}"""
    b = client.get(f"/api/boards/{board_id}", headers=as_user(user_id)).json()
    out = {}
    for col in b["columns"]:
        tasks = sorted((t for t in b["tasks"] if t["column_id"] == col["id"]), key=lambda t: t["position"])
        assert [t["position"] for t in tasks] == list(range(len(tasks))), "positions must be 0..n-1"
        out[col["name"]] = [t["title"] for t in tasks]
    return out


def column_id(client, board_id: int, name: str, user_id: int = SOKOLOV) -> int:
    b = client.get(f"/api/boards/{board_id}", headers=as_user(user_id)).json()
    return next(c["id"] for c in b["columns"] if c["name"] == name)


def task_id(client, board_id: int, title: str, user_id: int = SOKOLOV) -> int:
    b = client.get(f"/api/boards/{board_id}", headers=as_user(user_id)).json()
    return next(t["id"] for t in b["tasks"] if t["title"] == title)
