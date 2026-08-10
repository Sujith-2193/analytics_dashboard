"""Feature engineering tests.

These matter more than they look. If a feature is silently wrong the models
still train and still report metrics, so a bad feature produces a confident
answer rather than an error.
"""

from __future__ import annotations

import pandas as pd

from app.ml.features import CATEGORICAL_FEATURES, NUMERIC_FEATURES


class TestCustomerFrame:
    def test_one_row_per_customer(self, customers_frame, ctx):
        from app.models import Customer
        from app import db

        assert len(customers_frame) == db.session.query(Customer).count()
        assert customers_frame["customer_id"].is_unique

    def test_all_model_features_present_and_numeric(self, customers_frame):
        for col in NUMERIC_FEATURES:
            assert col in customers_frame.columns, f"missing {col}"
            assert pd.api.types.is_numeric_dtype(customers_frame[col]), f"{col} not numeric"
        for col in CATEGORICAL_FEATURES:
            assert col in customers_frame.columns, f"missing {col}"

    def test_no_nulls_in_features(self, customers_frame):
        """A null reaching the pipeline becomes a silent imputation downstream."""
        subset = customers_frame[NUMERIC_FEATURES + CATEGORICAL_FEATURES]
        assert not subset.isnull().any().any(), subset.isnull().sum()[lambda s: s > 0]

    def test_label_is_binary_and_not_degenerate(self, customers_frame):
        assert set(customers_frame["churned"].unique()) <= {0, 1}
        rate = customers_frame["churned"].mean()
        assert 0.02 < rate < 0.6, f"implausible churn base rate {rate}"

    def test_at_risk_is_not_folded_into_the_positive_class(self, customers_frame):
        """'at-risk' is a business flag, not an outcome. Treating it as churn
        would leak an opinion into the label."""
        at_risk = customers_frame[customers_frame["status"] == "at-risk"]
        assert len(at_risk) > 0
        assert (at_risk["churned"] == 0).all()

    def test_recency_is_non_negative(self, customers_frame):
        assert (customers_frame["recency_days"] >= 0).all()

    def test_rates_are_bounded(self, customers_frame):
        assert customers_frame["refund_rate"].between(0, 1).all()
        assert (customers_frame["spend_trend"] >= 0).all()

    def test_churned_customers_are_less_recent(self, customers_frame):
        """The core signal. If this inverts, the generator or the join broke."""
        churned = customers_frame[customers_frame["churned"] == 1]["recency_days"].median()
        retained = customers_frame[customers_frame["churned"] == 0]["recency_days"].median()
        assert churned > retained * 2, f"churned={churned} retained={retained}"

    def test_latent_generator_fields_are_not_persisted(self, customers_frame):
        """`engagement` and `churn_date` drive the label. If either reached the
        model it would be reading the answer."""
        assert "engagement" not in customers_frame.columns
        assert "churn_date" not in customers_frame.columns


class TestMonthlyRevenue:
    def test_returns_ordered_periods(self, revenue_frame):
        periods = list(revenue_frame["period"])
        assert periods == sorted(periods)
        assert len(periods) == len(set(periods))

    def test_revenue_is_positive(self, revenue_frame):
        assert (revenue_frame["revenue"] > 0).all()

    def test_partial_months_are_excluded_at_both_ends(self, revenue_frame, ctx):
        """A half month reads as a demand collapse and wrecks the trend fit.
        The opening month used to come through at roughly an eighth of normal.

        This asserts the property directly rather than through a magnitude
        heuristic. It previously required the first bucket to exceed 40% of the
        series median, which conflates "partial" with "small": the seeded window
        spans two years of growth, so the earliest complete month is legitimately
        well under the median. That test sat about 4% from failing and flipped on
        a one-day shift in the seed window, which is what a UTC runner produces
        against a Pacific developer machine.
        """
        from app import db
        from app.models import Transaction

        first_txn, last_txn = (
            db.session.query(
                db.func.min(Transaction.transaction_date),
                db.func.max(Transaction.transaction_date),
            )
            .filter(Transaction.status == "completed")
            .one()
        )

        periods = list(revenue_frame["period"])
        assert len(periods) >= 12

        # A retained bucket must be one the data covers end to end.
        assert periods[0].start_time.date() >= first_txn, (
            f"first bucket {periods[0]} starts before the data does ({first_txn})"
        )
        assert periods[-1].end_time.date() <= last_txn, (
            f"last bucket {periods[-1]} runs past the data ({last_txn})"
        )

    def test_a_partial_edge_month_is_actually_dropped(self, revenue_frame, ctx):
        """The guard above passes trivially if nothing was ever dropped, so pin
        that the boundary months are absent when the window starts or ends
        mid-month."""
        from app import db
        from app.models import Transaction

        first_txn, last_txn = (
            db.session.query(
                db.func.min(Transaction.transaction_date),
                db.func.max(Transaction.transaction_date),
            )
            .filter(Transaction.status == "completed")
            .one()
        )
        periods = set(revenue_frame["period"].astype(str))

        if first_txn.day != 1:
            assert pd.Period(first_txn, freq="M").strftime("%Y-%m") not in periods
        if last_txn != (pd.Period(last_txn, freq="M").end_time.date()):
            assert pd.Period(last_txn, freq="M").strftime("%Y-%m") not in periods
