# Changelog

Reconstructed from git history (40 commits), grouped by date, newest first. Dates are commit dates. This is a milestone summary, not a per-commit log.

## 2026-06-25
- **Auto-reseed on startup when data is older than 7 days.** `create_app` now checks the newest transaction date on boot and regenerates all data if it is missing or >7 days old, keeping long-running deployments "fresh."

## 2026-06-23
- Added `CLAUDE.md` project context file.

## 2026-05-09
- Upgraded pandas and numpy for Python 3.12 compatibility (backend Dockerfile targets `python:3.12-slim`).

## 2026-02-13
- **Scheduled reseeding for Railway.** Added the standalone `reseed.py` script intended to run as a Railway cron service.
- Fixed stale seed data and restored the date-range presets.

## 2026-01-18
- Fixed the customer acquisition chart and KPI percentage calculations.
- Rebuilt and updated the backend static assets from a new frontend build.
- Temporarily removed "Last 7 Days" and "Year to Date" from the date-range options (both are present in the current code).

## 2025-12-29
- Fixed date-label overlap and made the dashboard default to the 90-day view.
- Major dashboard polish: consistent cross-page data, improved layouts, and a blue color scheme.
- Rebuilt backend static assets from the latest frontend build.

## 2025-12-26
- Updated the README to match the actual implementation.
- **Added comprehensive code documentation** (the module/class docstrings seen throughout `backend/app`).
- Expanded cohort retention from a shorter window to a full 12 months; fixed sales-team data.
- Fixed assorted UI issues across pages.
- Added working CSV/JSON/PDF export and made the app default to light mode.

## 2025-12-25 (initial build + rapid iteration)
This is the bulk of the project; it went from initial commit to production-ready in a single day of heavy iteration.
- **Initial commit: Enterprise Analytics Dashboard.**
- Railway deployment work: added a Dockerfile, iterated on Railway build configuration, moved to using `backend/` as the deploy root, bundled the built frontend for simpler single-service deployment, and added several "trigger redeploy" commits.
- Added a `/api/seed-database` endpoint for seeding the production database and handling of pre-existing tables.
- **Data-realism campaign:** a series of commits to eliminate zero values everywhere — "Fix all vs previous period values", "Remove ALL zero fallbacks", "ensure NO zeros / realistic values everywhere", and verifying KPI change percentages.
- **Date-filter reactivity:** added `start_date`/`end_date` filtering to all pages and endpoints, and made every page's data vary when the time period changes.
- Chart/UI fixes: donut charts sorted descending with always-on % labels, tooltip text colors, removed bar-chart hover background, fixed the forecast gap, light-mode styling, chart colors; removed the default Vite favicon.
- Added a professional README.

---

Notes for anyone extending this changelog:
- The recurring "Update/Rebuild backend static assets" commits are frontend builds copied into `backend/static/` for deployment; they are not source changes.
- The frequent "trigger redeploy" commits on 2025-12-25 were Railway deployment plumbing, not features.
