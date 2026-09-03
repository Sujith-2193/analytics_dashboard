# SignalFlow Analytics

SignalFlow Analytics is an independently maintained business intelligence dashboard covering five areas: Dashboard, Revenue, Customers, Operations, and Forecasting. It preserves the original analytics functionality while migrating the backend to FastAPI and refreshing the frontend with a modern cockpit-style interface.

## Stack

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, Recharts, TanStack Query, React Router, lucide-react.

**Backend:** FastAPI, SQLAlchemy, PostgreSQL, Pandas, NumPy, scikit-learn.

**ML:** Gradient-boosted churn classification and ridge-regression monthly revenue forecasting, both measured on holdout data.

## Features

- Executive dashboard with KPIs, revenue trends, pipeline funnel, and top products.
- Revenue analytics by trend, category, region, channel, and product.
- Customer analytics with segments, cohorts, lifetime value distribution, and churn risk.
- Operations analytics for pipeline stages, sales performance, conversion rates, cycle time, and deal-size distribution.
- Forecasting page with revenue forecast, pipeline forecast, seasonality, revenue at risk, churn risk, and model performance.
- Static demo mode that serves pre-generated API responses from `frontend/public/data`.
- FastAPI OpenAPI docs at `/docs` when the backend is running.

## Getting Started

### Backend

```bash
cd backend
python -m pip install -r requirements.txt
set APP_ENV=development
set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/analytics_dashboard
python reseed.py
python run.py
```

The API runs on `http://localhost:5001`. Health is available at `http://localhost:5001/api/health`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs on `http://localhost:3000` and proxies `/api` to the FastAPI backend.

### Docker

```bash
docker compose up --build
docker compose exec backend python reseed.py
```

Backend: `http://localhost:5001`
Frontend: `http://localhost:3000`

## Verification

Backend tests:

```bash
cd backend
python -m pytest
```

Frontend tests and production build:

```bash
cd frontend
npm run test
npm run build
```

The backend test suite includes Postgres-backed consistency tests. They skip cleanly when no disposable Postgres test database is reachable. To run them locally, set `TEST_DATABASE_URL` to a database whose name ends in `_test`.

## API

The API keeps the existing `/api/...` contract so the frontend pages preserve their behavior:

| Prefix | Area |
|---|---|
| `/api/dashboard` | KPI summary and executive dashboard data |
| `/api/revenue` | Revenue trends and breakdowns |
| `/api/customers` | Customer overview, segments, cohorts, LTV, risk |
| `/api/operations` | Pipeline, sales performance, conversion, cycle time |
| `/api/forecasting` | Revenue forecast, churn, seasonality, model metrics |

## Project Structure

```text
analytics_dashboard/
├── backend/
│   ├── app/
│   │   ├── ml/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── fastapi_compat.py
│   │   └── __init__.py
│   ├── data/
│   ├── scripts/
│   ├── tests/
│   └── run.py
├── frontend/
│   ├── public/
│   └── src/
│       ├── components/
│       ├── hooks/
│       ├── pages/
│       └── services/
├── docker-compose.yml
└── README.md
```

## Notes

This repository intentionally does not rewrite historical authorship. The current implementation is maintained as SignalFlow Analytics, reusing proven domain logic where it keeps behavior correct and replacing the framework and presentation layers for the new project direction.
