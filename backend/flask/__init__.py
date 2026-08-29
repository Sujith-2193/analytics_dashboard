"""Import-compatibility shim used during the FastAPI migration.

This is NOT Flask. The backend is served by FastAPI; the shim only preserves
small Flask symbols used by legacy analytics modules and tests.
"""

from contextlib import contextmanager

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.fastapi_compat import Blueprint, request


# The legacy seed script only uses truthiness to decide whether an application
# context already exists. FastAPI's application object is not a Flask context,
# so a truthy sentinel keeps the standalone seed path on the shared SQLAlchemy
# engine configured from DATABASE_URL.
current_app = object()


class Flask(FastAPI):
    """Minimal Flask-shaped facade used by the legacy test fixtures."""

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
        return TestClient(self)


__all__ = ["Blueprint", "Flask", "current_app", "request"]
