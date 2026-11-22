from datetime import date, timedelta

from conftest import SOKOLOV, GUKASYAN, TYURIN, KIRILLOV, as_user, board_state, column_id, task_id

FUTURE = (date.today() + timedelta(days=12)).isoformat()
PAST = (date.today() - timedelta(days=7)).isoformat()


def create(client, **payload):
    payload.setdefault("title", "Форма обратной связи")
    return client.post("/api/boards/1/tasks", json=payload, headers=as_user(SOKOLOV))


def history(client, tid, user=SOKOLOV):
    return client.get(f"/api/tasks/{tid}/history", headers=as_user(user)).json()


# ---------------------------------------------------------------- create / validation
def test_create_task_goes_to_the_end_of_column(client):
    r = create(client, description="Экран с полями «Тема» и «Сообщение»", assignee_id=GUKASYAN,
               due_date=FUTURE, priority="mid")
    assert r.status_code == 201
    t = r.json()
    assert t["key"] == f"TB-{t['id']}"
    assert (t["assignee"]["name"], t["due_date"], t["priority"], t["author"]["id"]) == ("Гукасян Ангелина Манвеловна", FUTURE, "mid", SOKOLOV)
    assert board_state(client, 1)["Новые"][-1] == "Форма обратной связи"
    assert t["position"] == 3
    h = history(client, t["id"])
    assert len(h) == 1 and h[0]["action"] == "created"
    assert h[0]["to_value"]["column"]["name"] == "Новые" and h[0]["to_value"]["assignee"]["name"] == "Гукасян Ангелина Манвеловна"


def test_create_task_in_given_column_defaults(client):
    work = column_id(client, 1, "В работе")
    t = create(client, title="Только название", column_id=work).json()
    assert (t["column_id"], t["assignee"], t["due_date"], t["priority"]) == (work, None, None, "mid")


def test_create_task_validation(client):
    r = create(client, title="   ")
    assert r.status_code == 422 and r.json()["detail"] == "Введите название задачи"
    r = create(client, due_date=PAST)
    assert r.status_code == 422 and r.json()["detail"] == "Срок раньше сегодняшней даты"
    assert create(client, title="x" * 201).status_code == 422
    assert create(client, priority="urgent").status_code == 422
    # assignee must be a member of the board (Тюрин is not on "Бэкенд API")
    r = client.post("/api/boards/3/tasks", json={"title": "X", "assignee_id": TYURIN}, headers=as_user(SOKOLOV))
    assert r.status_code == 400
    # column of another board
    other = column_id(client, 2, "Новые")
    assert create(client, column_id=other).status_code == 400
    assert board_state(client, 1)["Новые"][-1] != "Форма обратной связи"


# ---------------------------------------------------------------- update + history
def test_update_task_logs_main_changes(client):
    tid = create(client).json()["id"]
    r = client.patch(f"/api/tasks/{tid}", json={"assignee_id": GUKASYAN}, headers=as_user(SOKOLOV))
    assert r.json()["assignee"]["id"] == GUKASYAN
    client.patch(f"/api/tasks/{tid}", json={"due_date": FUTURE, "priority": "high"}, headers=as_user(SOKOLOV))
    client.patch(f"/api/tasks/{tid}", json={"title": "Форма обратной связи v2"}, headers=as_user(GUKASYAN))
    client.patch(f"/api/tasks/{tid}", json={"description": "Без записи в историю"}, headers=as_user(SOKOLOV))
    client.patch(f"/api/tasks/{tid}", json={"assignee_id": None, "due_date": None}, headers=as_user(SOKOLOV))

    t = client.get(f"/api/tasks/{tid}", headers=as_user(SOKOLOV)).json()
    assert (t["title"], t["priority"], t["assignee"], t["due_date"], t["description"]) == \
        ("Форма обратной связи v2", "high", None, None, "Без записи в историю")

    h = history(client, tid)
    actions = [e["action"] for e in h]
    # newest first; description changes are not part of the history
    assert actions == ["due", "assignee", "title", "priority", "due", "assignee", "created"]
    assert h[2]["actor"]["id"] == GUKASYAN
    assert (h[2]["from_value"], h[2]["to_value"]) == ("Форма обратной связи", "Форма обратной связи v2")
    assert (h[3]["from_value"], h[3]["to_value"]) == ("mid", "high")
    assert (h[4]["from_value"], h[4]["to_value"]) == (None, FUTURE)
    assert h[5]["from_value"] is None and h[5]["to_value"]["name"] == "Гукасян Ангелина Манвеловна"
    assert h[1]["to_value"] is None


