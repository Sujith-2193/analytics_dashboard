# Analytics Dashboard

A full-stack business intelligence dashboard featuring real-time KPI tracking, interactive data visualizations, and ML-powered revenue forecasting. Built with React 19, Flask, and PostgreSQL.

### **[Open the live demo →](https://analytics.ryansansbury.com)**

Five pages of it, no signup. Everything you see was produced by the code in this
repository: the queries ran against PostgreSQL, and the churn and forecasting
figures come from scikit-learn models scored on a holdout rather than from
plausible-looking constants.

[![CI](https://github.com/ryansansbury/analytics_dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/ryansansbury/analytics_dashboard/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?logo=flask&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

![Executive dashboard](docs/screenshots/dashboard.png)

<details>
<summary><b>More screens</b> — forecasting, customers, revenue</summary>

**Forecasting.** Six-month prediction continuing the actual series, with a
confidence band from holdout RMSE, and model metrics reported next to the naive
baseline they have to beat.

![Forecasting](docs/screenshots/forecasting.png)

**Customer intelligence.** Segmentation, cohort retention, and lifetime value.

![Customers](docs/screenshots/customers.png)

**Revenue analytics.** Breakdowns by category, region, and channel.

![Revenue](docs/screenshots/revenue.png)

</details>

## What the models actually do

Two of them, both measured rather than asserted:

| Model | Task | Validation | Result |
|---|---|---|---|
| `GradientBoostingClassifier` | Churn risk per customer | Stratified holdout | **0.959 ROC AUC** |
| `Ridge` on engineered time features | Monthly revenue forecast | Chronological holdout | **3.58% MAPE**, against a 5.82% naive baseline |

Churn features are RFM plus tenure and engagement, and the label's cause is
stripped from the training frame so no model can read it back. The forecast
reports intervals derived from holdout RMSE scaled by the square root of the
horizon, not a flat percentage band. `/api/forecasting/model-performance`
returns those exact numbers, and `backend/tests/test_forecasting_api.py`
asserts the endpoint matches the trained model rather than deriving anything.

## Two conventions this codebase holds to

**Numbers are measured, never generated.** This application used to report model
accuracy, churn scores, and confidence intervals from `random.uniform()`. All of
it is now derived from trained models on a holdout, and several tests assert that
endpoint output matches the model exactly rather than approximately. Where a
figure cannot be derived, the API returns `null` and the interface renders an
honest blank instead of a plausible-looking constant.

**Time buckets follow one rule, defined once.** A period the window only partly
covers is not plotted, because a nine-day month sitting beside twelve complete
ones reads as a collapse rather than as a month that is not over. That rule lives
in `backend/app/periods.py` and every time-series endpoint calls it. It exists
because the same data once trended upward under a 90-day filter and fell off a
cliff under Year to Date, with bucket size the only difference.

## About the hosted demo

**This application runs against a live PostgreSQL database.** That is the real
mode, it is what `docker compose up` gives you, and every instruction below
describes it.

The **hosted demo is a static build of that same application.** No server, no
database, no cold start. `backend/scripts/snapshot.py` boots the real Flask app
against a real Postgres instance, trains the models, walks every endpoint the UI
calls under every date preset, and writes the responses to
`frontend/public/data/`. The React build then reads those files instead of the
network. One flag switches it:

```bash
# Live: talks to Flask and Postgres
npm run build

# Static: reads the pre-generated snapshot
python backend/scripts/snapshot.py    # regenerate the data
npm run build:static                  # build against it
```

To regenerate and publish the hosted demo in one step:

```bash
./scripts/refresh-demo.sh              # reseed, snapshot, test, build, deploy
./scripts/refresh-demo.sh --no-deploy  # everything except publishing
```

The coverage test runs before the deploy rather than after, so a snapshot that
misses an endpoint stops the release instead of becoming a blank chart in
production. The script pins its own database rather than reading an ambient
`DATABASE_URL`, because inheriting one would point a reseed at whatever project
exported it.

Two things worth being clear about:

- **Every number in the demo came out of the real pipeline.** The queries ran,
  the models were fit on a chronological holdout, and the metrics are measured.
  Nothing is hand-written, and the snapshot is a build artifact rather than a
  fixture kept up to date by hand.
- **The demo's clock is frozen** to the date the snapshot was taken, which the
  sidebar states. Date presets resolve against that date rather than today's,
  so "Last 90 days" means the same 90 days it meant at build time. Without this
  the presets would slide forward each day and ask for a window the snapshot
  does not contain.

The static path adds one module, `frontend/src/services/staticData.ts`, and one
branch in `fetchApi`. Every API function, hook, and component is identical
across the two modes, and the live build tree-shakes the static path out
entirely.

## Testing

```bash
cd backend && pytest -q             # 116 tests
cd frontend && npm test             # 184 tests
```

CI runs both suites plus lint, a type-checked build, and a gitleaks secrets
scan on every push.

The frontend suite includes a snapshot-coverage check that mounts every page
under every date preset and serves `fetch` from `frontend/public/data/`, so a
request the snapshot does not cover fails a test instead of producing a blank
chart in the demo. It skips itself when no snapshot has been generated.

## Features

### Executive Dashboard
- **KPI Cards** - Track key metrics including Total Revenue, Customers, Average Order Value, Conversion Rate, Pipeline Value, and Growth Rate
- **Revenue Trends** - Interactive area charts with configurable granularity (daily, weekly, monthly)
- **Category Distribution** - Donut charts showing revenue breakdown by product category
- **Sales Pipeline** - Funnel visualization with pipeline percentage per stage
- **Top Products** - Sortable table of best-performing products

### Revenue Analytics
- Detailed revenue breakdowns by category and region
- Period-over-period comparisons with change percentages
- Top products performance table
- Interactive bar and area charts with date range filtering

### Customer Intelligence
- **Segmentation** - Customer distribution across enterprise, mid-market, and SMB tiers
- **Cohort Retention** - 12-month retention analysis with heatmap visualization
- **At-Risk Customers** - Identify customers showing signs of potential churn
- **Lifetime Value Distribution** - LTV analysis across customer base

### Operations
- **Sales Pipeline** - Full funnel visualization from Lead to Closed Won
- **Sales Team Performance** - Quota attainment tracking (top 5 exceeding, bottom 5 developing)
- **Deal Cycle Time** - Average days per pipeline stage
- **Stage Conversion Rates** - Stage-to-stage conversion analysis

### Machine Learning

Two supervised models train on the application's own data at startup. Every
performance figure the API reports is measured on a holdout the model never
trained on, and the endpoint returns `available: false` rather than a number
when a model cannot be fit.

- **Revenue forecasting** — ridge regression on trend, cyclical seasonality,
  and two autoregressive lags. Validated on a *chronological* holdout, never a
  shuffled split. Reported alongside a last-value naive baseline, because that
  comparison is the only thing that says whether the model earns its keep.
  Confidence bounds come from holdout RMSE and widen with the square root of
  the horizon.
- **Churn classification** — gradient-boosted classifier over RFM features,
  tenure, refund rate, spend trend, and account attributes. Validated on a
  stratified holdout. Reports ROC AUC, average precision, precision, recall,
  F1, and Brier score, plus gain-based feature importance.
- **Seasonality analysis** — monthly index for planning.

Run `pytest tests/` in `backend/` to reproduce every number.

### Global Features
- **Date Range Filtering** - Preset ranges (Last 7 days, 30 days, 90 days, YTD, Last Year) or custom dates
- **Light/Dark Mode** - Toggle between themes (defaults to light mode)
- **Responsive Design** - Works on desktop and tablet screens

## Tech Stack

### Frontend
- **React 19** with TypeScript
- **Vite** for fast development and optimized builds
- **TailwindCSS 4** for utility-first styling
- **Recharts** for responsive data visualizations
- **TanStack Query** for server state management
- **React Router 7** for client-side routing
- **Lucide React** for icons

### Backend
- **Flask 3.0** REST API
- **SQLAlchemy** ORM with PostgreSQL
- **NumPy & Pandas** for data processing
- **scikit-learn** for the forecasting and churn models
- **Gunicorn** production server

### Infrastructure
- **Docker Compose** for local development
- **PostgreSQL 15** database

## Getting Started

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local frontend development)
- Python 3.11+ (for local backend development)

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/yourusername/analytics_dashboard.git
cd analytics_dashboard

# Start all services
docker-compose up -d

# Access the application at http://localhost:5001
```

### Local Development

#### Backend
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
cp .env.example .env
# Edit .env with your database credentials

# Run the development server (runs on http://localhost:5001)
python run.py
```

#### Frontend
```bash
cd frontend

# Install dependencies
npm install

# Start development server (runs on http://localhost:5173)
npm run dev

# Build for production (outputs to dist/, copied to backend/static/)
npm run build
```

#### Production Deployment
The Flask backend serves both the API and the built frontend static files. After building the frontend, copy the `dist/` contents to `backend/static/`:

```bash
# Build frontend and copy to backend
cd frontend && npm run build
cp -r dist/* ../backend/static/
```

## API Endpoints

All endpoints support `start_date` and `end_date` query parameters (YYYY-MM-DD format).

### Dashboard
- `GET /api/dashboard/summary` - Complete dashboard data (KPIs, trends, categories, pipeline)
- `GET /api/dashboard/kpis` - KPI values with change percentages

### Revenue
- `GET /api/revenue/trends` - Revenue time series (supports `granularity`: day/week/month)
- `GET /api/revenue/by-category` - Revenue breakdown by product category
- `GET /api/revenue/by-region` - Revenue breakdown by geographic region
- `GET /api/revenue/by-channel` - Revenue breakdown by sales channel
- `GET /api/revenue/top-products` - Top performing products (supports `limit`)

### Customers
- `GET /api/customers/overview` - Customer KPIs (total, new, churned, at-risk)
- `GET /api/customers/segments` - Customer segmentation distribution
- `GET /api/customers/cohorts` - 12-month cohort retention data
- `GET /api/customers/lifetime-value` - LTV distribution by range
- `GET /api/customers/acquisition` - Customer acquisition by channel over time
- `GET /api/customers/at-risk` - At-risk customer list (supports `limit`)

### Operations
- `GET /api/operations/pipeline` - Sales pipeline by stage
- `GET /api/operations/pipeline-kpis` - Pipeline KPIs (value, cycle time, win rate)
- `GET /api/operations/sales-performance` - Sales rep quota attainment
- `GET /api/operations/conversion-rates` - Stage-to-stage conversion rates
- `GET /api/operations/cycle-time` - Average days per pipeline stage
- `GET /api/operations/opportunities` - Pipeline opportunities (supports `stage`, `limit`)

### Forecasting
- `GET /api/forecasting/revenue` - Revenue forecast with confidence intervals
- `GET /api/forecasting/pipeline` - Weighted pipeline forecast
- `GET /api/forecasting/churn-risk` - At-risk customers with recommendations
- `GET /api/forecasting/seasonality` - Monthly seasonality indices
- `GET /api/forecasting/kpis` - Forecasting KPIs (predicted revenue, accuracy)
- `GET /api/forecasting/model-performance` - ML model accuracy metrics
- `GET /api/forecasting/revenue-at-risk` - Revenue at risk by category

## Project Structure

```
analytics_dashboard/
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── cards/        # KPI and chart card wrappers
│   │   │   ├── charts/       # Chart components (Area, Bar, Pie, Funnel)
│   │   │   ├── common/       # Shared components (ErrorBoundary, Loading)
│   │   │   ├── layout/       # Layout components (Header, Sidebar, Layout)
│   │   │   └── tables/       # Data table components
│   │   ├── hooks/            # Custom React hooks (useApi, useFilters)
│   │   ├── pages/            # Page components (Dashboard, Revenue, etc.)
│   │   ├── services/         # API client layer
│   │   ├── types/            # TypeScript type definitions
│   │   └── utils/            # Utilities (formatters, export)
│   ├── package.json
│   └── vite.config.ts
├── backend/                  # Flask backend API
│   ├── app/
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── routes/           # API route handlers by domain
│   │   ├── __init__.py       # Application factory
│   │   └── config.py         # Environment configurations
│   ├── data/
│   │   └── seed_data.py      # Synthetic data generator
│   ├── static/               # Built frontend assets (production)
│   ├── requirements.txt
│   └── run.py                # Application entry point
├── docker-compose.yml
├── Dockerfile
└── README.md
```

## Environment Variables

### Backend
| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `SECRET_KEY` | Flask secret key for sessions | Required |
| `FLASK_ENV` | Environment mode | `development` |

### Frontend
| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `/api` (relative) |

## Database Schema

The application uses 6 main tables:

- **products** - Product catalog (name, category, pricing)
- **customers** - Customer accounts (segment, LTV, status, acquisition)
- **sales_reps** - Sales team (name, team, region, quota)
- **transactions** - Completed orders linking customers, products, and reps
- **pipeline** - Active sales opportunities with stage tracking
- **daily_metrics** - Pre-aggregated daily metrics (optional)

## License

This project is open source and available under the [MIT License](LICENSE).

