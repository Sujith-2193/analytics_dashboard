# Overview

## What this project is

A full-stack business-intelligence dashboard that simulates an enterprise sales-analytics product. It has five pages, each backed by its own set of REST endpoints:

- **Executive Dashboard** (`/`) — headline KPIs, revenue trend, revenue-by-category donut, sales funnel, top products.
- **Revenue** (`/revenue`) — revenue trends and breakdowns by category, region, and channel; top products.
- **Customers** (`/customers`) — segmentation, 12-month cohort retention, lifetime-value distribution, acquisition, at-risk list.
- **Operations** (`/operations`) — sales pipeline funnel, rep quota attainment, stage conversion rates, deal cycle time.
- **Forecasting** (`/forecasting`) — 6-month revenue forecast with confidence bands, churn-risk scoring, seasonality, and "model performance" metrics.

The backend is a Flask REST API over PostgreSQL. The frontend is a React 19 single-page app built with Vite. In production the Flask app also serves the compiled frontend, so the whole thing runs as one web process plus a database.

## Important: the data is synthetic and many metrics are generated

This is the single most important thing to understand before reading anything else in these docs. **The dashboard is not connected to any real business system.** All data is produced by a synthetic-data generator (`backend/data/seed_data.py`, using the `faker` library) and inserted into PostgreSQL.

Beyond the seeded rows, a large share of what the UI displays is **procedurally generated at request time**, not computed from the stored data:

- Period-over-period "change %" values on KPI cards are random numbers in curated ranges (see `dashboard.py`, `customers.py`, `operations.py`), seeded by the selected start date so they stay stable for a given date range but vary between ranges.
- Cohort retention curves, deal cycle times, and sales-rep quota attainment are synthesized to look like a healthy, growing organization rather than derived purely from the tables.
- The "ML-powered forecasting" is an ordinary NumPy linear regression (`numpy.polyfit`, degree 1) plus random jitter. The "model performance" numbers (accuracy, MAPE, R², RMSE, confidence) in `forecasting.py` are entirely random — there is no trained model. Note: the README and `requirements.txt` mention scikit-learn, but **scikit-learn is not imported anywhere in the application code**.

None of this is hidden in the code, but it is easy to mistake the dashboard for a real analytics pipeline. Treat it as a realistic-looking demo, not a source of truth.

## Why it exists

The repository does not state its purpose in prose. Based on its shape — polished multi-page UI, synthetic data, Railway deployment config, no authentication, no real integrations — it reads as a **portfolio / demonstration project** showcasing a full-stack analytics UI. This is an inference, not something the repo documents explicitly.

## Current status

- Deployed-ready: Railway configuration is checked in (`backend/railway.json`, `backend/Procfile`) and the code contains Railway-specific handling (proxy header trust, `postgres://`→`postgresql://` URL rewriting, an auto-reseed-on-startup path, and a standalone reseed script intended for a Railway cron job).
- The app **auto-reseeds on startup** if the newest transaction is missing or older than 7 days (`backend/app/__init__.py`), which keeps a long-running deployment showing "recent" data.
- Most recent commit at time of writing: `2026-06-25` ("Auto-reseed on startup when data is older than 7 days"). Development activity is sporadic; the bulk of the work landed late December 2025.

## Tech stack

**Frontend** (`frontend/`)
- React 19 + TypeScript 5.9
- Vite 7 (dev server + production build)
- TailwindCSS 4 (via `@tailwindcss/vite`)
- Recharts 3 for charts
- TanStack Query 5 for server-state/caching
- React Router 7
- `date-fns`, `lucide-react`, `clsx`

**Backend** (`backend/`)
- Flask 3.0 + Flask-CORS + Flask-SQLAlchemy 3.1
- SQLAlchemy 2.0, `psycopg2-binary`
- Gunicorn (production WSGI server)
- `faker` (synthetic data), `numpy` (forecasting math)
- `pandas` and `scikit-learn` are declared in `requirements.txt` but unused by the code

**Infrastructure**
- PostgreSQL 15
- Docker / Docker Compose for local dev; Railway (NIXPACKS + gunicorn) for hosting

## Where it runs

- **Locally:** either `docker-compose up` (Postgres + backend + frontend containers) or manually (`python run.py` for the API and `npm run dev` for the frontend). See `SETUP.md`.
- **Hosted:** Railway, where gunicorn serves the Flask app (which also serves the built frontend from `backend/static/`) against a Railway-provided PostgreSQL instance. The specific Railway project/URL is not recorded in the repository.

## Who uses it

No authentication or authorization exists anywhere in the codebase, and CORS is open (`origins: "*"` for `/api/*`). It is effectively a single-tenant, public, read-only demo — there are no user accounts, roles, or per-user data. The repo does not document an intended audience beyond that.
