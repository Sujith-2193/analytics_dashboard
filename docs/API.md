# API Reference

All endpoints are **HTTP GET**, return **JSON**, and require **no authentication**. CORS is open for `/api/*` (`origins: "*"`). Base path is `/api`. In production the API is same-origin with the frontend; in dev the Vite server proxies `/api` to the Flask app.

Conventions:
- `start_date` / `end_date` are `YYYY-MM-DD`. Defaults differ per endpoint (noted below); when a default is "30d" it means `today − 30 days` to `today`, computed server-side from the current date.
- Only `Transaction.status == 'completed'` rows are counted in revenue aggregations unless stated otherwise.
- Many fields are generated with date-seeded randomness (see `ARCHITECTURE.md`); response *shapes* below are exact, response *values* are partly synthetic.
- Field names in responses are **camelCase** (converted from snake_case DB columns).

---

## Utility (registered in the app factory)

### `GET /api/health`
No params. Does **not** touch the database.
```json
{ "status": "healthy", "environment": "development" }
```

### `GET /api/seed-database`
No params. **Destructive and unauthenticated** — truncates and regenerates all tables. On success `{ "status": "success", "message": "Database seeded successfully" }`; on error returns HTTP 500 with `{ "status": "error", "message": "...", "trace": "..." }`. Marked "remove after seeding" in the code.

---

## Dashboard — `/api/dashboard`

### `GET /api/dashboard/summary`
Params: `start_date` (default 30d), `end_date` (default today). Computes current-vs-previous-period KPIs; pipeline value comes from the shared `get_pipeline_metrics` helper. Change percentages are forced non-zero (curated random bands).
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
Identical to `/summary` (it calls the same handler). Same params and response.

---

## Revenue — `/api/revenue`

### `GET /api/revenue/trends`
Params: `start_date` (default **365d**), `end_date` (default today), `granularity` = `day` | `week` | `month` (default `day`). Aggregates completed-transaction revenue and order count per period.
```json
[ { "date": "YYYY-MM-DD", "revenue": 0, "orders": 0 } ]
```

### `GET /api/revenue/by-category`
Params: `start_date` (30d), `end_date`. Revenue grouped by product category, descending.
```json
[ { "category": "Enterprise Software", "value": 0, "percentage": 0 } ]
```

### `GET /api/revenue/by-region`
Params: `start_date` (30d), `end_date`. `growth` is hard-coded to `0` (no historical comparison implemented).
```json
[ { "region": "North America", "revenue": 0, "customers": 0, "growth": 0 } ]
```

### `GET /api/revenue/by-channel`
Params: `start_date` (30d), `end_date`. Grouped by `channel` (`direct` | `online` | `partner`).
```json
[ { "channel": "direct", "value": 0, "percentage": 0 } ]
```

### `GET /api/revenue/top-products`
Params: `start_date` (30d), `end_date`, `limit` (default 10). `growth` is hard-coded `0`; `avgPrice` = revenue / units.
```json
[ { "id": 1, "name": "…", "category": "…", "revenue": 0, "unitsSold": 0, "growth": 0, "avgPrice": 0 } ]
```

---

## Customers — `/api/customers`

### `GET /api/customers/overview`
Params: `start_date` (30d), `end_date`. `churned` is estimated by scaling total churned customers across a 2-year window. All `*Change` fields are curated random percentages (`atRiskChange` is intentionally slightly negative). At-risk count comes from the shared `get_at_risk_customers_with_scores` helper.
```json
{
  "total": 0, "totalChange": 0,
  "new": 0, "newChange": 0,
  "churned": 0, "churnedChange": 0,
  "atRisk": 0, "atRiskChange": 0
}
```

### `GET /api/customers/segments`
Params: `start_date` (30d), `end_date`. Customers with completed transactions in the period, grouped by segment.
```json
[ { "segment": "enterprise", "count": 0, "revenue": 0, "percentage": 0 } ]
```

### `GET /api/customers/cohorts`
Params: `start_date` (default **365d**), `end_date`. Up to 12 acquisition-month cohorts. Retention months 1–11 are generated from a base decay curve plus per-cohort jitter; `month0` is always 100.
```json
[ { "cohort": "Jan 2026", "month0": 100, "month1": 92, "…": 0, "month11": 72 } ]
```

### `GET /api/customers/lifetime-value`
Params: `start_date`, `end_date` (both optional; filter on `acquisition_date`). Fixed LTV buckets.
```json
[ { "range": "$0 - $1K", "count": 0, "percentage": 0 } ]
```
Buckets: `$0 - $1K`, `$1K - $5K`, `$5K - $10K`, `$10K - $50K`, `$50K - $100K`, `$100K+`.

### `GET /api/customers/acquisition`
Params: `start_date` (default **365d**), `end_date`. Granularity auto-selected by range (≤31d daily, ≤92d weekly, else monthly). Grouped by acquisition channel.
```json
[ { "date": "YYYY-MM-DD", "channel": "Referral", "count": 0 } ]
```

### `GET /api/customers/at-risk`
Params: `limit` (default 10), `start_date`, `end_date` (optional). Customers with `status = 'at-risk'`, ordered by LTV desc, with generated risk scores.
```json
[ {
  "id": 1, "name": "…", "company": "…", "segment": "enterprise",
  "lifetimeValue": 0, "riskScore": 0.72, "daysSinceActivity": 34,
  "recommendation": "Executive outreach"
} ]
```
`recommendation` is `"Executive outreach"` when `riskScore > 0.75`, else `"Success check-in"`.

---

## Operations — `/api/operations`

