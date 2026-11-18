from pydantic import BaseModel, ConfigDict


class MasterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    specialization: str
