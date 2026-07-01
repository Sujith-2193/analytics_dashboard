# Dependencies

Two package managers: **pip** (`backend/requirements.txt`, exact pins) and **npm** (`frontend/package.json`, caret ranges, with `package-lock.json`). For each dependency: why it's here and what would replace it.

## Backend (Python — `backend/requirements.txt`)

| Package | Version | Why it's used | What would replace it |
|---|---|---|---|
| `flask` | 3.0.0 | Core web framework; app factory, blueprints, routing, JSON responses. | FastAPI (async, built-in validation) or Django (heavier, batteries-included). |
| `flask-cors` | 4.0.0 | Opens `/api/*` to cross-origin requests for the split dev setup (Vite on 3000 → API on 5001). Unnecessary in production (same-origin). | Hand-written `after_request` CORS headers, or a reverse proxy that injects them. |
| `flask-sqlalchemy` | 3.1.1 | Flask integration for SQLAlchemy (the `db` object, app-context session handling, `db.Model`). | Plain SQLAlchemy 2.0 with a manually managed session/scoped session. |
| `sqlalchemy` | 2.0.23 | The ORM itself: models, relationships, `func`-based aggregation queries. | Django ORM, Peewee, or raw SQL via `psycopg2`. |
| `psycopg2-binary` | 2.9.9 | PostgreSQL driver used by SQLAlchemy. | `psycopg` (v3), or `asyncpg` if moving to async. `-binary` is convenient but the source build (`psycopg2`) is preferred for production images. |
| `python-dotenv` | 1.0.0 | Loads `backend/.env` in `config.py` (`load_dotenv()`). | Rely solely on real environment variables (Railway/Docker inject them), dropping local `.env` loading. |
| `gunicorn` | 21.2.0 | Production WSGI server (Railway/Procfile/Docker start command, 2 workers). | `uwsgi`, `waitress` (Windows-friendly), or `hypercorn`/`uvicorn` if switching to ASGI. |
| `faker` | 22.0.0 | Generates the synthetic dataset in `data/seed_data.py` (company names, people, dates, `bs()` phrases). | `mimesis`, or hand-rolled random generators. |
| `numpy` | 1.26.4 | The only real math dependency in use: `polyfit`/`arange`/`array` for the revenue trend line (`forecasting.py`) and `np.random.seed` in the seeder. | Pure-Python least-squares (a few lines) would remove it entirely. |
| `pandas` | 2.2.3 | **Not imported anywhere in the application code.** Declared but unused. | Remove it. Nothing depends on it. |
| `scikit-learn` | 1.3.2 | **Not imported anywhere in the application code.** The README's "scikit-learn for ML forecasting" is aspirational; forecasting uses NumPy only. | Remove it, or actually use it if real modeling is added (e.g. `LinearRegression`, `RandomForestRegressor`). |

**Cleanup opportunity:** `pandas` and `scikit-learn` are the two largest wheels here and neither is used. Dropping them shrinks the image and install time significantly and eliminates the numpy/pandas/Python-version compatibility juggling that prompted the 2026-05-09 commit. Verify first with `grep -rn 'pandas\|sklearn' backend/app backend/data` (currently: no matches).

There is no separate dev/test dependency group — no `pytest`, linter, or formatter is declared for the backend.

## Frontend (npm — `frontend/package.json`)

### Runtime dependencies

| Package | Range | Why it's used | What would replace it |
|---|---|---|---|
| `react` / `react-dom` | ^19.2.0 | UI library; the whole SPA. | Preact (smaller, mostly compatible), Solid, Svelte (larger rewrite). |
| `react-router-dom` | ^7.11.0 | Client-side routing for the five pages under a shared `Layout`. | TanStack Router, or Wouter (minimal). |
| `@tanstack/react-query` | ^5.90.12 | Server-state: caching, `staleTime`, `keepPreviousData` on date-range changes, refetching. Central to how every page loads data. | SWR (lighter, similar model), or hand-rolled fetch + `useEffect` state (loses caching/dedup). |
| `recharts` | ^3.6.0 | All charts (Area, Bar, Pie/Donut, Funnel). | `visx`, `nivo`, `chart.js` (via `react-chartjs-2`), or ECharts. |
| `tailwindcss` | ^4.1.18 | Utility-first styling used throughout the components. | CSS Modules, vanilla-extract, or a component library (MUI/Chakra). |
| `@tailwindcss/vite` | ^4.1.18 | Tailwind v4's official Vite plugin (Tailwind is wired via Vite, not a PostCSS `tailwind.config`). | The PostCSS plugin path (`postcss` + `@tailwindcss/postcss`). |
| `autoprefixer` | ^10.4.23 | PostCSS vendor prefixing. | `lightningcss` (Vite can use it), or drop if targeting evergreen browsers only. |
| `postcss` | ^8.5.6 | CSS pipeline that Tailwind/autoprefixer run on. | Bundler-native CSS (e.g. Lightning CSS). |
| `date-fns` | ^4.1.0 | Date-preset math in `useFilters` (`subDays`, `subMonths`, `startOfYear`, `format`). | `dayjs` (smaller), `luxon`, or native `Intl`/`Date`. |
| `lucide-react` | ^0.562.0 | Icon set used in header/sidebar/cards. | `react-icons`, `@heroicons/react`, or inline SVGs. |
| `clsx` | ^2.1.1 | Conditional className composition. | `classnames`, or template strings. |

> Note: `autoprefixer` and `postcss` are listed under `dependencies` even though they are build-time tools; that placement doesn't affect behavior.

### Dev dependencies

| Package | Range | Why it's used |
|---|---|---|
| `vite` | ^7.2.4 | Dev server (port 3000, `/api` proxy → 5001) and production bundler (`vite build`). |
| `@vitejs/plugin-react` | ^5.1.1 | React fast-refresh + JSX transform for Vite. |
| `typescript` | ~5.9.3 | Type checking; `npm run build` runs `tsc -b` before `vite build`. |
| `typescript-eslint` | ^8.46.4 | TypeScript-aware ESLint rules. |
| `eslint` + `@eslint/js` | ^9.39.1 | Linting (`npm run lint`) — the only automated quality gate in the repo. |
| `eslint-plugin-react-hooks` | ^7.0.1 | Enforces Rules of Hooks. |
| `eslint-plugin-react-refresh` | ^0.4.24 | Warns about patterns that break fast-refresh. |
| `globals` | ^16.5.0 | Global variable definitions for the ESLint flat config. |
| `@types/node` | ^24.10.1 | Node typings (used by `vite.config.ts` etc.). |
| `@types/react` / `@types/react-dom` | ^19.x | React typings. |

**Replacement notes for the toolchain:** Vite could be swapped for a Next.js/Remix setup (bigger change, would also alter the deployment model), or for Rspack/Turbopack-based tooling. The ESLint stack is standard for a Vite + TS + React app and has no unusual pieces.
