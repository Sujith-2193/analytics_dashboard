"""Compatibility surface for legacy tests during the FastAPI migration.

The backend runtime is FastAPI. This module contains no Flask dependency; it
only preserves the small symbols used by legacy route modules and tests while
the endpoint implementation is migrated incrementally.
"""

from contextlib import contextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.fastapi_compat import Blueprint, request


# The legacy seed script only checks truthiness to decide whether an application
# context already exists. FastAPI has no Flask context, so a truthy sentinel
# keeps the standalone seed path on the shared SQLAlchemy engine.
current_app = object()


class _ResponseCompat:
    """Add Flask's get_json() spelling to a Starlette TestClient response."""

    def __init__(self, response: Any):
        self._response = response

    def get_json(self):
        return self._response.json()

    def __getattr__(self, name: str):
        return getattr(self._response, name)


class _ClientCompat:
    """Delegate to FastAPI TestClient while preserving get_json()."""

    def __init__(self, client: TestClient):
        self._client = client

    def __enter__(self):
        self._client.__enter__()
        return self

    def __exit__(self, *args):
        return self._client.__exit__(*args)

    def _wrap(self, response: Any) -> _ResponseCompat:
        return _ResponseCompat(response)

    def get(self, *args, **kwargs):
        return self._wrap(self._client.get(*args, **kwargs))

    def post(self, *args, **kwargs):
        return self._wrap(self._client.post(*args, **kwargs))

    def put(self, *args, **kwargs):
        return self._wrap(self._client.put(*args, **kwargs))

    def patch(self, *args, **kwargs):
        return self._wrap(self._client.patch(*args, **kwargs))

    def delete(self, *args, **kwargs):
        return self._wrap(self._client.delete(*args, **kwargs))

    def options(self, *args, **kwargs):
        return self._wrap(self._client.options(*args, **kwargs))

    def head(self, *args, **kwargs):
        return self._wrap(self._client.head(*args, **kwargs))

    def __getattr__(self, name: str):
        return getattr(self._client, name)


class Flask(FastAPI):
    """Minimal Flask-shaped facade used only by legacy tests."""

    def __init__(self, import_name: str = __name__, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.config = {}
        self.blueprints = {}

    def register_blueprint(self, blueprint: Blueprint):
        from app import _register_blueprint

        self.blueprints[blueprint.name] = blueprint
        _register_blueprint(self, blueprint)

    @contextmanager
    def app_context(self):
        yield self

    def test_client(self, *args, **kwargs):
        return _ClientCompat(TestClient(self, *args, **kwargs))


__all__ = ["Blueprint", "Flask", "current_app", "request"]
