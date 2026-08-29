"""Small compatibility layer used while migrating the existing route modules.

The application runtime is FastAPI.  This module preserves the old route
modules' public shape so the migration can be done without changing every
analytics query at once.  It is intentionally local and has no Flask
dependency.
"""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Callable

from fastapi import Request
from sqlalchemy.orm import DeclarativeBase


_request_ctx: ContextVar[Request | None] = ContextVar("request_ctx", default=None)


class ArgsProxy:
    def __init__(self, request: Request):
        self._params = request.query_params

    def get(self, key: str, default: Any = None, type: Callable | None = None):
        value = self._params.get(key)
        if value is None:
            return default
        if type is not None:
            try:
                return type(value)
            except (TypeError, ValueError):
                return default
        return value


class RequestProxy:
    @property
    def args(self) -> ArgsProxy:
        request = _request_ctx.get()
        if request is None:
            raise RuntimeError("request is only available while handling an HTTP request")
        return ArgsProxy(request)


request = RequestProxy()


@dataclass
class RouteDefinition:
    path: str
    endpoint: Callable
    methods: list[str]


class Blueprint:
    """Blueprint-shaped registry consumed by the FastAPI application."""

    def __init__(self, name: str, import_name: str, url_prefix: str = ""):
        self.name = name
        self.import_name = import_name
        self.url_prefix = url_prefix.rstrip("/")
        self.routes: list[RouteDefinition] = []

    def route(self, rule: str, methods: list[str] | None = None, **_: Any):
        methods = methods or ["GET"]

        def decorator(func: Callable):
            self.routes.append(RouteDefinition(rule, func, methods))
            return func

        return decorator


def bind_request(request_obj: Request):
    """Return a context token for a request; caller must reset it."""
    return _request_ctx.set(request_obj)


class Base(DeclarativeBase):
    pass
