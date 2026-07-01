# Decision Log

Design decisions inferred from the code and git history. Each entry records the choice, the reasoning evident in the repo, and the trade-off. Where a rationale is inferred rather than documented, it is marked as such.

## 1. Single Flask service serves both the API and the built React SPA
**Decision.** Rather than deploy the React frontend and Flask backend as two separate services, the production setup builds the frontend to static files, places them in `backend/static/`, and lets Flask serve `index.html` (with SPA fallback for client routes) alongside the `/api/*` endpoints from one origin.

**Why (evident in code + history).** `create_app` detects `backend/static/` and conditionally registers `/` and `/<path:path>` routes. The 2025-12-25 commits "Include built frontend for simpler deployment" and "use backend as root" show this was a deliberate move to simplify Railway deployment to a single web process. Same-origin also removes the need for CORS/proxy config in production.

**Trade-off.** The frontend build output is committed to git (`backend/static/`, `frontend/dist/`), so those artifacts can drift from `frontend/src/` and must be rebuilt-and-committed on every UI change (hence the recurring "Update backend static assets" commits). The upside is a dead-simple deploy: one container, one process, one Postgres.

## 2. Synthetic data generated in-app, with deterministic date-seeded randomness
**Decision.** All data is produced by `backend/data/seed_data.py` (Faker) and stored in Postgres; on top of that, many displayed metrics (change %, retention, cycle times, attainment, forecast jitter, model accuracy) are generated at request time using `random.seed(hash(start_date) % N)`.

**Why (inferred).** The goal is a convincing, self-contained demo with no external data dependency. Seeding randomness by the selected date range makes the dashboard *stable on refresh* but *responsive to filter changes* — the git history's "data variation for all pages when switching time periods" and "Remove ALL zeros" commits show this was an explicit product goal.

**Trade-off.** The dashboard looks like real analytics but isn't; several "metrics" are cosmetic. This is fine for a demo and actively harmful if mistaken for a real reporting tool. It also means the numbers are not internally derivable from the stored rows, which is why shared helper functions exist to keep pages agreeing (see Decision 4).

## 3. Auto-seed and auto-reseed on startup
**Decision.** On boot, the app creates tables and, if the newest transaction is missing or older than 7 days, regenerates the entire dataset (`TRUNCATE` + reload). A standalone `reseed.py` covers scheduled reseeding.

**Why (evident).** The 2026-06-25 commit "Auto-reseed on startup when data is older than 7 days" plus the 2026-02-13 Railway cron script show the intent: a hosted demo should always display "recent" data without manual intervention.

**Trade-off.** Startup can be slow and destructive — any manually entered data is wiped whenever the freshness check trips. The freshness/seed logic is wrapped in bare `try/except`, so failures are silent (the app serves empty data instead of crashing), which trades debuggability for uptime.

## 4. Shared helper functions for cross-endpoint consistency
**Decision.** Generation of pipeline metrics, at-risk customers/risk scores, and "model performance" is centralized in `operations.get_pipeline_metrics`, `forecasting.get_at_risk_customers_with_scores`, and `forecasting.get_model_metrics`, imported across blueprints.

**Why (evident).** Because numbers are partly generated, the same figure could otherwise differ between the Dashboard, Customers, and Forecasting pages. These helpers exist so a value shown twice matches. The 2025-12-29 "consistent data" commit reflects this.

**Trade-off.** It introduces cross-blueprint imports (e.g. `dashboard.py` imports from `operations.py`; `customers.py` imports from `forecasting.py`), coupling the route modules together. Acceptable at this size; a service layer would be cleaner if it grew.

## 5. Forecasting with NumPy linear regression, not scikit-learn
**Decision.** Revenue forecasting fits a degree-1 trend with `numpy.polyfit` and adds random variance for confidence bands; "model performance" metrics are random. `scikit-learn` and `pandas` are listed in `requirements.txt` but never imported.

**Why (inferred).** A real trained model is unnecessary for a demo, and a linear trend on the seeded upward-growth data looks plausible. The sklearn/pandas entries appear aspirational (or leftover), matching the README's "ML-powered" framing.

**Trade-off.** The framing oversells the capability. Keeping unused heavy dependencies inflates the image and install time (see `DEPENDENCIES.md`). Removing them would be safe.

## 6. No authentication, open CORS
**Decision.** No auth anywhere; `CORS(..., origins: "*")` for `/api/*`; the seed endpoint is public.

**Why (inferred).** It's a read-only public demo of synthetic data; there is nothing to protect.

**Trade-off.** Anyone can hit `/api/seed-database` and trigger a full destructive reseed. Fine for throwaway demo data; unacceptable if real data were ever added. See `RUNBOOK.md`.

## 7. Stack choice: Flask + SQLAlchemy + PostgreSQL / React 19 + Vite + Recharts + TanStack Query
**Decision.** A conventional, well-supported full-stack combination rather than a meta-framework (Next.js) or a BI tool.

**Why (inferred).** Maximizes control and demonstrates end-to-end skills (custom REST API, ORM modeling, SPA data fetching/caching, charting) — consistent with a portfolio project. Recharts + TanStack Query cover charts and server-state caching with minimal glue.

**Trade-off.** More hand-written plumbing (one API function + one hook per endpoint) than a batteries-included framework, but no framework lock-in and a transparent, readable codebase.
