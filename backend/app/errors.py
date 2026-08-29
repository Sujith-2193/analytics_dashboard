from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError):
    return JSONResponse(status_code=503, content={"detail": "Database operation failed"})

async def unhandled_error_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
