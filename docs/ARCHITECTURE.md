# Architecture

## The pieces and how they connect

```
Browser (React SPA)
  │
  │  fetch()  →  /api/*   (JSON)
  ▼
Flask app  (backend/app/__init__.py: create_app)
  ├── Blueprints (one per domain)
  │     dashboard.py  revenue.py  customers.py  operations.py  forecasting.py
  ├── SQLAlchemy models → PostgreSQL
  └── Static file serving (serves the built React app in production)
        static_folder = backend/static/
```

There are two runtime topologies:

- **Development (recommended local path):** Vite dev server runs the React app on port `3000` and proxies `/api/*` to the Flask API on port `5001`. The two processes are separate. (`frontend/vite.config.ts`, `backend/run.py`.)
- **Production (Railway / gunicorn / single container):** the frontend is built (`npm run build`) and its output is placed in `backend/static/`. Flask serves both the API and the SPA from one origin, so no CORS or proxy is needed. `create_app` detects `backend/static/` and, if present, registers routes for `/` and `/<path:path>` with SPA fallback to `index.html`.

`backend/static/` currently contains a committed build (`index.html`, `assets/index-*.js`, `assets/index-*.css`), so the deployed app can serve the UI without a build step. `frontend/dist/` is the local Vite build output that gets copied into `backend/static/`, but it is git-ignored (`frontend/.gitignore`) and not committed — only the copy under `backend/static/` is checked into git. That committed bundle is a build output kept for deployment convenience; the source of truth is `frontend/src/`.

## Backend structure

**Application factory** (`backend/app/__init__.py`)
- `create_app(config_name)` builds the Flask app, selects config by `FLASK_ENV` (default `development`), initializes SQLAlchemy and CORS, and registers the five domain blueprints plus a couple of utility routes.
- `ProxyFix` is applied so Railway/Heroku-style proxy headers (`X-Forwarded-*`) are trusted for correct HTTPS/host handling.
- On startup it runs `db.create_all()` (idempotent) and then **auto-reseeds** if `max(transactions.transaction_date)` is `NULL` or older than 7 days. Both steps are wrapped in bare `try/except` that swallow all errors, so a failing DB connection at boot does not crash the process — it just serves empty data.

**Utility routes** (registered in the factory, not in a blueprint)
- `GET /api/health` — returns `{status, environment}`.
- `GET /api/seed-database` — one-time seeding trigger; the code comments mark it "remove after seeding". It is unauthenticated.

**Config** (`backend/app/config.py`)
- `DevelopmentConfig` (default), `ProductionConfig`, `TestingConfig` (SQLite in-memory — but there are no tests that use it).
- `ProductionConfig` rewrites `postgres://` → `postgresql://` (Heroku/Railway legacy URL format).
- Engine options set `pool_pre_ping=True` and `pool_recycle=300` to survive dropped Postgres connections.

**Models** (`backend/app/models/`) — SQLAlchemy ORM, one file per table:
`Product`, `Customer`, `SalesRep`, `Transaction`, `Pipeline`, `DailyMetric`. Each has a `to_dict()` that converts snake_case columns to **camelCase** JSON keys and casts `Numeric`/`Date` to JSON-friendly types. Relationships wire `Transaction`/`Pipeline` back to `Customer`, `Product`, and `SalesRep`.

> **`daily_metrics` is vestigial.** The `DailyMetric` model exists and its table is created, but nothing seeds it and no route queries it. It is dead schema.

**Routes** (`backend/app/routes/`) — each blueprint owns a URL prefix (`/api/dashboard`, `/api/revenue`, `/api/customers`, `/api/operations`, `/api/forecasting`). Endpoints read `start_date`/`end_date` query params (default windows vary per endpoint), run aggregation queries with SQLAlchemy `func.sum/count/avg` + `date_trunc`, and return plain lists/dicts (Flask jsonifies them).

## Frontend structure

**Providers** (`frontend/src/App.tsx`, top to bottom): `ErrorBoundary` → `QueryClientProvider` → `FilterProvider` → `BrowserRouter`. React Query defaults: `retry: 1`, `refetchOnWindowFocus: false`, `staleTime: 5min` (individual hooks override to `30s`).

**Global filter state** (`frontend/src/hooks/useFilters.tsx`)
- A React context holds the active `dateRange` (plus unused `region`/`segment`/`category` slots).
- Date presets: `last7d`, `last30d`, `last90d`, `ytd`, `lastYear`, `custom`. Default is **`last90d`**. (Note: the header UI in `Header.tsx` exposes all five presets, even though commit history at one point removed "Last 7 days"/"Year to date" — they are present again in the current code.)

