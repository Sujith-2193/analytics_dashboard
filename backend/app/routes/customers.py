from flask import Blueprint, request
from sqlalchemy import func, extract
from datetime import datetime, timedelta
from app import db
from app.periods import drop_incomplete_tail, granularity_for
from app.models import Customer, Transaction
from app.routes.forecasting import get_at_risk_customers_with_scores

bp = Blueprint('customers', __name__, url_prefix='/api/customers')


@bp.route('/overview')
def get_overview():
    """Get customer overview metrics."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if not start_date:
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    start = datetime.strptime(start_date, '%Y-%m-%d').date()
    end = datetime.strptime(end_date, '%Y-%m-%d').date()

    # Calculate previous period
    period_days = (end - start).days
    prev_start = start - timedelta(days=period_days)
    prev_end = start - timedelta(days=1)

    # Current period - customers who had transactions in this period
    current_active = db.session.query(
        func.count(func.distinct(Transaction.customer_id))
    ).filter(
        Transaction.transaction_date.between(start, end)
    ).scalar() or 0

    # Previous period active customers
    prev_active = db.session.query(
        func.count(func.distinct(Transaction.customer_id))
    ).filter(
        Transaction.transaction_date.between(prev_start, prev_end)
    ).scalar() or 0

    # New customers acquired in this period
    new_customers = db.session.query(
        func.count(Customer.id)
    ).filter(
        Customer.acquisition_date.between(start, end)
    ).scalar() or 0

    # Previous period new customers
    prev_new = db.session.query(
        func.count(Customer.id)
    ).filter(
        Customer.acquisition_date.between(prev_start, prev_end)
    ).scalar() or 0

    # Total churned accounts. Deliberately NOT apportioned to the window.
    #
    # This used to report `total_churned * (period_days / 730)`, spreading the
    # lifetime churn count evenly across two years and calling the slice
    # "churned this period". Churn is not uniform in time and the model does not
    # persist a churn date, so the figure cannot be scoped to a window from this
    # schema. Reporting the real total is honest; inventing an allocation is not.
    total_churned = db.session.query(
        func.count(Customer.id)
    ).filter(
        Customer.status == 'churned'
    ).scalar() or 0

    # At risk customers - use shared function for consistency with Forecasting page
    at_risk_customers = get_at_risk_customers_with_scores(start_date, end_date)
    at_risk = len(at_risk_customers)

    def pct_change(current, previous):
        """Period-over-period change, or None when there is no baseline."""
        if not previous:
            return None
        return round((current - previous) / previous * 100, 1)

    # `prev_active` and `prev_new` were already being queried above and then
    # discarded: every change figure here was `random.uniform(...)`, with the
    # ranges hand-picked so the cards always read as growth. These two are real.
    total_change = pct_change(current_active, prev_active)
    new_change = pct_change(new_customers, prev_new)

    return {
        'total': current_active,
        'totalChange': total_change,
        'new': new_customers,
        'newChange': new_change,
        'churned': total_churned,
        'churnedScope': 'all time',
        # No churn date is persisted and no prior at-risk snapshot exists, so
        # neither of these can be differenced. Null lets the UI omit the arrow.
        'churnedChange': None,
        'atRisk': at_risk,
        'atRiskChange': None,
    }


@bp.route('/segments')
def get_segments():
    """Get customer breakdown by segment - customers active in period."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if not start_date:
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    start = datetime.strptime(start_date, '%Y-%m-%d').date()
    end = datetime.strptime(end_date, '%Y-%m-%d').date()

    # Get customers who had transactions in this period, grouped by segment
    results = db.session.query(
        Customer.segment,
        func.count(func.distinct(Customer.id)).label('count'),
        func.sum(Transaction.amount).label('revenue')
    ).join(
        Transaction, Transaction.customer_id == Customer.id
    ).filter(
        Transaction.transaction_date.between(start, end),
        Transaction.status == 'completed'
    ).group_by(Customer.segment).all()

    total = sum(r.count for r in results)

    return [
        {
            'segment': row.segment or 'Other',
            'count': row.count,
            'revenue': float(row.revenue) if row.revenue else 0,
            'percentage': round((row.count / total * 100), 1) if total else 0,
        }
        for row in results
    ]


