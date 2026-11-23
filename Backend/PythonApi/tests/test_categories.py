import pytest

EXPECTED = [
    {"id": 1, "name": "Стрижки и укладки", "servicesCount": 5},
    {"id": 2, "name": "Маникюр и педикюр", "servicesCount": 5},
    {"id": 3, "name": "Брови и ресницы", "servicesCount": 4},
    {"id": 4, "name": "Спа-процедуры", "servicesCount": 4},
]


@pytest.mark.parametrize("prefix", ["", "/api"])
def test_list_categories(client, prefix):
    response = client.get(f"{prefix}/categories")
    assert response.status_code == 200
    assert response.json() == EXPECTED


@pytest.mark.parametrize("category", EXPECTED)
def test_get_category(client, category):
    response = client.get(f"/categories/{category['id']}")
    assert response.status_code == 200
    assert response.json() == category


@pytest.mark.parametrize("category_id", [0, 5, 999, -1])
def test_unknown_category_returns_404(client, category_id):
    response = client.get(f"/categories/{category_id}")
    assert response.status_code == 404
    assert response.text == "Category not found"


def test_non_numeric_category_id_is_rejected(client):
    assert client.get("/categories/abc").status_code == 422


def test_response_cannot_mutate_data(client):
    client.get("/categories").json()[0]["name"] = "изменено"
    assert client.get("/categories/1").json()["name"] == "Стрижки и укладки"
