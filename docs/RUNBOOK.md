# Runbook

Common failure modes and how to fix them. Symptoms are grouped by where they show up. Most incidents here trace back to the database connection, the seed/reseed logic, or the port/build configuration.

## Dashboard loads but every number is zero / empty

**Likely cause:** the database is reachable but not seeded, or seeding failed silently.

Why it fails quietly: `create_app` wraps `db.create_all()` and the auto-reseed in bare `try/except` that swallow all exceptions. If seeding throws (e.g. permissions, disk, a transient error mid-batch), the app still starts and serves empty aggregations.

**Fix / diagnose:**
1. Check data exists: `GET /api/dashboard/summary` — is `kpis.totalRevenue.value` zero?
2. Query the DB directly: `SELECT count(*), max(transaction_date) FROM transactions;`
3. Force a reseed: from `backend/`, `python reseed.py` (destructive full reload), or `GET /api/seed-database` (returns the traceback in its JSON on error — useful here).
4. Watch logs during seeding; it prints per-batch progress ("Inserted N / 55000").

## API returns 500 / app can't reach the database

**Likely cause:** bad or missing `DATABASE_URL`, DB down, or wrong config in effect.

**Fix / diagnose:**
- Confirm `FLASK_ENV`. If it's unset or `development` in production, the app falls back to the dev DB default `postgresql://localhost/analytics_dashboard`, which won't exist on Railway → connection errors. Set `FLASK_ENV=production` and a real `DATABASE_URL`.
- If `DATABASE_URL` starts with `postgres://` and you're **not** in `production` config, it is **not** rewritten (only `ProductionConfig` does the `postgres://`→`postgresql://` fix). Symptom: SQLAlchemy dialect error. Fix: use `FLASK_ENV=production` or supply a `postgresql://` URL.
- `/api/health` returns healthy even when the DB is down (it doesn't touch the DB). Don't rely on it alone; use `/api/dashboard/summary` as a data-level check.
- The SQLAlchemy pool uses `pool_pre_ping=True` / `pool_recycle=300`, so brief DB blips self-heal; persistent 500s mean a real connectivity/credential problem.

## Data suddenly reset / manually inserted rows disappeared

**Cause:** the auto-reseed on startup, or a call to the seed endpoint/script. Any of these runs `TRUNCATE TABLE transactions, pipeline, customers, sales_reps, products RESTART IDENTITY CASCADE`.

- The startup check reseeds whenever `max(transaction_date)` is missing or older than 7 days. On a service that restarts (deploys, crashes, Railway sleep/wake), this can fire and wipe everything.
- `GET /api/seed-database` is **public and destructive** — anyone can trigger a full reset.

**Fix:** This app is designed around disposable synthetic data, so a reset is usually harmless. If you must preserve data, disable the auto-reseed block in `create_app`, remove/guard `/api/seed-database`, and don't run `reseed.py`.

## Startup is slow / deploy takes a long time to become healthy

**Cause:** first-boot seeding inserts ~55,000 transactions in 1,000-row batches (plus 2,000 customers, 500 pipeline rows, etc.) inside the startup path.

**Fix:** expected on a cold/empty database. Give it time; watch `Inserted N / 55000` in logs. If Railway's health check times out, raise the timeout or seed out-of-band (run `reseed.py` once, then deploy the web process against the already-populated DB).

## Frontend can't reach the API (network errors in the browser console)

**Cause:** port/base-URL mismatch. This has several variants:

- **Docker Compose:** the backend service runs `python run.py` (listens on **5001** in the container) but publishes `5000:5000`, and the frontend's `VITE_API_URL` points at `http://localhost:5000`. As written, requests don't reach the app. Fix: run gunicorn on `$PORT`/`5000` in the compose `command`, or align the published port and `VITE_API_URL` to `5001`. (See `SETUP.md` for the full port table.)
- **Manual dev:** ensure the backend is on `5001` (that's what `run.py` and the Vite proxy assume) and the frontend on `3000`. If you started the backend under gunicorn, it's on `$PORT`, not `5001` — point the Vite proxy accordingly.
- **Production:** `VITE_API_URL` should be unset so the SPA calls same-origin `/api`. If it's baked to a localhost URL at build time, the deployed bundle will call the wrong host. Rebuild with the correct (or empty) `VITE_API_URL`.

## A UI change doesn't appear in production

**Cause:** production serves the committed build in `backend/static/`, not `frontend/src/`. Editing source without rebuilding leaves the old bundle in place.

**Fix:** `cd frontend && npm run build && cp -r dist/* ../backend/static/`, then commit `backend/static/` and redeploy. (See `MAINTENANCE.md`.)

## Numbers differ between two pages, or "change %" looks made up

**Not a bug — by design.** Many metrics are generated with date-seeded randomness, and "change %" values are curated positive ranges rather than true period-over-period math (see `ARCHITECTURE.md` and `DECISIONS.md`). Cross-page figures that *should* match are kept consistent via shared helpers (`get_pipeline_metrics`, `get_at_risk_customers_with_scores`, `get_model_metrics`). If two pages disagree on a value that flows through one of those helpers, check that both call the helper rather than recomputing locally.

## Exported CSV/JSON/PDF only contains KPIs (trend/category/products/pipeline sections empty)

**Cause:** `utils/export.ts` fetches only `/api/dashboard/summary`, which returns just `{ kpis, dateRange }`. The other sections are guarded by `?.length`, so they render empty. This is a known limitation of how the export is wired, not a data outage. To include those sections, the export would need to fetch the revenue/pipeline/products endpoints too (or `/dashboard/summary` would need to return them).

## Forecast chart shows nothing

**Cause:** `/forecasting/revenue` returns `[]` when there are fewer than 3 months of historical revenue. On a freshly seeded DB there are ~24 months, so this usually only happens if seeding didn't complete.

**Fix:** verify the transactions table is populated (see the first two sections), then reload.
