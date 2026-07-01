# Setup

From a blank machine to a running dashboard. There are two paths: **Docker Compose** (one command, but see the port caveat below) and **manual local** (recommended, most consistent with the checked-in config).

## Prerequisites

- **Docker + Docker Compose** — for the container path.
- **Python 3.11 or 3.12** — for running the backend manually. (`backend/Dockerfile` uses `python:3.12-slim`; the root `Dockerfile` uses `python:3.11-slim`. A local `backend/venv/` in the repo was built with 3.9, but the project targets 3.11/3.12.)
- **Node.js 20+** — for the frontend. (`frontend/Dockerfile` uses `node:20-alpine`.)
- **PostgreSQL 15** — either the Compose container or a local/remote instance.

There is no `Makefile` or task runner; commands are run directly.

## Environment variables

### Backend

| Variable | Purpose | Default (source) |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://localhost/analytics_dashboard` — **code default** in `DevelopmentConfig` (`backend/app/config.py`). In `ProductionConfig` there is no default; it must be set. |
| `SECRET_KEY` | Flask secret | `dev-secret-key-change-in-production` — **code default** in `Config` (`backend/app/config.py`). |
| `FLASK_ENV` | Selects config (`development` / `production` / `testing`) | `development` — **code default** (`os.getenv` fallback in `run.py` and `create_app`). |

Source-specific values you'll see in the repo (do not treat these as the code defaults):
- `backend/.env` (git-ignored, present locally): `FLASK_ENV=development`, `DATABASE_URL=postgresql://localhost:5432/analytics_dashboard`, `SECRET_KEY=dev-secret-key-change-in-production`.
- `.env.example` (checked in): same shape plus a frontend line; `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/analytics_dashboard`.
- `docker-compose.yml` (runtime override for the container): `DATABASE_URL=postgresql://postgres:postgres@db:5432/analytics_dashboard`, `SECRET_KEY=dev-secret-key-change-in-production`.

`ProductionConfig` requires `DATABASE_URL` and auto-rewrites a leading `postgres://` to `postgresql://`.

### Frontend

| Variable | Purpose | Default (source) |
|---|---|---|
| `VITE_API_URL` | Base URL the SPA prepends to API calls | `/api` — **code default** in `services/api.ts` (`import.meta.env.VITE_API_URL || '/api'`). |

Source-specific values:
- `.env.example` (checked in): `VITE_API_URL=http://localhost:5001`.
- `docker-compose.yml` (container override): `VITE_API_URL=http://localhost:5000`.

In production the frontend is served same-origin by Flask, so leaving `VITE_API_URL` unset (→ `/api`) is correct there.

## Ports (and the inconsistency you need to know about)

Ports are declared in several files and they do **not** all agree. This table records each value and its source; pick the manual path below to avoid the mismatch.

| Component | Port | Source |
|---|---|---|
| Flask via `python run.py` | `5001` | **hardcoded** in `backend/run.py` (`app.run(..., port=5001)`) |
| Flask via gunicorn (Docker root image, Railway, Procfile) | `$PORT` | `Dockerfile`, `backend/railway.json`, `backend/Procfile` (`--bind 0.0.0.0:$PORT`) |
| Vite dev server | `3000` | `frontend/vite.config.ts` (`server.port: 3000`) |
| Vite dev proxy target for `/api` | `5001` | `frontend/vite.config.ts` (`proxy['/api'].target`) |
| Postgres (Compose) | `5432` | `docker-compose.yml` |
| Backend (Compose) | host `5000` → container `5000` | `docker-compose.yml` `ports: "5000:5000"` |
| Frontend (Compose) | host `3000` → container `3000` | `docker-compose.yml` |
| `backend/Dockerfile` `EXPOSE` | `5000` | `backend/Dockerfile` (metadata only; its `CMD` is `python run.py`, which listens on `5001`) |

