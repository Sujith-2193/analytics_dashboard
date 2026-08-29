"""Temporary import-compatibility shim for the legacy route modules.

This is NOT Flask. The backend is served by FastAPI; the shim only preserves
`from flask import Blueprint, request, Flask` imports while the existing route
modules are migrated incrementally.
"""

from contextlib import contextmanager

from fastapi.testclient import TestClient
from fastapi import FastAPI

from app.fastapi_compat import Blueprint, request


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


__all__ = ["Blueprint", "Flask", "request"]
