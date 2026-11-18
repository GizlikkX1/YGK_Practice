from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .database import Base, engine, get_db
from .schemas import MasterRead


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Creates the masters table on first start if it does not exist.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Salon Masters API", lifespan=lifespan)

DbSession = Annotated[Session, Depends(get_db)]


@app.get("/masters", response_model=list[MasterRead])
def get_masters(
    db: DbSession,
    specialization: Annotated[str | None, Query()] = None,
):
    statement = select(models.Master)
    if specialization:
        statement = statement.where(
            models.Master.specialization == specialization
        )
    return db.scalars(statement.order_by(models.Master.id)).all()


@app.get("/masters/{master_id}", response_model=MasterRead)
def get_master(master_id: int, db: DbSession):
    master = db.get(models.Master, master_id)
    if master is None:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    return master