**The caveat:** `docker-compose.yml` runs the backend with `command: python run.py`, which makes Flask listen on **5001 inside the container**, but the service publishes `5000:5000`. As written, the published backend port does not reach the app, and the Compose frontend points `VITE_API_URL` at `http://localhost:5000`. If you use Compose and the frontend can't reach the API, this is why. The README's claim that the frontend dev server runs on `5173` is also stale — `vite.config.ts` sets it to `3000`.

## Path A — Docker Compose

```bash
docker-compose up -d          # starts db (5432), backend, frontend (3000)
```

This brings up PostgreSQL, the Flask backend, and the Vite dev server. Because Flask auto-creates tables and auto-seeds on startup when data is missing, the database will populate itself on first boot (seeding ~55k transactions takes a little time — watch `docker-compose logs -f backend`).

If the frontend cannot load data, apply the port fix: either change the backend service `command` to run gunicorn on `5000`/`$PORT`, or change the published mapping/`VITE_API_URL` to `5001`. (This doc does not modify the repo; the mismatch is described in the table above.)

## Path B — Manual local (recommended)

This path uses the combination the repo is actually consistent about: backend on `5001`, Vite on `3000` proxying `/api` → `5001`.

**1. Start PostgreSQL** and create the database:

```bash
createdb analytics_dashboard
# or point DATABASE_URL at any reachable Postgres 15 instance
```

**2. Backend**

```bash
cd backend
python -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt

# configure env (or create backend/.env with the three vars above)
export DATABASE_URL="postgresql://localhost:5432/analytics_dashboard"
export SECRET_KEY="dev-secret-key-change-in-production"
export FLASK_ENV=development

python run.py                       # serves on http://localhost:5001
```

On first start, `create_app` runs `db.create_all()` and then auto-seeds (data is missing → treated as stale). To seed explicitly instead, run:

```bash
python -m data.seed_data            # regenerates and TRUNCATE-reloads all tables
```

**3. Frontend**

```bash
cd frontend
npm install
npm run dev                         # serves on http://localhost:3000, proxies /api → :5001
```

Open **http://localhost:3000**.

## Building the frontend for production

```bash
cd frontend
npm run build                       # tsc -b && vite build → frontend/dist/
cp -r dist/* ../backend/static/     # Flask serves backend/static/ in production
```

When `backend/static/index.html` exists, running the backend alone (e.g. `python run.py` or gunicorn) serves the full app on one origin — no separate frontend process, no `VITE_API_URL` needed (`/api` same-origin).

## Seeding and reseeding

- **Volumes generated** (`backend/data/seed_data.py`): 120 products (8 categories), 2,000 customers (300 enterprise / 700 mid-market / 1,000 SMB), 31 sales reps, ~55,000 transactions spanning the **last 730 days from "now"**, and 500 pipeline opportunities.
- **Determinism:** `Faker.seed(42)`, `random.seed(42)`, `np.random.seed(42)` are set at import, but the transaction/customer date windows are anchored to `datetime.now()`, so reseeding on a later date shifts the data forward in time.
- **Destructive:** `seed_database()` runs `TRUNCATE TABLE transactions, pipeline, customers, sales_reps, products RESTART IDENTITY CASCADE` before inserting. It wipes all existing data.
- **Auto-reseed:** on every startup, if the newest transaction is missing or older than 7 days, the app reseeds automatically (`backend/app/__init__.py`).
- **Standalone reseed:** `python reseed.py` (from `backend/`) seeds and exits — intended for a scheduled Railway cron service.

## Tests and testing strategy

**There are no tests in this project.** No `pytest`/`unittest` suite, no Vitest/Jest config, no test files exist. `TestingConfig` (SQLite in-memory) is defined in `config.py` but nothing uses it. The only quality gate is ESLint on the frontend:

```bash
cd frontend
npm run lint
```

If you add tests, the natural spots are: backend route/aggregation tests using `TestingConfig` + a seeded in-memory DB, and frontend component/hook tests with Vitest + React Testing Library.

## LLM providers

Not applicable — this project does not call any LLM or external AI API. The "ML/forecasting" is local NumPy math (see `ARCHITECTURE.md`), so there is no provider to swap.