def test_update_validation_and_noop(client):
    tid = task_id(client, 1, "Экран авторизации по SMS")
    before = len(history(client, tid))
    assert client.patch(f"/api/tasks/{tid}", json={"title": ""}, headers=as_user(SOKOLOV)).status_code == 422
    assert client.patch(f"/api/tasks/{tid}", json={"due_date": PAST}, headers=as_user(SOKOLOV)).status_code == 422
    assert client.patch(f"/api/tasks/{tid}", json={"assignee_id": 999}, headers=as_user(SOKOLOV)).status_code == 400
    assert client.patch(f"/api/tasks/{tid}", json={"priority": "high"}, headers=as_user(SOKOLOV)).status_code == 200
    assert len(history(client, tid)) == before  # same value → no entry


# ---------------------------------------------------------------- moving and ordering
def test_move_between_columns_keeps_single_copy(client):
    tid = create(client, assignee_id=GUKASYAN).json()["id"]
    work = column_id(client, 1, "В работе")
    r = client.post(f"/api/tasks/{tid}/move", json={"column_id": work, "position": 1}, headers=as_user(GUKASYAN))
    assert r.status_code == 200 and (r.json()["column_id"], r.json()["position"]) == (work, 1)
    state = board_state(client, 1)
    assert state["Новые"] == ["Экран авторизации по SMS", "Обновить иконки в навигации", "Push-уведомления о статусе заказа"]
    assert state["В работе"] == ["Интеграция платёжного шлюза", "Форма обратной связи", "Кэширование каталога для офлайн-режима"]
    assert sum(len(v) for v in state.values()) == 10
    h = history(client, tid)[0]
    assert h["action"] == "moved" and h["actor"]["id"] == GUKASYAN
    assert (h["from_value"]["name"], h["to_value"]["name"]) == ("Новые", "В работе")


def test_reorder_inside_column(client):
    first = task_id(client, 1, "Экран авторизации по SMS")
    new = column_id(client, 1, "Новые")
    entries = len(history(client, first))
    client.post(f"/api/tasks/{first}/move", json={"column_id": new, "position": 2}, headers=as_user(SOKOLOV))
    assert board_state(client, 1)["Новые"] == [
        "Обновить иконки в навигации", "Push-уведомления о статусе заказа", "Экран авторизации по SMS"]
    client.post(f"/api/tasks/{first}/move", json={"column_id": new, "position": 0}, headers=as_user(SOKOLOV))
    assert board_state(client, 1)["Новые"][0] == "Экран авторизации по SMS"
    # reordering inside a column is not a "main" change → no history entry
    assert len(history(client, first)) == entries


def test_position_is_clamped(client):
    tid = task_id(client, 1, "Экран авторизации по SMS")
    done = column_id(client, 1, "Готово")
    r = client.post(f"/api/tasks/{tid}/move", json={"column_id": done, "position": 99}, headers=as_user(SOKOLOV))
    assert r.json()["position"] == 2
    assert client.post(f"/api/tasks/{tid}/move", json={"column_id": done, "position": -1},
                       headers=as_user(SOKOLOV)).status_code == 422


