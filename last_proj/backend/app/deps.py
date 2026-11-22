from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .database import get_db
from .models import User


def current_user(
    x_user_id: Optional[int] = Header(default=None, description="ID текущего пользователя (демо-режим без пароля)"),
    db: Session = Depends(get_db),
) -> User:
    if x_user_id is None:
        raise HTTPException(401, "Не выбран пользователь: передайте заголовок X-User-Id")
    user = db.get(User, x_user_id)
    if user is None:
        raise HTTPException(401, "Пользователь не найден")
    return user
