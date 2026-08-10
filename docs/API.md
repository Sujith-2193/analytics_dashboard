# API Reference

All endpoints are **HTTP GET**, return **JSON**, and require **no authentication**.
CORS is open for `/api/*`. The base path is `/api`. In production the API is
same-origin with the frontend; in development the Vite server proxies `/api` to
Flask on port 5001.

## Conventions

- `start_date` and `end_date` are `YYYY-MM-DD`. Defaults are computed
  server-side from the current date and differ per endpoint, noted below.
- Revenue aggregations count only `Transaction.status == 'completed'`.
- Response fields are **camelCase**, converted from snake_case columns.
- **Every figure is derived from stored rows or from a trained model.** Where a
  value cannot be computed, the field is `null` rather than estimated. A null
  `*Change` field means there is no prior period to compare against, not that
  the change is zero.
- **Time-bucketed series omit a trailing period the window only partly covers.**
  See `app/periods.py`. A part-month plotted beside complete months reads as a
  collapse, so it is dropped rather than shown.

---

## Utility

### `GET /api/health`

Liveness plus data readiness. Reports row counts and the age of the newest
transaction, because every endpoint degrades gracefully on an empty database
and returns 200 with empty results, which is correct but indistinguishable from
a broken deployment when you are looking at a blank dashboard.

```json
{
  "status": "healthy",
  "environment": "development",
  "data": {
    "seeded": true,
    "counts": { "customers": 0, "transactions": 0, "pipeline": 0 },
    "latestTransaction": "YYYY-MM-DD",
    "ageInDays": 0
  }
}
```

`status` is `"degraded"` with a `hint` field when the database is empty or the
tables are missing.

> There is no seeding endpoint. Seeding is destructive and belongs at the
> command line: `python reseed.py`. It was previously exposed as an
> unauthenticated `GET /api/seed-database`, which meant anyone who found the URL
> could wipe and regenerate the dataset.

---

## Dashboard — `/api/dashboard`

### `GET /api/dashboard/summary`

Params: `start_date` (default 30d), `end_date` (default today). Current period
against the preceding period of equal length.

```json
{
  "kpis": {
    "totalRevenue":   { "value": 0, "previousValue": 0, "change": 0, "changePercent": 0 },
    "totalCustomers": { "value": 0, "previousValue": 0, "change": 0, "changePercent": 0 },
    "avgOrderValue":  { "value": 0, "changePercent": 0 },
    "pipelineValue":  { "value": 0, "changePercent": 0 }
  },
  "dateRange": { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }
}
```

### `GET /api/dashboard/kpis`

Calls the same handler as `/summary`. Identical params and response.

---

## Revenue — `/api/revenue`

### `GET /api/revenue/trends`

Params: `start_date` (default 365d), `end_date`, `granularity` = `day` | `week`
| `month` (default `day`). Under `week` and `month` an incomplete trailing
bucket is dropped.

```json
[ { "date": "YYYY-MM-DD", "revenue": 0, "orders": 0 } ]
```

### `GET /api/revenue/by-category`

Params: `start_date` (30d), `end_date`. Descending by revenue.

```json
[ { "category": "Enterprise Software", "value": 0, "percentage": 0 } ]
```

### `GET /api/revenue/by-region`

Params: `start_date` (30d), `end_date`. `growth` is `null` when no prior period
is available.

```json
[ { "region": "North America", "revenue": 0, "customers": 0, "growth": null } ]
```

### `GET /api/revenue/by-channel`

Params: `start_date` (30d), `end_date`.

```json
[ { "channel": "Direct Sales", "value": 0, "percentage": 0 } ]
```

### `GET /api/revenue/top-products`

Params: `start_date` (30d), `end_date`, `limit` (default 10).

```json
[ { "id": 0, "name": "", "category": "", "revenue": 0, "unitsSold": 0, "avgPrice": 0, "growth": null } ]
```

