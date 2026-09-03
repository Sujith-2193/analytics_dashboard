"""FastAPI application factory for the independently maintained dashboard."""

import os
from contextlib import asynccontextmanager

from .config import config
from .fastapi_compat import Database

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

db = Database()


def create_app(config_name: str = None) -> FastAPI:
    if config_name is None:
        config_name = os.getenv('APP_ENV') or os.getenv('FLASK_ENV', 'development')

    static_folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static')
    has_static = os.path.exists(static_folder)
    settings = config[config_name]

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db.init_app(app)
        with db.app_context():
            try:
                db.create_all()
            except Exception:
                pass
        yield
        db.session.remove()

    app = FastAPI(
        title="SignalFlow Analytics API",
        version="2.0.0",
        description="FastAPI, SQLAlchemy, PostgreSQL, and scikit-learn analytics service.",
        lifespan=lifespan,
    )
    app.state.config_name = config_name
    app.state.database_url = settings.SQLALCHEMY_DATABASE_URI
    app.config = {"SQLALCHEMY_DATABASE_URI": settings.SQLALCHEMY_DATABASE_URI}
    app.app_context = db.app_context

    db.init_app(app)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from .routes import dashboard, revenue, customers, operations, forecasting

    for module in (dashboard, revenue, customers, operations, forecasting):
        app.include_router(module.bp.router)

    @app.get('/api/health')
    def health():
        payload = {'status': 'healthy', 'environment': config_name}

        try:
            from datetime import date
            from .models import Customer, Pipeline, Transaction

            counts = {
                'customers': db.session.query(Customer).count(),
                'transactions': db.session.query(Transaction).count(),
                'pipeline': db.session.query(Pipeline).count(),
            }
            latest = db.session.query(db.func.max(Transaction.transaction_date)).scalar()
            seeded = counts['transactions'] > 0

            payload['data'] = {
                'seeded': seeded,
                'counts': counts,
                'latestTransaction': latest.isoformat() if latest else None,
                'ageInDays': (date.today() - latest).days if latest else None,
            }
            if not seeded:
                payload['status'] = 'degraded'
                payload['hint'] = 'Database is empty. Run: python reseed.py'
        except Exception as exc:  # noqa: BLE001 - surfaced, never swallowed
            payload['status'] = 'degraded'
            payload['data'] = {'error': str(exc)}
            payload['hint'] = 'Tables may be missing. Run: python reseed.py'

        return payload

    if has_static:
        app.mount('/assets', StaticFiles(directory=os.path.join(static_folder, 'assets')), name='assets')

        @app.get('/')
        def serve_index():
            return FileResponse(os.path.join(static_folder, 'index.html'))

        @app.get('/{path:path}', include_in_schema=False)
        def serve_static(path: str):
            candidate = os.path.join(static_folder, path)
            if os.path.exists(candidate) and os.path.isfile(candidate):
                return FileResponse(candidate)
            return FileResponse(os.path.join(static_folder, 'index.html'))

    with app.app_context():
        try:
            db.create_all()
        except Exception:  # noqa: BLE001 - tables already exist is the normal case
            pass

    return app
