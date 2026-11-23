from pydantic import BaseModel, ConfigDict, Field


class Category(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    name: str
    services_count: int = Field(alias="servicesCount")


class ApiDate(BaseModel):
    day: int
    month: int = Field(description="0-индексный месяц: январь = 0")
    year: int


class Slot(BaseModel):
    time: str
    available: bool


class SlotsResponse(BaseModel):
    date: ApiDate
    slots: list[Slot]


class ErrorResponse(BaseModel):
    error: str