---

## Customers — `/api/customers`

### `GET /api/customers/overview`

Params: `start_date` (30d), `end_date`. `churnedChange` and `atRiskChange` are
`null` because neither is observable for a prior period from a point-in-time
status column. `churnedScope` states what the churn count covers.

```json
{
  "total": 0, "totalChange": 0,
  "new": 0, "newChange": 0,
  "churned": 0, "churnedChange": null, "churnedScope": "",
  "atRisk": 0, "atRiskChange": null
}
```

### `GET /api/customers/segments`

Params: `start_date` (30d), `end_date`.

```json
[ { "segment": "enterprise", "count": 0, "revenue": 0, "percentage": 0 } ]
```

### `GET /api/customers/cohorts`

Params: `start_date` (default 365d), `end_date`. Monthly acquisition cohorts
with retention per month offset. A month the cohort has not yet reached is
`null`, never zero.

```json
[ { "cohort": "YYYY-MM", "cohortSize": 0, "month0": 100, "month1": 0, "month2": null } ]
```

### `GET /api/customers/lifetime-value`

Params: `start_date`, `end_date`. Distribution across LTV bands.

```json
[ { "range": "$0-10k", "count": 0, "percentage": 0 } ]
```

### `GET /api/customers/acquisition`

Params: `start_date` (default 365d), `end_date`. New customers per month by
channel.

```json
[ { "date": "YYYY-MM-DD", "channel": "", "count": 0 } ]
```

### `GET /api/customers/at-risk`

Params: `limit` (default 10), `start_date`, `end_date`. Shares the churn model
with `/api/forecasting/churn-risk`, so the two never disagree.

```json
[ { "id": 0, "name": "", "company": "", "segment": "", "lifetimeValue": 0,
    "riskScore": 0.0, "daysSinceActivity": 0, "recommendation": "" } ]
```

---

## Operations — `/api/operations`

### `GET /api/operations/pipeline`

Params: `start_date` (30d), `end_date`. Funnel by stage. `conversionRate` is
`null` for the first stage, which has nothing to convert from.

```json
[ { "stage": "Lead", "count": 0, "value": 0, "conversionRate": null } ]
```

### `GET /api/operations/pipeline-kpis`

Params: `start_date` (30d), `end_date`. The `*Change` fields are `null`:
pipeline rows carry current state rather than history, so a prior-period value
cannot be reconstructed.

```json
{
  "pipelineValue": 0, "pipelineChange": null,
  "avgCycleTime": null, "cycleTimeChange": null,
  "winRate": 0, "winRateChange": null,
  "avgDealSize": 0, "dealSizeChange": null
}
```

### `GET /api/operations/sales-performance`

Params: `start_date` (30d), `end_date`. `attainment` is `achieved / quota`,
computed rather than shaped: this endpoint previously overwrote real per-rep
revenue with a manufactured 145-to-61 distribution.

```json
[ { "id": 0, "name": "", "team": "", "region": "", "quota": 0, "achieved": 0,
    "attainment": 0, "deals": 0 } ]
```

### `GET /api/operations/conversion-rates`

No params. Stage-to-stage conversion across the whole pipeline.

```json
[ { "fromStage": "", "toStage": "", "rate": 0 } ]
```

### `GET /api/operations/cycle-time`

Params: `start_date` only. Average days per stage, with the sample size behind
each average.

```json
[ { "stage": "", "avgDays": 0, "count": 0 } ]
```

### `GET /api/operations/opportunities`

Params: `stage` (optional), `limit` (default 20).

```json
[ { "id": 0, "opportunityName": "", "customerId": 0, "customerName": "",
    "amount": 0, "probability": 0, "expectedCloseDate": "YYYY-MM-DD", "salesRepId": 0 } ]
```

### `GET /api/operations/deal-size-distribution`

Params: `start_date` (default 365d), `end_date`.

