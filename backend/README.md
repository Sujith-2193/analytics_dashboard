# Backend

FastAPI + SQLAlchemy analytics API.

## Local development

```bash
pip install -r requirements.txt
alembic upgrade head
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

## API documentation

- Swagger UI: `/docs`
- ReDoc: `/redoc`
- Health: `/api/health`

## Production

Run behind a reverse proxy/load balancer and set `DATABASE_URL`, `PORT`, and `LOG_LEVEL` through the environment.
