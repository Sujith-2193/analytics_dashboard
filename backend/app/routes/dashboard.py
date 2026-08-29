from app.fastapi_compat import Blueprint, request
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

    period_days = (end - start).days
    prev_start = start - timedelta(days=period_days)
    prev_end = start - timedelta(days=1)

    current_revenue = db.session.query(func.sum(Transaction.amount)).filter(Transaction.transaction_date.between(start, end), Transaction.status == 'completed').scalar() or 0
    current_customers = db.session.query(func.count(func.distinct(Transaction.customer_id))).filter(Transaction.transaction_date.between(start, end)).scalar() or 0
    current_orders = db.session.query(func.count(Transaction.id)).filter(Transaction.transaction_date.between(start, end), Transaction.status == 'completed').scalar() or 0
    prev_revenue = db.session.query(func.sum(Transaction.amount)).filter(Transaction.transaction_date.between(prev_start, prev_end), Transaction.status == 'completed').scalar() or 0
    prev_customers = db.session.query(func.count(func.distinct(Transaction.customer_id))).filter(Transaction.transaction_date.between(prev_start, prev_end)).scalar() or 0
    prev_orders = db.session.query(func.count(Transaction.id)).filter(Transaction.transaction_date.between(prev_start, prev_end), Transaction.status == 'completed').scalar() or 0

    pipeline_metrics = get_pipeline_metrics(start_date, end_date)
    pipeline_value = pipeline_metrics['pipelineValue']
    avg_order_value = float(current_revenue) / current_orders if current_orders else 0
    prev_avg_order_value = float(prev_revenue) / prev_orders if prev_orders else 0

    def pct_change(current, previous):
        if not previous:
            return None
        return round((float(current) - float(previous)) / float(previous) * 100, 1)

    return {
        'kpis': {
            'totalRevenue': {'value': float(current_revenue), 'previousValue': float(prev_revenue), 'change': float(current_revenue) - float(prev_revenue), 'changePercent': pct_change(current_revenue, prev_revenue)},
            'totalCustomers': {'value': current_customers, 'previousValue': prev_customers, 'change': current_customers - prev_customers, 'changePercent': pct_change(current_customers, prev_customers)},
            'avgOrderValue': {'value': round(avg_order_value, 2), 'changePercent': pct_change(avg_order_value, prev_avg_order_value)},
            'pipelineValue': {'value': float(pipeline_value), 'changePercent': None},
        },
        'dateRange': {'startDate': start_date, 'endDate': end_date}
    }


@bp.route('/kpis')
def get_kpis():
    """Get top-level KPIs."""
    return get_summary()