def test_move_to_final_column_completes_and_undo(client):
    tid = create(client, due_date=FUTURE).json()["id"]
    new, done = column_id(client, 1, "Новые"), column_id(client, 1, "Готово")
    t = client.post(f"/api/tasks/{tid}/move", json={"column_id": done, "position": 0}, headers=as_user(SOKOLOV)).json()
    assert t["is_done"] and t["completed_at"]
    assert board_state(client, 1)["Готово"][0] == "Форма обратной связи"
    # «Отменить» = move back
    t = client.post(f"/api/tasks/{tid}/move", json={"column_id": new, "position": 3}, headers=as_user(SOKOLOV)).json()
    assert not t["is_done"] and t["completed_at"] is None


def test_overdue_flag(client):
    tasks = {t["title"]: t for t in client.get("/api/boards/1", headers=as_user(SOKOLOV)).json()["tasks"]}
    assert tasks["Кэширование каталога для офлайн-режима"]["is_overdue"]
    assert not tasks["Настроить CI для сборок"]["is_overdue"]  # past due date but already done


def test_move_to_column_of_other_board_is_rejected(client):
    tid = task_id(client, 1, "Экран авторизации по SMS")
    other = column_id(client, 2, "Новые")
    assert client.post(f"/api/tasks/{tid}/move", json={"column_id": other, "position": 0},
                       headers=as_user(SOKOLOV)).status_code == 400


def test_state_survives_new_session(client):
    tid = task_id(client, 1, "Push-уведомления о статусе заказа")
    work = column_id(client, 1, "В работе")
    client.post(f"/api/tasks/{tid}/move", json={"column_id": work, "position": 0}, headers=as_user(SOKOLOV))
    expected = board_state(client, 1)
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as fresh:  # new app session, data read from the database again
        assert board_state(fresh, 1) == expected


def test_delete_task_renumbers(client):
    tid = task_id(client, 1, "Экран авторизации по SMS")
    assert client.delete(f"/api/tasks/{tid}", headers=as_user(KIRILLOV)).status_code == 204
    assert board_state(client, 1)["Новые"] == ["Обновить иконки в навигации", "Push-уведомления о статусе заказа"]
    assert client.get(f"/api/tasks/{tid}", headers=as_user(SOKOLOV)).status_code == 404


def test_non_member_cannot_touch_tasks(client):
    tid = task_id(client, 2, "Ревью макетов лендинга")
    assert client.get(f"/api/tasks/{tid}", headers=as_user(GUKASYAN)).status_code == 403
    assert client.patch(f"/api/tasks/{tid}", json={"title": "x"}, headers=as_user(GUKASYAN)).status_code == 403


def test_comments(client):
    tid = task_id(client, 1, "Экран авторизации по SMS")
    assert len(client.get(f"/api/tasks/{tid}/comments", headers=as_user(SOKOLOV)).json()) == 3
    r = client.post(f"/api/tasks/{tid}/comments", json={"text": " Готово к ревью "}, headers=as_user(GUKASYAN))
    assert r.status_code == 201 and r.json()["text"] == "Готово к ревью"
    t = client.get(f"/api/tasks/{tid}", headers=as_user(SOKOLOV)).json()
    assert t["comments_count"] == 4
    assert client.post(f"/api/tasks/{tid}/comments", json={"text": " "}, headers=as_user(GUKASYAN)).status_code == 422


def test_realtime_event_on_move(client):
    tid = task_id(client, 1, "Интеграция платёжного шлюза")
    review = column_id(client, 1, "На проверке")
    with client.websocket_connect(f"/ws/boards/1?user_id={SOKOLOV}") as ws:
        client.post(f"/api/tasks/{tid}/move", json={"column_id": review, "position": 0},
                    headers={**as_user(4), "X-Client-Id": "tab-42"})
        ev = ws.receive_json()
    assert ev["type"] == "task.moved" and ev["task_id"] == tid and ev["origin"] == "tab-42"
    assert ev["message"] == "Шлыков Дмитрий Русланович переместил «Интеграция платёжного шлюза» в «На проверке»."


def test_realtime_rejects_non_member(client):
    import pytest
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/boards/2?user_id={GUKASYAN}") as ws:
            ws.receive_json()
