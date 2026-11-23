from datetime import date


def test_today(client):
    response = client.get("/api/booking/today")
    assert response.status_code == 200
    now = date.today()
    assert response.json() == {"day": now.day, "month": now.month - 1, "year": now.year}


def test_slots(client):
    response = client.get("/api/slots", params={"day": 18, "month": 10, "year": 2026})
    assert response.status_code == 200
    data = response.json()
    assert data["date"] == {"day": 18, "month": 10, "year": 2026}
    assert len(data["slots"]) == 22
    assert data["slots"][0] == {"time": "10:00", "available": True}


def test_slots_odd_day_uses_other_schedule(client):
    data = client.get("/api/slots", params={"day": 19, "month": 10, "year": 2099}).json()
    assert data["slots"][0] == {"time": "10:00", "available": False}


def test_slots_invalid_date(client):
    response = client.get("/api/slots", params={"day": 31, "month": 10, "year": 2026})
    assert response.status_code == 400
    assert response.json() == {"error": "Некорректная дата."}


def test_slots_missing_params(client):
    response = client.get("/api/slots")
    assert response.status_code == 400
    assert "error" in response.json()


def test_simulated_error(client):
    response = client.get("/api/slots", params={"day": 18, "month": 10, "year": 2026, "error": 1})
    assert response.status_code == 500
    assert response.json()["error"]


def test_unknown_api_endpoint(client):
    response = client.get("/api/nope")
    assert response.status_code == 404
    assert response.json() == {"error": "API-эндпоинт не найден."}


def test_post_not_allowed(client):
    assert client.post("/categories").status_code == 405
