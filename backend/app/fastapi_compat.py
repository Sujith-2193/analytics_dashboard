from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from decimal import Decimal
from typing import Any, Callable

import sqlalchemy as sa
from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, relationship, scoped_session, sessionmaker


class QueryArgs:
    def __init__(self, values: dict[str, str]):
        self._values = values

    def get(self, key: str, default: Any = None, type: Callable[[str], Any] | None = None):
        if key not in self._values:
            return default
        value: Any = self._values[key]
        if type is not None:
            try:
                return type(value)
            except (TypeError, ValueError):
                return default
        return value


class RequestProxy:
    _args: ContextVar[QueryArgs] = ContextVar("request_args", default=QueryArgs({}))

    @property
    def args(self) -> QueryArgs:
        return self._args.get()

    @contextmanager
    def bind(self, request: Request):
        token = self._args.set(QueryArgs(dict(request.query_params)))
        try:
            yield
        finally:
            self._args.reset(token)


request = RequestProxy()


class Blueprint:
    def __init__(self, name: str, import_name: str, url_prefix: str = ""):
        self.name = name
        self.import_name = import_name
        self.router = APIRouter(prefix=url_prefix, tags=[name])

    def route(self, path: str, methods: list[str] | None = None):
        methods = methods or ["GET"]

        def decorator(func: Callable[..., Any]):
            async def endpoint(fastapi_request: Request):
                with request.bind(fastapi_request):
                    result = func()
                return JSONResponse(jsonable_encoder(result, custom_encoder={Decimal: float}))

            endpoint.__name__ = func.__name__
            self.router.add_api_route(path, endpoint, methods=methods)
            return func

        return decorator


class Database:
    Model = declarative_base()
    Column = sa.Column
    Integer = sa.Integer
    String = sa.String
    Numeric = sa.Numeric
    Boolean = sa.Boolean
    Date = sa.Date
    DateTime = sa.DateTime
    ForeignKey = sa.ForeignKey
    UniqueConstraint = sa.UniqueConstraint
    func = sa.func
    text = sa.text
    relationship = staticmethod(relationship)

    def __init__(self):
        self.engine = None
        self.session = scoped_session(sessionmaker(autoflush=False, autocommit=False))

    def init_app(self, app: Any) -> None:
        uri = self._database_uri(app)
        if not uri:
            raise RuntimeError("DATABASE_URL or SQLALCHEMY_DATABASE_URI is required")

        if uri.startswith("postgres://"):
            uri = uri.replace("postgres://", "postgresql+psycopg://", 1)
        elif uri.startswith("postgresql://"):
            uri = uri.replace("postgresql://", "postgresql+psycopg://", 1)

        if self.engine is not None:
            self.session.remove()
            self.engine.dispose()

        kwargs: dict[str, Any] = {"pool_pre_ping": True}
        if uri.startswith("sqlite"):
            kwargs = {"connect_args": {"check_same_thread": False}}

        self.engine = create_engine(uri, **kwargs)
        self.session.configure(bind=self.engine)

    def create_all(self) -> None:
        if self.engine is None:
            raise RuntimeError("Database is not initialized")
        self.Model.metadata.create_all(self.engine)

    def drop_all(self) -> None:
        if self.engine is None:
            raise RuntimeError("Database is not initialized")
        self.Model.metadata.drop_all(self.engine)

    @contextmanager
    def app_context(self):
        try:
            yield
        finally:
            self.session.remove()

    def _database_uri(self, app: Any) -> str | None:
        if isinstance(app, dict):
            return app.get("SQLALCHEMY_DATABASE_URI") or app.get("DATABASE_URL")
        config = getattr(app, "config", None)
        if config:
            return config.get("SQLALCHEMY_DATABASE_URI") or config.get("DATABASE_URL")
        state = getattr(app, "state", None)
        return getattr(state, "database_url", None)
