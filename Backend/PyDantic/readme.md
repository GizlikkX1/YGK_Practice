# API услуг (FastAPI + Pydantic)

## Запуск
```
pip install fastapi uvicorn
uvicorn main:app
```

## Задание 1
Модель `ServiceCreate` в `main.py`:
- `title`, `desc` — непустые строки, до 100 символов
- `duration` — от 30 до 180 минут
- `price` — больше 0

## Задание 2
`POST /services` — создание услуги (201), при невалидном теле — 422.

## Проверка
```
curl -X POST http://127.0.0.1:8000/services \
  -H "Content-Type: application/json" \
  -d '{"categoryId": 3, "title": "Наращивание ресниц", "desc": "Огромные ресницы уже через 30 минут", "duration": 30, "price": 1500.00}'
# -> 201

curl -X POST http://127.0.0.1:8000/services \
  -H "Content-Type: application/json" \
  -d '{"categoryId": 3, "title": "Наращивание ресниц", "desc": "Огромные ресницы уже через 30 минут", "duration": 30, "price": "бесплатно"}'
# -> 422

curl -X POST http://127.0.0.1:8000/services \
  -H "Content-Type: application/json" \
  -d '{"categoryId": 3, "title": "Наращивание ресниц", "desc": "", "duration": 0, "price": -1500.00}'
# -> 422
```