@bp.route('/cohorts')
def get_cohorts():
    """Get cohort retention analysis - 12 months of data."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if not start_date:
        start_date = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    start = datetime.strptime(start_date, '%Y-%m-%d').date()
    end = datetime.strptime(end_date, '%Y-%m-%d').date()

    # Get customers grouped by acquisition month within the period
    cohorts = db.session.query(
        func.date_trunc('month', Customer.acquisition_date).label('cohort'),
        func.count(Customer.id).label('initial_count')
    ).filter(
        Customer.acquisition_date.isnot(None),
        Customer.acquisition_date.between(start, end)
    ).group_by(
        func.date_trunc('month', Customer.acquisition_date)
    ).order_by(
        func.date_trunc('month', Customer.acquisition_date).desc()
    ).limit(12).all()

    # Measured retention. For each acquisition-month cohort, the share of that
    # cohort with at least one completed transaction in each subsequent month.
    #
    # This used to be a hardcoded decay curve, [100, 92, 88, 85, 82, 80, 78, 76,
    # 75, 74, 73, 72], plus a per-month random jitter reseeded off the cohort
    # label. It ran the cohort query above and then discarded the result, so the
    # chart showed the same invented curve no matter what the customers did.
    if not cohorts:
        return []

    sql = db.text("""
        WITH cohort AS (
            SELECT id, date_trunc('month', acquisition_date) AS cohort_month
            FROM customers
            WHERE acquisition_date IS NOT NULL
              AND acquisition_date BETWEEN :start AND :end
        ),
        activity AS (
            SELECT c.cohort_month,
                   c.id,
                   (EXTRACT(YEAR  FROM age(date_trunc('month', t.transaction_date), c.cohort_month)) * 12
                  + EXTRACT(MONTH FROM age(date_trunc('month', t.transaction_date), c.cohort_month)))::int
                       AS month_offset
            FROM cohort c
            JOIN transactions t ON t.customer_id = c.id
            WHERE t.status = 'completed'
        )
        SELECT cohort_month, month_offset, COUNT(DISTINCT id) AS active
        FROM activity
        WHERE month_offset BETWEEN 0 AND 11
        GROUP BY cohort_month, month_offset
    """)
    rows = db.session.execute(sql, {'start': start, 'end': end}).fetchall()

    active = {}
    for row in rows:
        active[(row.cohort_month, int(row.month_offset))] = int(row.active)

    sizes = {c.cohort: int(c.initial_count) for c in cohorts if c.cohort}

    result = []
    for cohort in cohorts:
        cohort_date = cohort.cohort
        if not cohort_date:
            continue
        size = sizes.get(cohort_date, 0)
        if not size:
            continue

        entry = {'cohort': cohort_date.strftime('%b %Y'), 'cohortSize': size}
        for offset in range(12):
            # None rather than 0 for months this cohort has not lived through
            # yet, so the heatmap leaves them blank instead of showing a crash
            # in retention that has not happened.
            key = (cohort_date, offset)
            if key in active:
                entry[f'month{offset}'] = round(active[key] / size * 100, 1)
            else:
                entry[f'month{offset}'] = None
        result.append(entry)

    return result


@bp.route('/lifetime-value')
def get_lifetime_value():
    """Get lifetime value distribution filtered by customer acquisition date."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    # Define LTV ranges
    ranges = [
        (0, 1000, '$0 - $1K'),
        (1000, 5000, '$1K - $5K'),
        (5000, 10000, '$5K - $10K'),
        (10000, 50000, '$10K - $50K'),
        (50000, 100000, '$50K - $100K'),
        (100000, float('inf'), '$100K+'),
    ]

    # Build base query with date filter
    base_query = db.session.query(Customer)
    if start_date:
        base_query = base_query.filter(Customer.acquisition_date >= start_date)
    if end_date:
        base_query = base_query.filter(Customer.acquisition_date <= end_date)

    total = base_query.count() or 1
    results = []

    for min_val, max_val, label in ranges:
        query = base_query.filter(Customer.lifetime_value >= min_val)
        if max_val != float('inf'):
            query = query.filter(Customer.lifetime_value < max_val)
        count = query.count()

        results.append({
            'range': label,
            'count': count,
            'percentage': round((count / total * 100), 1),
        })

    return results


@bp.route('/acquisition')
def get_acquisition():
    """Get customer acquisition by channel over time."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if not start_date:
        start_date = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    start = datetime.strptime(start_date, '%Y-%m-%d').date()
    end = datetime.strptime(end_date, '%Y-%m-%d').date()

    # Determine granularity based on date range
    period_days = (end - start).days
    granularity = granularity_for(period_days)
    date_trunc = func.date_trunc(granularity, Customer.acquisition_date)

    results = db.session.query(
        date_trunc.label('date'),
        Customer.acquisition_channel,
        func.count(Customer.id).label('count')
    ).filter(
        Customer.acquisition_date.between(start, end)
    ).group_by(
        date_trunc,
        Customer.acquisition_channel
    ).order_by(
        date_trunc
    ).all()

    rows = [
        {
            'date': row.date.strftime('%Y-%m-%d') if row.date else None,
            'channel': row.acquisition_channel or 'Other',
            'count': row.count,
        }
        for row in results
    ]

    # Several rows share each bucket (one per channel), so an incomplete
    # trailing month would drop every channel at once and read as acquisition
    # collapsing. Same rule as the revenue trend.
    return drop_incomplete_tail(rows, granularity, end)


@bp.route('/at-risk')
def get_at_risk():
    """Get at-risk customers with consistent risk scores."""
    limit = request.args.get('limit', 10, type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    # Use shared function for consistent risk scores with Forecasting page
    return get_at_risk_customers_with_scores(start_date, end_date, limit)
