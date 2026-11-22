"""Demo data from the mockup. Dates are relative to today, so the board always looks "live"."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import services as S
from .models import Board, BoardColumn, BoardMember, Comment, Task, TaskHistory, User, utcnow

PEOPLE = [
    # initials, name (ФИО), email, colour, gender, position in the team
    ("СВ", "Соколов Владислав Сергеевич", "v.sokolov@company.ru", "#7950F2", "m", "Лидер"),
    ("ГА", "Гукасян Ангелина Манвеловна", "a.gukasyan@company.ru", "#1C7ED6", "f", "Frontend-разработчик"),
    ("ТН", "Тюрин Никита Михайлович", "n.tyurin@company.ru", "#E64980", "m", "UX/UI дизайнер"),
    ("ШД", "Шлыков Дмитрий Русланович", "d.shlykov@company.ru", "#0CA678", "m", "Backend-разработчик"),
    ("КИ", "Кириллов Иван Андреевич", "i.kirillov@company.ru", "#F76707", "m", "QA + тестировщик"),
    ("ГЕ", "Гречишкин Егор Эдуардович", "e.grechishkin@company.ru", "#1098AD", "m", "DevOps"),
]

STD_COLUMNS = [("Новые", "#868E96"), ("В работе", "#3B5BDB"), ("На проверке", "#F08C00"), ("Готово", "#2F9E44")]

# (title, priority, assignee, due offset in days or None, comments, description)
MOBILE = {
    "Новые": [
        ("Экран авторизации по SMS", "high", "ГА", 6, 3, "Вход по номеру телефона с кодом из SMS, повторная отправка через 60 с."),
        ("Обновить иконки в навигации", "low", "ТН", 13, 0, "Новый набор иконок из дизайн-системы 2.0."),
        ("Push-уведомления о статусе заказа", "mid", None, None, 0, ""),
    ],
    "В работе": [
        ("Интеграция платёжного шлюза", "high", "ШД", 3, 5, "Оплата картой и через СБП, обработка отмен и возвратов."),
        ("Кэширование каталога для офлайн-режима", "mid", "СВ", -2, 0, "Каталог и карточки товаров доступны без сети, синхронизация при подключении."),
    ],
    "На проверке": [
        ("Фильтры и сортировка в каталоге", "mid", "КИ", 2, 2, "Фильтры по цене, бренду и наличию; сортировка по популярности."),
        ("Исправить падение на Android 12", "high", "ГА", 1, 0, "Краш при открытии камеры на Android 12 (Pixel 5, Samsung S21)."),
    ],
    "Готово": [
        ("Настроить CI для сборок", "low", "ГЕ", -4, 0, "Сборка и тесты на каждый pull request."),
        ("Онбординг: три приветственных экрана", "mid", "ТН", -7, 0, ""),
    ],
}

MARKETING = {
    "Новые": [
        ("Контент-план на декабрь", "mid", "ТН", 9, 0, ""),
        ("Новогодняя рассылка", "high", "ТН", 15, 0, ""),
        ("Баннеры для соцсетей", "low", None, None, 0, ""),
        ("Опрос клиентов о сервисе", "low", "ТН", 20, 0, ""),
    ],
    "В работе": [
        ("Ревью макетов лендинга", "high", "СВ", 4, 1, "Проверить тексты и адаптив на мобильных."),
        ("Статья о релизе 2.0", "mid", "ТН", 6, 0, ""),
        ("Видео-обзор приложения", "mid", "ТН", 11, 0, ""),
    ],
    "Готово": [
        ("Медиаплан на IV квартал", "mid", "СВ", -20, 0, ""),
        ("Обновить брендбук", "low", "ТН", -16, 0, ""),
        ("Кейс для блога", "mid", "ТН", -12, 0, ""),
        ("Анонс в Telegram", "low", "ТН", -9, 0, ""),
        ("Подготовить пресс-релиз", "high", "СВ", -6, 0, ""),
        ("Отчёт по октябрю", "mid", "ТН", -3, 0, ""),
    ],
}

BACKEND = {
    "Новые": [
        ("Документация API заказов", "low", "СВ", 10, 0, "Описать эндпоинты заказов в OpenAPI с примерами."),
        ("Rate limiting для публичного API", "mid", "КИ", 12, 0, ""),
        ("Webhooks для статусов оплаты", "high", "ШД", 8, 0, ""),
        ("Миграция на PostgreSQL 17", "mid", "ГЕ", 16, 0, ""),
        ("Health-check эндпоинты", "low", "ГЕ", 14, 0, ""),
    ],
    "В работе": [
        ("Сервис расчёта доставки", "high", "ШД", 5, 0, ""),
        ("Идемпотентность платежей", "high", "КИ", 3, 0, ""),
        ("Кэширование цен в Redis", "mid", "ШД", 7, 0, ""),
        ("Логирование запросов в OpenTelemetry", "low", "КИ", 9, 0, ""),
    ],
    "На проверке": [
        ("Возвраты по частичной оплате", "high", "ШД", 2, 0, ""),
        ("Пагинация списка заказов", "mid", "ШД", 4, 0, ""),
        ("Валидация адресов", "mid", "КИ", 6, 0, ""),
    ],
    "Готово": [
        ("Авторизация по токенам", "high", "ШД", -30, 0, ""),
        ("Схема БД заказов", "mid", "КИ", -27, 0, ""),
        ("CI для бэкенда", "low", "ГЕ", -24, 0, ""),
        ("Эндпоинт корзины", "mid", "ШД", -20, 0, ""),
        ("Интеграция с банком-эквайером", "high", "КИ", -15, 0, ""),
        ("Swagger-документация", "low", "ГЕ", -11, 0, ""),
        ("Нагрузочный тест каталога", "mid", "ШД", -8, 0, ""),
        ("Ретраи для уведомлений", "mid", "КИ", -5, 0, ""),
    ],
}

COMMENTS = [
    ("СВ", "Макеты экранов лежат в Figma, страница «Авторизация»."),
    ("ГА", "Код приходит за 5–10 секунд, таймер повторной отправки поставлю 60 с."),
    ("ТН", "Не забудьте состояние ошибки для неверного кода."),
    ("ШД", "Ключи песочницы банка добавил в хранилище секретов."),
    ("СВ", "Проверьте, пожалуйста, отмену платежа на этапе 3-D Secure."),
    ("ШД", "Отмена работает, добавил автотест."),
    ("ГА", "На iOS всё ок, на Android нужно обновить SDK."),
    ("ШД", "SDK обновил, готово к ревью."),
    ("СВ", "Сортировку по популярности берём из аналитики за 30 дней."),
    ("КИ", "Сделал, добавил сохранение выбранных фильтров."),
]


def _add_board(db: Session, people: dict, name: str, color: str, desc: str, owner: str, members: list[str],
               columns: list[tuple[str, str]], data: dict, updated: datetime, favorite_for=()) -> Board:
    now = utcnow()
    board = Board(name=name, description=desc, color=color, owner_id=people[owner].id,
                  created_at=now - timedelta(days=40), updated_at=updated)
    db.add(board)
    db.flush()
    for i, ini in enumerate([owner] + [m for m in members if m != owner]):
        db.add(BoardMember(board_id=board.id, user_id=people[ini].id, role="owner" if ini == owner else "member",
                           is_favorite=ini in favorite_for, joined_at=now - timedelta(days=40 - i)))
    cols = {}
    for i, (cname, ccolor) in enumerate(columns):
        col = BoardColumn(board_id=board.id, name=cname, color=ccolor, position=i, is_final=i == len(columns) - 1)
        db.add(col)
        cols[cname] = col
    db.flush()

    first = cols[columns[0][0]]
    comment_iter = iter(COMMENTS)
    step = 0
    for cname, items in data.items():
        col = cols[cname]
        for pos, (title, pr, who, due, n_comments, desc_text) in enumerate(items):
            step += 1
            author = people[owner if step % 3 else (members[0] if members else owner)]
            created = now - timedelta(days=12 + step % 7, hours=step * 2 % 9, minutes=step * 7 % 50)
            due_date = (date.today() + timedelta(days=due)) if due is not None else None
            task = Task(board_id=board.id, column_id=col.id, position=pos, title=title, description=desc_text,
                        assignee_id=people[who].id if who else None, due_date=due_date, priority=pr,
                        author_id=author.id, created_at=created, updated_at=created)
            db.add(task)
            db.flush()
            db.add(TaskHistory(task_id=task.id, actor_id=author.id, action="created", created_at=created, to_value={
                "column": S.column_snapshot(first), "priority": pr, "assignee": None, "due": None}))
            t = created + timedelta(minutes=2)
            if who:
                db.add(TaskHistory(task_id=task.id, actor_id=author.id, action="assignee", created_at=t,
                                   from_value=None, to_value=S.user_snapshot(people[who])))
            if due_date:
                db.add(TaskHistory(task_id=task.id, actor_id=author.id, action="due", created_at=t + timedelta(minutes=1),
                                   from_value=None, to_value=due_date.isoformat()))
            # walk the task through the columns up to its current one
            actor = people[who] if who else author
            prev = first
            moved_at = created + timedelta(days=2)
            for c_name, _ in columns[1:]:
                if list(cols).index(c_name) > list(cols).index(cname):
                    break
                nxt = cols[c_name]
                db.add(TaskHistory(task_id=task.id, actor_id=actor.id, action="moved", created_at=moved_at,
                                   from_value=S.column_snapshot(prev), to_value=S.column_snapshot(nxt)))
                prev, moved_at = nxt, moved_at + timedelta(days=2, hours=3)
            if col.is_final:
                task.completed_at = moved_at - timedelta(days=2, hours=3)
            task.updated_at = max(created, moved_at - timedelta(days=2, hours=3))
            for k in range(n_comments):
                ini, text = next(comment_iter, ("СВ", "Ок."))
                db.add(Comment(task_id=task.id, author_id=people[ini].id, text=text,
                               created_at=created + timedelta(hours=5 + k * 3)))
    return board


def seed_demo(db: Session) -> bool:
    """Fill an empty database with the mockup data. Returns False if data already exists."""
    if db.scalar(select(User.id).limit(1)) is not None:
        return False
    now = utcnow()
    people = {}
    for i, (ini, name, email, color, gender, position) in enumerate(PEOPLE):
        u = User(name=name, email=email, color=color, gender=gender, position=position,
                 created_at=now - timedelta(days=60 - i))
        db.add(u)
        people[ini] = u
    db.flush()

    _add_board(db, people, "Мобильное приложение 2.0", "#3B5BDB", "Релиз 2.0 мобильного клиента", "СВ",
               ["ГА", "ТН", "ШД", "КИ", "ГЕ"], STD_COLUMNS, MOBILE, now - timedelta(minutes=12), favorite_for=("СВ",))
    _add_board(db, people, "Маркетинг Q4", "#E64980", "Кампании и контент на IV квартал", "СВ", ["ТН"],
               [STD_COLUMNS[0], STD_COLUMNS[1], STD_COLUMNS[3]], MARKETING, now - timedelta(days=1, hours=2))
    _add_board(db, people, "Бэкенд API", "#0CA678", "Сервисы заказов и оплаты", "ШД", ["КИ", "ГЕ", "СВ"],
               STD_COLUMNS, BACKEND, now - timedelta(days=3, hours=1))
    db.commit()
    return True
