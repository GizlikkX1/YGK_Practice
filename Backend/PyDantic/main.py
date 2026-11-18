from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import sqlite3

DB = "app.db"

app = FastAPI()


def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


@app.on_event("startup")
def init_db():
    conn = get_db()
    conn.execute("""CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        categoryId INTEGER NOT NULL REFERENCES categories(id),
        title TEXT NOT NULL,
        desc TEXT NOT NULL,
        duration INTEGER NOT NULL,
        price REAL NOT NULL)""")
    if conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 0:
        conn.executemany("INSERT INTO categories (title) VALUES (?)",
                         [("Маникюр",), ("Парикмахерские услуги",), ("Ресницы и брови",)])
    conn.commit()
    conn.close()


class ServiceCreate(BaseModel):
    categoryId: int
    title: str = Field(min_length=1, max_length=100)
    desc: str = Field(min_length=1, max_length=100)
    duration: int = Field(ge=30, le=180)   # от 30 минут до 3 часов
    price: float = Field(gt=0)


@app.post("/services", status_code=201)
def create_service(service: ServiceCreate):
    conn = get_db()
    cat = conn.execute("SELECT id FROM categories WHERE id = ?",
                       (service.categoryId,)).fetchone()
    if cat is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Категория не найдена")
    cur = conn.execute(
        "INSERT INTO services (categoryId, title, desc, duration, price) "
        "VALUES (?, ?, ?, ?, ?)",
        (service.categoryId, service.title, service.desc,
         service.duration, service.price))
    conn.commit()
    service_id = cur.lastrowid
    conn.close()
    return {"id": service_id, **service.model_dump()}


@app.get("/services")
def list_services():
    conn = get_db()
    rows = conn.execute("SELECT * FROM services").fetchall()
    conn.close()
    return [dict(r) for r in rows]
