import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from app.db import engine
from app.api_router import api_router
from app.errors import sqlalchemy_error_handler, unhandled_error_handler
from app.logging_config import RequestIdMiddleware, configure_logging

configure_logging()
logger = logging.getLogger(__name__)
app = FastAPI(title="Analytics Dashboard API", version="2.0.0")
app.add_middleware(RequestIdMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","), allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.add_exception_handler(SQLAlchemyError, sqlalchemy_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)
app.include_router(api_router)

@app.get("/api/health", tags=["health"])
def health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok"}
