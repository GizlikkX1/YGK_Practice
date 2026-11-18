# Salon Masters API

Небольшой пример API на FastAPI + SQLAlchemy 2 + SQLite.

## Запуск

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload
```

При первом запуске автоматически создаётся файл `salon.db` и таблица `masters`.

## Добавление примеров данных

После запуска API выполните в отдельном терминале:

```bash
python -c "from app.database import SessionLocal; from app.models import Master; db=SessionLocal(); db.add_all([Master(name='Анна', specialization='Парикмахер'), Master(name='Мария', specialization='Визажист')]); db.commit(); db.close()"
```

Команду с примерами нужно выполнить один раз, иначе записи будут добавляться повторно.

## Эндпоинты

- `GET /masters` — все мастера.
- `GET /masters?specialization=Парикмахер` — фильтр по специализации.
- `GET /masters/{master_id}` — мастер по ID; если записи нет, возвращается `404 Not Found`.

Интерактивная документация: http://127.0.0.1:8000/docs

## Структура

```text
salon_masters_api/
├── app/
│   ├── __init__.py
│   ├── database.py
│   ├── main.py
│   ├── models.py
│   └── schemas.py
├── requirements.txt
└── README.md
```
