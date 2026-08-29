from typing import Any
from pydantic import BaseModel, ConfigDict, Field

class HealthResponse(BaseModel):
    status: str

class ErrorResponse(BaseModel):
    detail: str

class Pagination(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(50, ge=1, le=500)

class GenericPayload(BaseModel):
    model_config = ConfigDict(extra="allow")
    data: dict[str, Any] = Field(default_factory=dict)
