from conftest import SOKOLOV, GUKASYAN, as_user, board_state, column_id, task_id


def columns(client, board_id=1):
    return client.get(f"/api/boards/{board_id}", headers=as_user(SOKOLOV)).json()["columns"]


def test_add_rename_and_reorder_columns(client):
    r = client.post("/api/boards/1/columns", json={"name": "Тестирование", "position": 3}, headers=as_user(SOKOLOV))
    assert r.status_code == 201
    assert [c["name"] for c in columns(client)] == ["Новые", "В работе", "На проверке", "Тестирование", "Готово"]
    col = r.json()["id"]
    client.patch(f"/api/columns/{col}", json={"name": "QA"}, headers=as_user(SOKOLOV))
    ids = [c["id"] for c in columns(client)]
    new_order = [ids[1], ids[0], ids[2], ids[3], ids[4]]
    assert client.put("/api/boards/1/columns/order", json={"column_ids": new_order}, headers=as_user(SOKOLOV)).status_code == 200
    assert [c["name"] for c in columns(client)] == ["В работе", "Новые", "На проверке", "QA", "Готово"]
    # tasks stayed in their columns — the structure change did not touch them
    state = board_state(client, 1)
    assert state["Новые"] == ["Экран авторизации по SMS", "Обновить иконки в навигации", "Push-уведомления о статусе заказа"]
    assert sum(len(v) for v in state.values()) == 9
    # incomplete order is rejected
    assert client.put("/api/boards/1/columns/order", json={"column_ids": ids[:2]}, headers=as_user(SOKOLOV)).status_code == 400


def test_only_owner_changes_structure(client):
    assert client.post("/api/boards/1/columns", json={"name": "X"}, headers=as_user(GUKASYAN)).status_code == 403
    col = column_id(client, 1, "Новые")
    assert client.patch(f"/api/columns/{col}", json={"name": "X"}, headers=as_user(GUKASYAN)).status_code == 403
    assert client.delete(f"/api/columns/{col}?strategy=move", headers=as_user(GUKASYAN)).status_code == 403


def test_final_column_switch_updates_done_flags(client):
    review = column_id(client, 1, "На проверке")
    client.patch(f"/api/columns/{review}", json={"is_final": True}, headers=as_user(SOKOLOV))
    cols = columns(client)
    assert [c["name"] for c in cols if c["is_final"]] == ["На проверке"]
    tasks = client.get("/api/boards/1", headers=as_user(SOKOLOV)).json()["tasks"]
    done = sorted(t["title"] for t in tasks if t["is_done"])
    assert done == ["Исправить падение на Android 12", "Фильтры и сортировка в каталоге"]
    # the final column can't be "unmarked" without choosing another one
    assert client.patch(f"/api/columns/{review}", json={"is_final": False}, headers=as_user(SOKOLOV)).status_code == 400


def test_delete_column_with_tasks_requires_decision(client):
    review = column_id(client, 1, "На проверке")
    r = client.delete(f"/api/columns/{review}?strategy=move", headers=as_user(SOKOLOV))
    assert r.status_code == 400
    assert board_state(client, 1)["На проверке"]  # nothing changed


def test_delete_column_moving_tasks_to_the_end(client):
    review, work = column_id(client, 1, "На проверке"), column_id(client, 1, "В работе")
    r = client.delete(f"/api/columns/{review}?strategy=move&target_column_id={work}", headers=as_user(SOKOLOV))
    assert r.status_code == 204
    state = board_state(client, 1)
    assert "На проверке" not in state
    assert state["В работе"] == ["Интеграция платёжного шлюза", "Кэширование каталога для офлайн-режима",
                                 "Фильтры и сортировка в каталоге", "Исправить падение на Android 12"]
    assert sum(len(v) for v in state.values()) == 9  # no task lost or duplicated
    hist = client.get(f"/api/tasks/{task_id(client, 1, 'Фильтры и сортировка в каталоге')}/history",
                      headers=as_user(SOKOLOV)).json()
    assert hist[0]["action"] == "moved"
    assert (hist[0]["from_value"]["name"], hist[0]["to_value"]["name"]) == ("На проверке", "В работе")


def test_delete_column_with_its_tasks(client):
    review = column_id(client, 1, "На проверке")
    assert client.delete(f"/api/columns/{review}?strategy=delete", headers=as_user(SOKOLOV)).status_code == 204
    assert sum(len(v) for v in board_state(client, 1).values()) == 7


def test_delete_empty_final_and_last_column(client):
    b = client.post("/api/boards", json={"name": "B", "columns": [{"name": "A"}, {"name": "Z"}]},
                    headers=as_user(SOKOLOV)).json()
    a, z = b["columns"]
    assert z["is_final"]
    assert client.delete(f"/api/columns/{z['id']}", headers=as_user(SOKOLOV)).status_code == 204
    cols = columns(client, b["id"])
    assert [(c["name"], c["is_final"]) for c in cols] == [("A", True)]
    assert client.delete(f"/api/columns/{a['id']}", headers=as_user(SOKOLOV)).status_code == 400
