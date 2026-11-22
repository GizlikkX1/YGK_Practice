from conftest import GRECHISHKIN, SOKOLOV, SHLYKOV, GUKASYAN, TYURIN, as_user


def test_list_boards_for_user(client):
    boards = client.get("/api/boards", headers=as_user(SOKOLOV)).json()
    assert [b["name"] for b in boards] == ["Мобильное приложение 2.0", "Маркетинг Q4", "Бэкенд API"]
    mobile = boards[0]
    assert (mobile["task_count"], mobile["done_count"]) == (9, 2)
    assert [c["task_count"] for c in mobile["columns"]] == [3, 2, 2, 2]
    assert mobile["is_favorite"] is True and mobile["role"] == "owner"
    # Гукасян is a member of the mobile board only
    assert [b["name"] for b in client.get("/api/boards", headers=as_user(GUKASYAN)).json()] == ["Мобильное приложение 2.0"]
    assert [b["name"] for b in client.get("/api/boards", headers=as_user(GRECHISHKIN)).json()] == \
        ["Мобильное приложение 2.0", "Бэкенд API"]


def test_requires_user_header(client):
    assert client.get("/api/boards").status_code == 401
    assert client.get("/api/boards", headers=as_user(999)).status_code == 401


def test_create_board_from_template(client):
    r = client.post("/api/boards", json={"name": "  Маркетинг Q1 2027 ", "template": "basic", "member_ids": [TYURIN]},
                    headers=as_user(SOKOLOV))
    assert r.status_code == 201
    b = r.json()
    assert b["name"] == "Маркетинг Q1 2027"
    assert [c["name"] for c in b["columns"]] == ["Новые", "В работе", "Готово"]
    assert [c["position"] for c in b["columns"]] == [0, 1, 2]
    assert [c["is_final"] for c in b["columns"]] == [False, False, True]
    assert {m["user"]["id"]: m["role"] for m in b["members"]} == {SOKOLOV: "owner", TYURIN: "member"}


def test_create_board_with_custom_columns_and_invite(client):
    cols = [{"name": "Новые"}, {"name": "В работе"}, {"name": "На согласовании"}, {"name": "Готово", "is_final": True}]
    r = client.post("/api/boards", json={"name": "Доска", "columns": cols, "invite_emails": ["sergey.v@company.ru"]},
                    headers=as_user(SOKOLOV))
    assert r.status_code == 201
    b = r.json()
    assert [c["name"] for c in b["columns"]] == ["Новые", "В работе", "На согласовании", "Готово"]
    assert b["columns"][-1]["is_final"]
    assert any(m["user"]["email"] == "sergey.v@company.ru" for m in b["members"])


def test_create_board_validation(client):
    assert client.post("/api/boards", json={"name": "   "}, headers=as_user(SOKOLOV)).status_code == 422
    two_finals = [{"name": "A", "is_final": True}, {"name": "B", "is_final": True}]
    r = client.post("/api/boards", json={"name": "X", "columns": two_finals}, headers=as_user(SOKOLOV))
    assert r.status_code == 400
    r = client.post("/api/boards", json={"name": "X", "template": "empty"}, headers=as_user(SOKOLOV))
    assert r.status_code == 201 and r.json()["columns"] == []


def test_board_access_rights(client):
    assert client.get("/api/boards/2", headers=as_user(GUKASYAN)).status_code == 403
    assert client.get("/api/boards/999", headers=as_user(SOKOLOV)).status_code == 404
    # members can't change the board, the owner can
    assert client.patch("/api/boards/1", json={"name": "Новое"}, headers=as_user(GUKASYAN)).status_code == 403
    r = client.patch("/api/boards/1", json={"name": "Мобильное приложение 3.0"}, headers=as_user(SOKOLOV))
    assert r.status_code == 200 and r.json()["name"] == "Мобильное приложение 3.0"


def test_favorites_and_archive(client):
    client.put("/api/boards/3/favorite", json={"is_favorite": True}, headers=as_user(SOKOLOV))
    favs = client.get("/api/boards?filter=favorites", headers=as_user(SOKOLOV)).json()
    assert [b["id"] for b in favs] == [1, 3]
    # favourites are per user
    assert client.get("/api/boards?filter=favorites", headers=as_user(GUKASYAN)).json() == []

    client.patch("/api/boards/2", json={"is_archived": True}, headers=as_user(SOKOLOV))
    assert [b["id"] for b in client.get("/api/boards", headers=as_user(SOKOLOV)).json()] == [1, 3]
    assert [b["id"] for b in client.get("/api/boards?filter=archived", headers=as_user(SOKOLOV)).json()] == [2]


def test_members_invite_and_remove(client):
    r = client.post("/api/boards/1/members", json={"email": "Sergey.V@company.ru"}, headers=as_user(SOKOLOV))
    assert r.status_code == 201
    sergey = r.json()["user"]
    assert sergey["email"] == "sergey.v@company.ru" and sergey["name"] == "Sergey V"
    assert client.post("/api/boards/1/members", json={"user_id": sergey["id"]}, headers=as_user(SOKOLOV)).status_code == 409
    # only the owner invites
    assert client.post("/api/boards/1/members", json={"email": "x@y.ru"}, headers=as_user(GUKASYAN)).status_code == 403

    # removing a member unassigns their tasks and logs it
    tasks = client.get("/api/boards/1", headers=as_user(SOKOLOV)).json()["tasks"]
    ivans = [t["id"] for t in tasks if t["assignee"] and t["assignee"]["id"] == GUKASYAN]
    assert client.delete(f"/api/boards/1/members/{GUKASYAN}", headers=as_user(SOKOLOV)).status_code == 204
    tasks = {t["id"]: t for t in client.get("/api/boards/1", headers=as_user(SOKOLOV)).json()["tasks"]}
    assert all(tasks[i]["assignee"] is None for i in ivans)
    hist = client.get(f"/api/tasks/{ivans[0]}/history", headers=as_user(SOKOLOV)).json()
    assert hist[0]["action"] == "assignee" and hist[0]["to_value"] is None
    assert client.delete(f"/api/boards/1/members/{SOKOLOV}", headers=as_user(SOKOLOV)).status_code == 400
    assert client.get("/api/boards/1", headers=as_user(GUKASYAN)).status_code == 403


def test_my_tasks(client):
    rows = client.get("/api/me/tasks", headers=as_user(SOKOLOV)).json()
    assert [r["task"]["title"] for r in rows] == [
        "Кэширование каталога для офлайн-режима", "Ревью макетов лендинга", "Документация API заказов"]
    assert rows[0]["task"]["is_overdue"] is True
    assert client.get("/api/me", headers=as_user(SOKOLOV)).json()["active_tasks"] == 3
    assert client.get("/api/me", headers=as_user(SHLYKOV)).json()["owned_boards"] == 1


def test_delete_board(client):
    assert client.delete("/api/boards/1", headers=as_user(GUKASYAN)).status_code == 403
    assert client.delete("/api/boards/1", headers=as_user(SOKOLOV)).status_code == 204
    assert client.get("/api/boards/1", headers=as_user(SOKOLOV)).status_code == 404
