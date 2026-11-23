import os

# Без искусственной задержки тесты проходят мгновенно.
os.environ["API_DELAY_MS"] = "0"

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)