**Data layer**
- `frontend/src/services/api.ts` — one typed function per endpoint, grouped into `dashboardApi`, `revenueApi`, `customerApi`, `operationsApi`, `forecastingApi`, `healthApi`. Base URL is `import.meta.env.VITE_API_URL || '/api'`.
- `frontend/src/hooks/useApi.ts` — a React Query hook per endpoint. Each hook pulls `dateRange` from `useFilters()`, puts it in the query key, and uses `keepPreviousData` so charts don't flash empty when the date range changes.

**UI composition** — `pages/*` compose `components/cards/*` (KPICard, ChartCard), `components/charts/*` (Area, Bar, Pie/Donut, Funnel — all Recharts wrappers), `components/tables/DataTable`, and `components/layout/*` (Layout, Header, Sidebar). `utils/export.ts` builds CSV/JSON/PDF client-side.

## Data flow (one request, end to end)

1. User picks a date preset in `Header` → `setDatePreset` updates `FilterProvider` state.
2. Every mounted `useApi` hook has that date range in its query key, so React Query refetches.
3. The hook calls the matching `api.ts` function, which builds a query string and `fetch`es `/api/<domain>/<resource>?start_date=…&end_date=…`.
4. Flask routes the request to a blueprint handler, which parses the dates, runs SQLAlchemy aggregations against Postgres, mixes in date-seeded synthetic values where applicable, and returns JSON.
5. React Query caches the result under the query key; the page re-renders its Recharts charts and tables.

## Where the complexity lives, and why

The genuinely non-obvious part of this codebase is **not** the plumbing (Flask + SQLAlchemy + React Query is standard). It is the deliberate blending of real aggregation with generated numbers to make a demo look convincing. Key patterns:

- **Deterministic randomness seeded by date.** Many endpoints call `random.seed(hash(start_date) % N + offset)` before generating "change %", retention, cycle times, etc. Effect: results are *stable* for a given date range (so refreshing doesn't reshuffle the dashboard) but *differ* across ranges (so switching presets visibly changes the numbers). This is intentional and load-bearing for the demo feel.
- **"Never show a zero" logic.** `dashboard.py`'s `ensure_nonzero()` replaces any zero/None change with a random positive value in a curated band. Several commits ("Remove ALL zero fallbacks", "ensure NO zeros") were dedicated to this.
- **Curated attainment curve.** `operations.py get_sales_performance()` computes real per-rep revenue, then *overwrites* attainment with a hand-shaped distribution (top 6 exceed quota, middle 6 near quota, bottom below) so the "Sales Team Performance" panel always tells a growth story.
- **Cross-endpoint consistency helpers.** To keep numbers agreeing across pages, three shared functions centralize generation:
  - `operations.get_pipeline_metrics()` — pipeline value / win rate / avg deal size (used by dashboard **and** operations).
  - `forecasting.get_at_risk_customers_with_scores()` — the at-risk customer list and per-customer risk scores (used by `/customers/at-risk`, `/customers/overview`, `/forecasting/churn-risk`, `/forecasting/kpis`, `/forecasting/revenue-at-risk`).
  - `forecasting.get_model_metrics()` — the fake model-accuracy block (used by `/forecasting/kpis` and `/forecasting/model-performance`).
  These exist specifically so the same figure shown on two pages matches.
- **Forecasting math.** `/forecasting/revenue` fits a degree-1 trend line to historical monthly revenue with `numpy.polyfit`, bridges from the last actual month, projects `periods` months forward, and adds ±random variance for the confidence band. It is real regression on synthetic history, wrapped in random jitter — not a statistical model with fitted uncertainty.

## Known internal inconsistencies (documented, not fixed)

- **`DashboardSummary` type vs. actual response.** The TS type `DashboardSummary` (`frontend/src/types/index.ts`) declares `revenueTrend`, `revenueByCategory`, `topProducts`, `pipelineSummary`, `recentCustomers`, but the `/api/dashboard/summary` endpoint returns only `{ kpis, dateRange }`. The Dashboard page fetches those other sections from separate endpoints. As a side effect, the CSV/JSON/PDF export (`utils/export.ts`), which pulls only from `/dashboard/summary`, emits KPIs but leaves the trend/category/products/pipeline sections empty (they are guarded by `?.length`).
- **Two endpoints are not in the README.** `/api/operations/deal-size-distribution` and the utility routes `/api/health` and `/api/seed-database` exist in code. `API.md` lists everything.
- **Port configuration is inconsistent across files.** See `SETUP.md` for the full table; the short version is that `run.py` hardcodes `5001` while `docker-compose.yml` maps `5000`.
