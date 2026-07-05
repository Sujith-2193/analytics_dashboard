# Maintenance

This project is set up to deploy on **Railway** as a single Flask web process (which also serves the built frontend) plus a PostgreSQL database. This document covers deploying, updating dependencies, rotating secrets, and checking health. The specific Railway project name/URL is not recorded in the repo; commands below are generic.

## Deployment model

- **Builder:** NIXPACKS (`backend/railway.json`). Railway detects the Python app in `backend/` and builds it.
- **Start command:** `gunicorn run:app --bind 0.0.0.0:$PORT --workers 2` (`backend/railway.json` and `backend/Procfile` agree).
- **Frontend:** served by Flask from `backend/static/`. The build is committed to git, so a deploy does not require a Node build step on Railway.
- **Proxy handling:** `ProxyFix` trusts Railway's forwarded headers for correct HTTPS/host.
- **Database URL:** `ProductionConfig` reads `DATABASE_URL` and rewrites a leading `postgres://` to `postgresql://` automatically.

There is also a root `Dockerfile` (Python 3.11, gunicorn) and `backend/Dockerfile` (Python 3.12, `python run.py`) — usable for container-based hosting, but the checked-in Railway config uses NIXPACKS, not these Dockerfiles.

## Deploying an update

Backend-only change:
1. Commit the change to the deployed branch (`main`).
2. Push; Railway rebuilds and restarts with the gunicorn start command.

Frontend change (must rebuild and commit the static bundle, since the deploy serves the committed build):
```bash
cd frontend
npm install            # if deps changed
npm run build          # → frontend/dist/
cp -r dist/* ../backend/static/
cd ..
git add backend/static
git commit -m "Update backend static assets with new frontend build"
git push
```
Forgetting the rebuild-and-copy step is the most common way for a UI change to "not show up" in production — the server keeps serving the old committed bundle.

## Required environment variables in production

Set these on the Railway service (see `SETUP.md` for the authoritative table):
- `DATABASE_URL` — provided by the Railway Postgres plugin (or set manually). **Required** in production; `ProductionConfig` has no fallback.
- `SECRET_KEY` — set to a real secret; do **not** ship the `dev-secret-key-change-in-production` default.
- `FLASK_ENV=production` — otherwise the app runs in development config (`DEBUG=True`, dev DB default).

## Data / seeding operations

- **Automatic:** on every startup the app reseeds if the newest transaction is missing or >7 days old. A fresh deploy therefore self-populates.
- **Manual full reseed (destructive):** run `python reseed.py` from `backend/` (or hit `GET /api/seed-database`). Both run `TRUNCATE ... RESTART IDENTITY CASCADE` and reload ~55k transactions. Expect a delay while inserting in 1,000-row batches.
- **Scheduled reseed:** `reseed.py` is designed to be a separate Railway service on a cron schedule so the demo data periodically refreshes. If you want continuous freshness beyond the 7-day startup check, configure that cron.
- **Lock down before any real use:** the `/api/seed-database` route is unauthenticated and destructive. Remove it (its own comment says "remove after seeding") or gate it before the app ever holds data you care about.

## Updating dependencies

**Backend** (`backend/requirements.txt`, pinned exact versions):
```bash
cd backend
source venv/bin/activate
pip install -U <package>
pip freeze | grep -i <package>     # capture the new pin, edit requirements.txt
```
Watch the numpy/pandas/Python-version interplay — the 2026-05-09 commit existed specifically to keep pandas+numpy compatible with Python 3.12. If you drop the unused `pandas`/`scikit-learn` (see `DEPENDENCIES.md`), you remove that whole compatibility surface and shrink the image.

**Frontend** (`frontend/package.json`, caret ranges; `package-lock.json` present):
```bash
cd frontend
npm outdated
npm update                # within semver ranges
npm run build && npm run lint   # verify build + lint still pass
```
After any frontend dependency change, rebuild and re-copy the static bundle (see "Deploying an update").

## Rotating secrets

- **`SECRET_KEY`:** set a new value on the Railway service and redeploy. Flask uses it for session signing; rotating it invalidates any signed cookies (negligible impact here since there are no user sessions/auth).
- **`DATABASE_URL` / DB credentials:** rotate via the Railway Postgres plugin, then update `DATABASE_URL` on the app service. The app's SQLAlchemy pool uses `pool_pre_ping=True` and `pool_recycle=300`, so it recovers from credential/connection changes without a manual restart, though a restart is cleanest.
- **The `dev-secret-key-change-in-production` default and the `backend/.env` file are for local dev only** — never rely on them in production. `backend/.env` is git-ignored; keep it that way.

## Health checks

- `GET /api/health` → `{ "status": "healthy", "environment": "<config_name>" }`. Use this as the Railway health check path. Note it returns healthy even if the database is unreachable (the route does not touch the DB), so pair it with a data check for real monitoring:
- `GET /api/dashboard/summary` → should return non-zero `kpis.totalRevenue.value` when the database is seeded. A 500 or all-zero response indicates a DB/seed problem. See `RUNBOOK.md`.
