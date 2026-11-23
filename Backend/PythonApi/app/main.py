from __future__ import annotations

import asyncio
import os

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, PlainTextResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import database
from .schemas import ApiDate, Category, ErrorResponse, SlotsResponse

API_DELAY_MS = int(os.getenv("API_DELAY_MS", "650"))

app = FastAPI(title='Барбершоп "Бритва" API')


def error_response(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": message})


categories_router = APIRouter(tags=["categories"])


@categories_router.get(
    "/categories",
    response_model=list[Category],
    summary="Список категорий с количеством услуг",
)
def list_categories():
    return database.get_categories()


@categories_router.get(
    "/categories/{category_id}",
    response_model=Category,
    summary="Информация о категории",
    responses={404: {"content": {"text/plain": {"example": "Category not found"}}}},
)
def get_category(category_id: int):
    category = database.get_category_by_id(category_id)
    if category is None:
        return PlainTextResponse("Category not found", status_code=404)
    return category


async def simulate_server(request: Request) -> None:
    if API_DELAY_MS > 0:
        await asyncio.sleep(API_DELAY_MS / 1000)
    if request.query_params.get("error") == "1":
        raise SimulatedError()


class SimulatedError(Exception):
    pass


@app.exception_handler(SimulatedError)
async def simulated_error_handler(_request: Request, _exc: SimulatedError):
    return error_response(500, "Не удалось загрузить данные. Попробуйте ещё раз.")


booking_router = APIRouter(prefix="/api", tags=["booking"], dependencies=[Depends(simulate_server)])


@booking_router.get("/booking/today", response_model=ApiDate)
def booking_today():
    return database.get_today()


@booking_router.get(
    "/slots",
    response_model=SlotsResponse,
    responses={400: {"model": ErrorResponse}},
)
def slots(day: int, month: int, year: int):
    requested = database.to_date(day, month, year)
    if requested is None:
        return error_response(400, "Некорректная дата.")
    return {
        "date": {"day": day, "month": month, "year": year},
        "slots": database.get_slots_for_date(requested),
    }


app.include_router(categories_router)
app.include_router(categories_router, prefix="/api", include_in_schema=False)
app.include_router(booking_router)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    if request.url.path.startswith("/api/"):
        return error_response(400, "Некорректные параметры запроса.")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, exc: StarletteHTTPException):
    if request.url.path.startswith("/api/"):
        message = "API-эндпоинт не найден." if exc.status_code == 404 else str(exc.detail)
        return error_response(exc.status_code, message)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)


@app.middleware("http")
async def no_store(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response
