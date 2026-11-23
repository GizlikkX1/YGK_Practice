"""Имитация базы данных.

Месяц в API — 0-индексный (январь = 0), как ожидает фронтенд.
"""

from __future__ import annotations

from datetime import date

# Два набора расписания: первый используется для сегодняшнего дня и чётных дат,
# второй — для нечётных дат.
_SLOT_SET_A: tuple[tuple[str, bool], ...] = (
    ("10:00", True), ("10:30", False), ("11:00", True), ("11:30", True),
    ("12:00", True), ("12:30", False), ("13:00", True), ("13:30", True),
    ("14:00", False), ("14:30", True), ("15:00", True), ("15:30", True),
    ("16:00", False), ("16:30", True), ("17:00", True), ("17:30", False),
    ("18:00", True), ("18:30", True), ("19:00", True), ("19:30", False),
    ("20:00", True), ("20:30", True),
)

_SLOT_SET_B: tuple[tuple[str, bool], ...] = (
    ("10:00", False), ("10:30", True), ("11:00", True), ("11:30", False),
    ("12:00", True), ("12:30", True), ("13:00", False), ("13:30", True),
    ("14:00", True), ("14:30", True), ("15:00", False), ("15:30", True),
    ("16:00", True), ("16:30", False), ("17:00", True), ("17:30", True),
    ("18:00", False), ("18:30", True), ("19:00", True), ("19:30", True),
    ("20:00", False), ("20:30", True),
)

# Категории услуг. Количество услуг задано по условию задания.
_CATEGORIES: tuple[dict, ...] = (
    {"id": 1, "name": "Стрижки и укладки", "servicesCount": 5},
    {"id": 2, "name": "Маникюр и педикюр", "servicesCount": 5},
    {"id": 3, "name": "Брови и ресницы", "servicesCount": 4},
    {"id": 4, "name": "Спа-процедуры", "servicesCount": 4},
)


def get_today() -> dict:
    """Сегодняшняя дата сервера в формате API."""
    now = date.today()
    return {"day": now.day, "month": now.month - 1, "year": now.year}


def to_date(day: int, month: int, year: int) -> date | None:
    """Переводит дату из формата API в date; None, если такой даты нет."""
    if year < 1970 or not 0 <= month <= 11:
        return None
    try:
        return date(year, month + 1, day)
    except ValueError:
        return None


def get_slots_for_date(requested: date) -> list[dict]:
    """Возвращает новый список слотов, чтобы исходные данные нельзя было изменить."""
    source = (
        _SLOT_SET_A
        if requested == date.today() or requested.day % 2 == 0
        else _SLOT_SET_B
    )
    return [{"time": time, "available": available} for time, available in source]


def get_categories() -> list[dict]:
    return [dict(category) for category in _CATEGORIES]


def get_category_by_id(category_id: int) -> dict | None:
    for category in _CATEGORIES:
        if category["id"] == category_id:
            return dict(category)
    return None
