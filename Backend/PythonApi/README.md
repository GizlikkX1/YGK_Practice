# frontend-4-practice

React-страница выбора даты и времени для барбершопа «Бритва». Бэкенд написан на Python (FastAPI) и находится в папке `app/`.

## Запуск

Требуются Python 3.10+ и Node.js 18+.

### 1. API (FastAPI)

```bash
python -m venv .venv
source .venv/bin/activate          # fish: source .venv/bin/activate.fish; Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Без активации окружения можно вызывать программы напрямую: `.venv/bin/pip install -r requirements.txt`, затем `.venv/bin/uvicorn app.main:app --reload --port 8000`. Ставить пакеты в системный Python не нужно: на Arch, Debian 12+ и других дистрибутивах pip выдаст ошибку `externally-managed-environment`.

API доступно на `http://localhost:8000`, интерактивная документация — `http://localhost:8000/docs`.

### 2. Фронтенд (во втором терминале)

```bash
npm install
npm run dev
```

Откройте `http://localhost:3000`. Vite проксирует `/api/*` и `/categories*` на `http://127.0.0.1:8000` (адрес можно поменять переменной `API_URL`).

### Тесты

```bash
pytest            # или .venv/bin/pytest
```

## API

### Задание 1. Список категорий

`GET /categories` → `200`

```json
[
  { "id": 1, "name": "Стрижки и укладки", "servicesCount": 5 },
  { "id": 2, "name": "Маникюр и педикюр", "servicesCount": 5 },
  { "id": 3, "name": "Брови и ресницы", "servicesCount": 4 },
  { "id": 4, "name": "Спа-процедуры", "servicesCount": 4 }
]
```

### Задание 2. Информация по категории

`GET /categories/{category_id}` → `200`

```json
{ "id": 1, "name": "Стрижки и укладки", "servicesCount": 5 }
```

Неизвестный ID → `404` с телом `Category not found` (text/plain). Нечисловой ID → `422`.

Оба эндпоинта также доступны с префиксом `/api` (`/api/categories`, `/api/categories/{category_id}`).

### Эндпоинты страницы записи

- `GET /api/booking/today` — возвращает `{ day, month, year }`.
- `GET /api/slots?day=18&month=10&year=2026` — возвращает `{ date, slots }`; некорректная дата → `400`.

`month` — 0-индексный: январь = `0`, ноябрь = `10`. Каждый слот имеет поля `{ time, available }`. Ошибки в `/api/*` возвращаются как `{ "error": "..." }`.

Для эндпоинтов `/api/*` установлена демонстрационная задержка 650 мс (переменная окружения `API_DELAY_MS`), а параметр `?error=1` возвращает `500` — это нужно для проверки состояний загрузки и ошибки в интерфейсе.

## Проверка сценариев

1. Откройте `http://localhost:3000`: сначала появится «Загрузка…», затем календарь и запрос слотов.
2. Выберите другой день: блок времени покажет «Загрузка слотов…», затем получит расписание.
3. Ошибка загрузки слотов: `http://localhost:3000/?simulateSlotsError=1`. Интерфейс покажет сообщение и кнопку повторного запроса.
4. Ошибка получения даты: `http://localhost:3000/?simulateTodayError=1`. Появится сообщение и кнопка повтора.

## Структура

- `app/main.py` — FastAPI-приложение и эндпоинты.
- `app/database.py` — имитация базы данных: дата, наборы слотов, категории услуг.
- `app/schemas.py` — Pydantic-модели ответов.
- `tests/` — тесты API на pytest.
- `src/api.js` — клиентские функции `fetchToday()` и `fetchSlots(date)`.
- `src/App.jsx`, `src/components/` — React-страница.
- `src/data/date.js` — функции календаря и форматирования.
- `src/styles/site.css` — стили страницы.
