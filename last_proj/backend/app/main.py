"""TaskBoard — FastAPI application: REST API under /api, WebSocket under /ws, frontend at /."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import FRONTEND_DIR, SEED_DEMO
from .database import Base, SessionLocal, engine
from .routers import boards, columns, tasks, users, ws
from .seed import seed_demo
from .services import request_origin


def _migrate() -> None:
    """Add columns introduced after the first release to an existing SQLite database."""
    with engine.begin() as conn:
        cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(users)")}
        if cols and "position" not in cols:
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN position VARCHAR(100) NOT NULL DEFAULT ''")


def init_db(seed: bool = SEED_DEMO) -> None:
    Base.metadata.create_all(engine)
    if engine.url.get_backend_name() == "sqlite":
        _migrate()
    if seed:
        with SessionLocal() as db:
            seed_demo(db)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="TaskBoard API",
    version="1.0.0",
    description="Командная канбан-доска: доски, колонки, задачи, участники и история изменений.",
    lifespan=lifespan,
)


@app.middleware("http")
async def remember_origin(request: Request, call_next):
    token = request_origin.set(request.headers.get("x-client-id"))
    try:
        return await call_next(request)
    finally:
        request_origin.reset(token)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError):
    errors = exc.errors()
    first = errors[0] if errors else {}
    msg = str(first.get("msg", "Некорректные данные")).removeprefix("Value error, ")
    field = ".".join(str(p) for p in first.get("loc", ())[1:])
    return JSONResponse(status_code=422, content={"detail": msg, "field": field,
                                                  "errors": jsonable_errors(errors)})


def jsonable_errors(errors):
    return [{"loc": list(e.get("loc", ())), "msg": str(e.get("msg", ""))} for e in errors]


for r in (users.router, boards.router, columns.router, tasks.router):
    app.include_router(r, prefix="/api")
app.include_router(ws.router)


@app.get("/api/health", tags=["service"])
def health():
    return {"status": "ok"}


# Frontend (plain HTML/CSS/JS) — mounted last so /api and /ws take priority
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