```json
[ { "bucket": "", "count": 0, "value": 0 } ]
```

---

## Forecasting — `/api/forecasting`

Backed by two models trained on the application's own data. Every figure below
is measured on a holdout the model never trained on. When a model cannot be fit,
endpoints report `available: false` rather than returning a number.

### `GET /api/forecasting/revenue`

Params: `periods` (default 6, clamped to 1–24), `start_date`, `end_date`.
Returns history followed by the forecast. The last actual month also carries a
`predicted` value equal to its actual, so the dashed forecast line begins
exactly where the solid history line ends. That join point has no interval,
because it is a measurement rather than a prediction.

```json
[ { "date": "YYYY-MM-01", "actual": 0, "predicted": null, "lowerBound": null, "upperBound": null } ]
```

Bounds derive from holdout RMSE scaled by the square root of the horizon, so
they widen with distance. `lowerBound` is never negative.

### `GET /api/forecasting/pipeline`

Params: `start_date`, `end_date`. Probability-weighted pipeline by month.

```json
[ { "month": "", "weighted": 0, "best": 0, "worst": 0 } ]
```

### `GET /api/forecasting/churn-risk`

Params: `limit` (default 10), `start_date`, `end_date`. Model probabilities,
descending. Already-churned accounts are excluded. `daysSinceActivity` is the
real recency from the feature frame.

```json
[ { "id": 0, "name": "", "company": "", "segment": "", "lifetimeValue": 0,
    "riskScore": 0.0, "daysSinceActivity": 0, "recommendation": "" } ]
```

### `GET /api/forecasting/kpis`

Params: `start_date`, `end_date`.

```json
{ "predictedRevenue": 0, "predictedChange": 0, "atRiskCount": 0,
  "atRiskChange": null, "modelAccuracy": 0, "accuracyChange": null,
  "forecastPeriod": 6 }
```

### `GET /api/forecasting/seasonality`

Params: `start_date`, `end_date`. Monthly index against the series mean.

```json
[ { "month": "Jan", "index": 1.0, "trend": 0 } ]
```

### `GET /api/forecasting/model-performance`

Ignores date filters: model performance is a property of the fit, not of the
window being viewed. It used to be varied by filter for appearances.

```json
{
  "available": true,
  "accuracy": 0, "mape": 0, "r2Score": 0, "rmse": 0, "dataPoints": "21 mo",
  "revenue": {
    "model": "Ridge regression on trend, seasonality, and 2 lags",
    "validation": "chronological holdout",
    "mape": 0, "naiveMape": 0, "seasonalNaiveMape": 0, "improvementOverNaive": 0,
    "rmse": 0, "mae": 0, "r2Score": 0, "trainMonths": 0, "holdoutMonths": 0
  },
  "churn": {
    "model": "Gradient-boosted classifier on RFM and account features",
    "validation": "stratified holdout",
    "rocAuc": 0, "accuracy": 0, "precision": 0, "recall": 0, "f1": 0,
    "averagePrecision": 0, "brierScore": 0, "baseRate": 0,
    "trainRows": 0, "holdoutRows": 0, "topFeatures": {}
  }
}
```

Note that `r2Score` is negative for the revenue model. That is honest and worth
understanding: R² measures against the holdout's own mean, and across a short,
nearly flat holdout window that mean is hard to beat even when absolute error is
small. MAPE against the naive baseline is the comparison that says whether the
model earns its keep.

### `GET /api/forecasting/revenue-at-risk`

Params: `start_date`, `end_date`. Lifetime value bucketed by churn probability.
Buckets sum to the totals.

```json
{
  "highRisk":   { "value": 0, "customers": 0, "label": "", "threshold": "" },
  "mediumRisk": { "value": 0, "customers": 0, "label": "", "threshold": "" },
  "lowRisk":    { "value": 0, "customers": 0, "label": "", "threshold": "" },
  "total": 0, "totalCustomers": 0
}
```