### `GET /api/operations/pipeline`
Params: `start_date` (30d), `end_date`. Funnel by stage (`lead` → `qualified` → `proposal` → `negotiation` → `closed-won`). Counts/values are the stored per-stage sums scaled by a period- and date-seeded factor. `conversionRate` is stage-over-previous-stage.
```json
[ { "stage": "Lead", "value": 0, "count": 0, "conversionRate": 100 } ]
```

### `GET /api/operations/pipeline-kpis`
Params: `start_date`, `end_date`. `pipelineValue`/`winRate`/`avgDealSize` from the shared `get_pipeline_metrics` helper; `avgCycleTime` (~42 days) and all `*Change` fields are generated.
```json
{
  "pipelineValue": 0, "pipelineChange": 0,
  "avgCycleTime": 42, "cycleTimeChange": 0,
  "winRate": 0, "winRateChange": 0,
  "avgDealSize": 0, "dealSizeChange": 0
}
```

### `GET /api/operations/sales-performance`
Params: `start_date` (30d), `end_date`. Real per-rep achieved revenue is computed, then `attainment` is **overwritten** with a curated distribution (top 6 exceed quota, middle 6 near quota, rest below) and `achieved` is back-calculated to match. Returns up to 20 reps, sorted by attainment desc.
```json
[ { "id": 1, "name": "…", "team": "Enterprise", "region": "Europe",
    "quota": 0, "achieved": 0, "deals": 0, "attainment": 132.4 } ]
```

### `GET /api/operations/conversion-rates`
No params. Stage-to-stage conversion from stored pipeline counts.
```json
[ { "fromStage": "Lead → Qualified", "rate": 0 } ]
```
> Note: the response contains `fromStage` (an arrow label) and `rate` only. The frontend TS type also declares `toStage`, which this endpoint does not send.

### `GET /api/operations/cycle-time`
Params: `start_date` (used only to seed randomness). Returns generated average days for four transitions.
```json
[ { "stage": "Lead to Qualified", "avgDays": 8 } ]
```

### `GET /api/operations/opportunities`
Params: `stage` (optional filter), `limit` (default 20). Real pipeline rows via `Pipeline.to_dict()`, ordered by amount desc.
```json
[ {
  "id": 1, "opportunityName": "…", "customerId": 1, "customerName": "…",
  "salesRepId": 1, "salesRepName": "…", "stage": "proposal",
  "amount": 0, "probability": 55, "expectedCloseDate": "YYYY-MM-DD"
} ]
```

### `GET /api/operations/deal-size-distribution`
Params: `start_date` (default **365d**), `end_date`. Completed transactions bucketed by amount. (Not listed in the README.)
```json
[ { "bucket": "$0-10K", "count": 0, "value": 0 } ]
```
Buckets: `$0-10K`, `$10-25K`, `$25-50K`, `$50-100K`, `$100-250K`, `$250K+`.

---

## Forecasting — `/api/forecasting`

### `GET /api/forecasting/revenue`
Params: `periods` (default 6), `start_date`, `end_date` (optional). Fits a degree-1 trend (`numpy.polyfit`) to historical monthly revenue, emits the last ~5 actual months then `periods` forecast months (dated to the 1st). Returns `[]` if fewer than 3 months of history exist. On actual months `predicted`/bounds are `null`; on forecast months `actual` is `null` (except the bridge point).
```json
[ { "date": "YYYY-MM-DD", "actual": 0, "predicted": null, "lowerBound": null, "upperBound": null } ]
```

### `GET /api/forecasting/pipeline`
Params: `start_date`, `end_date` (optional). Open pipeline weighted by probability, grouped by expected-close month (next 6 months).
```json
[ { "month": "Jul 2026", "weighted": 0, "best": 0, "worst": 0 } ]
```

### `GET /api/forecasting/churn-risk`
Params: `limit` (default 10), `start_date`, `end_date`. Same shape and helper as `/customers/at-risk`.
```json
[ { "id": 1, "name": "…", "company": "…", "segment": "…",
    "lifetimeValue": 0, "riskScore": 0.72, "daysSinceActivity": 34,
    "recommendation": "Executive outreach" } ]
```

### `GET /api/forecasting/kpis`
Params: `start_date`, `end_date`. `predictedRevenue` and change fields are generated; `atRiskCount` and `modelAccuracy` come from shared helpers.
```json
{
  "predictedRevenue": 0, "predictedChange": 0,
  "atRiskCount": 0, "atRiskChange": 0,
  "modelAccuracy": 0, "accuracyChange": 0,
  "forecastPeriod": 6
}
```

### `GET /api/forecasting/seasonality`
Params: `start_date`, `end_date`. Monthly seasonality index = month avg / overall avg, with jitter. Returns `[]` if there is no data.
```json
[ { "month": "Jan", "index": 1.0, "trend": 0.01 } ]
```

### `GET /api/forecasting/model-performance`
Params: `start_date`, `end_date`. **Entirely generated** — there is no trained model. Values come from `get_model_metrics`.
```json
{ "accuracy": 93.5, "mape": 5.2, "r2Score": 0.94, "rmse": 32000,
  "dataPoints": "24 mo", "lastUpdate": "Dec 20", "confidence": 95 }
```

### `GET /api/forecasting/revenue-at-risk`
Params: `start_date`, `end_date`. At-risk customers categorized into high/medium/low by risk score (shared helper).
```json
{
  "highRisk":   { "value": 0, "customers": 0, "label": "High Risk",   "threshold": "65%+ risk" },
  "mediumRisk": { "value": 0, "customers": 0, "label": "Medium Risk", "threshold": "50-65% risk" },
  "lowRisk":    { "value": 0, "customers": 0, "label": "Low Risk",    "threshold": "<50% risk" },
  "total": 0,
  "totalCustomers": 0
}
```
