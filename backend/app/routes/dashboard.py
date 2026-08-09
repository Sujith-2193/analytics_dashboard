from flask import Blueprint, request
from sqlalchemy import func, extract
from datetime import datetime, timedelta
from app import db
from app.models import Transaction, Customer, Pipeline, Product
from app.routes.operations import get_pipeline_metrics

bp = Blueprint('dashboard', __name__, url_prefix='/api/dashboard')


@bp.route('/summary')
def get_summary():
    """Get executive dashboard summary."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if not start_date:
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    start = datetime.strptime(start_date, '%Y-%m-%d').date()
    end = datetime.strptime(end_date, '%Y-%m-%d').date()

    # Calculate date range for previous period
    period_days = (end - start).days
    prev_start = start - timedelta(days=period_days)
    prev_end = start - timedelta(days=1)

    # Current period metrics
    current_revenue = db.session.query(
        func.sum(Transaction.amount)
    ).filter(
        Transaction.transaction_date.between(start, end),
        Transaction.status == 'completed'
    ).scalar() or 0

    current_customers = db.session.query(
        func.count(func.distinct(Transaction.customer_id))
    ).filter(
        Transaction.transaction_date.between(start, end)
    ).scalar() or 0

    current_orders = db.session.query(
        func.count(Transaction.id)
    ).filter(
        Transaction.transaction_date.between(start, end),
        Transaction.status == 'completed'
    ).scalar() or 0

    # Previous period metrics
    prev_revenue = db.session.query(
        func.sum(Transaction.amount)
    ).filter(
        Transaction.transaction_date.between(prev_start, prev_end),
        Transaction.status == 'completed'
    ).scalar() or 0

    prev_customers = db.session.query(
        func.count(func.distinct(Transaction.customer_id))
    ).filter(
        Transaction.transaction_date.between(prev_start, prev_end)
    ).scalar() or 0

    prev_orders = db.session.query(
        func.count(Transaction.id)
    ).filter(
        Transaction.transaction_date.between(prev_start, prev_end),
        Transaction.status == 'completed'
    ).scalar() or 0

    # Get consistent pipeline metrics using shared function
    pipeline_metrics = get_pipeline_metrics(start_date, end_date)
    pipeline_value = pipeline_metrics['pipelineValue']

    # Calculate current period metrics
    avg_order_value = float(current_revenue) / current_orders if current_orders else 0
    prev_avg_order_value = float(prev_revenue) / prev_orders if prev_orders else 0

    def pct_change(current, previous):
        """Period-over-period change, or None when there is no baseline.

        A measured 0.0 is returned as 0.0. This used to run through a helper
        named `ensure_nonzero` which, whenever the real change came out to
        exactly zero, substituted `random.uniform(3.0, 12.0)` - so the one case
        where the honest answer was "flat" was the one case guaranteed to be
        invented. Where no prior period existed, the whole figure was random.
        """
        if not previous:
            return None
        return round((float(current) - float(previous)) / float(previous) * 100, 1)

    revenue_change = pct_change(current_revenue, prev_revenue)
    customer_change = pct_change(current_customers, prev_customers)
    aov_change = pct_change(avg_order_value, prev_avg_order_value)

    # Pipeline has no prior-period snapshot to difference against: opportunities
    # carry a current stage and no history of what the pipeline totalled a month
    # ago. This was `random.uniform(10.0, 25.0)`.
    pipeline_change = None

    return {
        'kpis': {
            'totalRevenue': {
                'value': float(current_revenue),
                'previousValue': float(prev_revenue),
                'change': float(current_revenue) - float(prev_revenue),
                'changePercent': revenue_change,
            },
            'totalCustomers': {
                'value': current_customers,
                'previousValue': prev_customers,
                'change': current_customers - prev_customers,
                'changePercent': customer_change,
            },
            'avgOrderValue': {
                'value': round(avg_order_value, 2),
                'changePercent': aov_change,
            },
            'pipelineValue': {
                'value': float(pipeline_value),
                'changePercent': pipeline_change,
            },
        },
        'dateRange': {
            'startDate': start_date,
            'endDate': end_date,
        }
    }


@bp.route('/kpis')
def get_kpis():
    """Get top-level KPIs."""
    return get_summary()
