"""Feature engineering for the dashboard's models.

Everything here reads from the same tables the API serves, so a metric shown on
a chart and a feature fed to a model come from one source. Nothing is
fabricated and nothing is sampled.

Two feature sets live here:

- `customer_frame` builds an RFM-style table for churn classification. Recency,
  frequency, and monetary value are computed from transaction history; tenure
  and categorical attributes come from the customer record.
- `monthly_revenue` builds the completed-revenue series the forecaster trains
  on.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd
from sqlalchemy import func

from app import db
from app.models import Customer, Transaction

# Columns the churn model consumes. Kept here so the trainer, the scorer, and
# the tests all agree on one list.
NUMERIC_FEATURES = [
    "recency_days",
    "frequency",
    "monetary_total",
    "monetary_avg",
    "tenure_days",
    "refund_rate",
    "spend_trend",
    "active_months",
]
CATEGORICAL_FEATURES = ["segment", "industry", "region", "acquisition_channel"]


def _as_of_date(as_of: date | None) -> date:
    if as_of is not None:
        return as_of
    latest = db.session.query(func.max(Transaction.transaction_date)).scalar()
    return latest or date.today()


def customer_frame(as_of: date | None = None) -> pd.DataFrame:
    """One row per customer, with behavioural features and a churn label.

    `as_of` fixes the observation date so recency is reproducible. It defaults
    to the most recent transaction in the database rather than today, which
    keeps results stable when the data is not being reseeded.
    """
    as_of = _as_of_date(as_of)
    window_start = as_of - timedelta(days=90)

    # Aggregate transaction behaviour per customer in one pass.
    agg = (
        db.session.query(
            Transaction.customer_id.label("customer_id"),
            func.max(Transaction.transaction_date).label("last_txn"),
            func.count(Transaction.id).label("txn_count"),
            func.sum(Transaction.amount).label("total_amount"),
            func.avg(Transaction.amount).label("avg_amount"),
            func.count(func.distinct(func.strftime("%Y-%m", Transaction.transaction_date)))
            if db.engine.dialect.name == "sqlite"
            else func.count(func.distinct(func.date_trunc("month", Transaction.transaction_date))),
        )
        .filter(Transaction.status != "pending")
        .group_by(Transaction.customer_id)
        .all()
    )
    agg_df = pd.DataFrame(
        agg,
        columns=[
            "customer_id",
            "last_txn",
            "frequency",
            "monetary_total",
            "monetary_avg",
            "active_months",
        ],
    )

    refunds = (
        db.session.query(
            Transaction.customer_id.label("customer_id"),
            func.count(Transaction.id).label("refunds"),
        )
        .filter(Transaction.status == "refunded")
        .group_by(Transaction.customer_id)
        .all()
    )
    refund_df = pd.DataFrame(refunds, columns=["customer_id", "refunds"])

    recent = (
        db.session.query(
            Transaction.customer_id.label("customer_id"),
            func.sum(Transaction.amount).label("recent_amount"),
        )
        .filter(
            Transaction.status == "completed",
            Transaction.transaction_date >= window_start,
        )
        .group_by(Transaction.customer_id)
        .all()
    )
    recent_df = pd.DataFrame(recent, columns=["customer_id", "recent_amount"])

    customers = db.session.query(
        Customer.id,
        Customer.segment,
        Customer.industry,
        Customer.region,
        Customer.acquisition_channel,
        Customer.acquisition_date,
        Customer.status,
    ).all()
    df = pd.DataFrame(
        customers,
        columns=[
            "customer_id",
            "segment",
            "industry",
            "region",
            "acquisition_channel",
            "acquisition_date",
            "status",
        ],
    )

    df = df.merge(agg_df, on="customer_id", how="left")
    df = df.merge(refund_df, on="customer_id", how="left")
    df = df.merge(recent_df, on="customer_id", how="left")

    for col in ("frequency", "monetary_total", "monetary_avg", "active_months", "refunds", "recent_amount"):
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    # Recency: days since the last transaction. Customers who never transacted
    # get the full window rather than a null, which is the honest reading.
    df["last_txn"] = pd.to_datetime(df["last_txn"], errors="coerce")
    as_of_ts = pd.Timestamp(as_of)
    df["recency_days"] = (as_of_ts - df["last_txn"]).dt.days
    df["recency_days"] = df["recency_days"].fillna(730).clip(lower=0)

    df["acquisition_date"] = pd.to_datetime(df["acquisition_date"], errors="coerce")
    df["tenure_days"] = (as_of_ts - df["acquisition_date"]).dt.days.fillna(0).clip(lower=0)

    df["refund_rate"] = np.where(df["frequency"] > 0, df["refunds"] / df["frequency"], 0.0)

    # Share of lifetime spend that landed in the last 90 days. A decaying
    # account trends toward zero without having stopped outright.
    df["spend_trend"] = np.where(
        df["monetary_total"] > 0, df["recent_amount"] / df["monetary_total"], 0.0
    )

    for col in CATEGORICAL_FEATURES:
        df[col] = df[col].fillna("unknown").astype(str)

    # Binary target. 'at-risk' is deliberately grouped with retained accounts:
    # it is a business flag, not an outcome, and folding it into the positive
    # class would leak an opinion into the label.
    df["churned"] = (df["status"] == "churned").astype(int)

    return df


def monthly_revenue() -> pd.DataFrame:
    """Completed revenue per calendar month, oldest first.

    The final month is dropped when it is partial, because a half-finished
    month reads as a collapse in demand and would poison both the fit and the
    error metrics.
    """
    rows = (
        db.session.query(Transaction.transaction_date, Transaction.amount)
        .filter(Transaction.status == "completed")
        .all()
    )
    if not rows:
        return pd.DataFrame(columns=["period", "revenue"])

    df = pd.DataFrame(rows, columns=["transaction_date", "amount"])
    df["transaction_date"] = pd.to_datetime(df["transaction_date"])
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    df["period"] = df["transaction_date"].dt.to_period("M")

    grouped = df.groupby("period", as_index=False)["amount"].sum()
    grouped = grouped.rename(columns={"amount": "revenue"}).sort_values("period")

    # Drop partial months at *both* ends. The window rarely starts or ends on a
    # month boundary, and a half-month of revenue reads as a collapse in demand.
    # Leaving the first one in was skewing the trend badly: the opening month
    # came through at roughly an eighth of a normal month.
    first_txn = df["transaction_date"].min()
    first_period = first_txn.to_period("M")
    if first_txn.date() > first_period.start_time.date():
        grouped = grouped[grouped["period"] != first_period]

    last_txn = df["transaction_date"].max()
    last_period = last_txn.to_period("M")
    if last_txn.date() < last_period.end_time.date():
        grouped = grouped[grouped["period"] != last_period]

    return grouped.reset_index(drop=True)
