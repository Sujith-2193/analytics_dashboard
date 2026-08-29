"""FastAPI application factory for the analytics dashboard."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, String, Date, Numeric, Boolean, Float, Text, create_engine, func, text
from sqlalchemy.orm import relationship, sessionmaker, scoped_session

from .fastapi_compat import Base, bind_request


class Database:
    """Lightweight SQLAlchemy facade replacing Flask-SQLAlchemy."""

    Model = Base
    Column = Column
    Integer = Integer
    String = String
    Date = Date
    Numeric = Numeric
    Boolean = Boolean
    Float = Float
    Text = Text
    relationship = staticmethod(relationship)
    func = func
    text = staticmethod(text)

    def __init__(self) -> None:
        self.engine = None
        self.session = None
        self.configure(os.getenv("DATABASE_URL", "postgresql://localhost/analytics_dashboard"))

    def configure(self, url: str) -> None:
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        self.engine = create_engine(
            url,
            pool_pre_ping=True,
            pool_recycle=300,
            future=True,
        )
        factory = sessionmaker(bind=self.engine, autoflush=False, autocommit=False, expire_on_commit=False)
        self.session = scoped_session(factory)

    def init_app(self, app: Any) -> None:
        """Compatibility hook for older callers; FastAPI uses the shared engine."""
        return None

    def create_all(self) -> None:
        self.Model.metadata.create_all(self.engine)

    def drop_all(self) -> None:
        self.Model.metadata.drop_all(self.engine)

    def remove(self) -> None:
        if self.session is not None:
            self.session.remove()


db = Database()


def _register_blueprint(app: FastAPI, blueprint: Any) -> None:
    """Register the existing route modules as FastAPI path operations."""
    for route in blueprint.routes:
        path = f"{blueprint.url_prefix}{route.path}" or "/"

        def endpoint(request: Request, _route=route.endpoint):
            token = bind_request(request)
            try:
                return _route()
            finally:
                db.remove()

        app.add_api_route(
            path,
            endpoint,
            methods=route.methods,
            name=route.endpoint.__name__,
        )


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Import models before create_all so SQLAlchemy knows every table and
        # relationship. Seeding remains an explicit operation via reseed.py.
        from . import models  # noqa: F401
        db.create_all()
        yield
        db.remove()
        if db.engine is not None:
            db.engine.dispose()

    app = FastAPI(
        title="Analytics Dashboard API",
        version="2.0.0",
        description="Analytics, forecasting, customer intelligence and operations API.",
        lifespan=lifespan,
    )

    origins = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://localhost:5173",
        ).split(",")
        if origin.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from .routes import dashboard, revenue, customers, operations, forecasting

    for module in (dashboard, revenue, customers, operations, forecasting):
        _register_blueprint(app, module.bp)

    @app.get("/api/health", tags=["system"])
    def health():
        payload = {"status": "healthy", "environment": os.getenv("APP_ENV", "development")}
        try:
            from datetime import date
            from .models import Customer, Pipeline, Transaction

            counts = {
                "customers": db.session.query(Customer).count(),
                "transactions": db.session.query(Transaction).count(),
                "pipeline": db.session.query(Pipeline).count(),
            }
            latest = db.session.query(func.max(Transaction.transaction_date)).scalar()
            seeded = counts["transactions"] > 0
            payload["data"] = {
                "seeded": seeded,
                "counts": counts,
                "latestTransaction": latest.isoformat() if latest else None,
                "ageInDays": (date.today() - latest).days if latest else None,
            }
            if not seeded:
                payload["status"] = "degraded"
                payload["hint"] = "Database is empty. Run: python reseed.py"
        except Exception as exc:  # noqa: BLE001 - health endpoint surfaces readiness failures
            db.session.rollback()
            payload["status"] = "degraded"
            payload["data"] = {"error": str(exc)}
            payload["hint"] = "Tables may be missing or the database may be unreachable."
        finally:
            db.remove()
        return payload

    return app


app = create_app()
