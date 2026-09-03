from app.fastapi_compat import Blueprint, request
from sqlalchemy import func
from datetime import datetime, timedelta
from app import db
from app.models import Pipeline, SalesRep, Transaction

bp = Blueprint('operations', __name__, url_prefix='/api/operations')


def get_pipeline_metrics(start_date=None, end_date=None):
    """
    Shared function to calculate pipeline metrics consistently.
    Used by both dashboard and operations endpoints.
    """
    # Pipeline value (current open pipeline - excludes closed deals)
    pipeline_value = db.session.query(
        func.sum(Pipeline.amount)
    ).filter(
        Pipeline.stage.notin_(['closed-won', 'closed-lost'])
    ).scalar() or 0

    # Win rate calculation
    closed_won = db.session.query(func.count(Pipeline.id)).filter(
        Pipeline.stage == 'closed-won'
    ).scalar() or 0

    total_closed = db.session.query(func.count(Pipeline.id)).filter(
        Pipeline.stage.in_(['closed-won', 'closed-lost'])
    ).scalar() or 1

    leads = db.session.query(func.count(Pipeline.id)).filter(
        Pipeline.stage == 'lead'
    ).scalar() or 1

    # Win rate can be calculated two ways - we use closed-won / total leads for funnel perspective
    win_rate = (closed_won / leads) * 100 if leads > 0 else 0

    # Total deals in pipeline
    total_deals = db.session.query(func.count(Pipeline.id)).filter(
        Pipeline.stage.notin_(['closed-won', 'closed-lost'])
    ).scalar() or 1

    # Average deal size
    avg_deal_size = float(pipeline_value) / total_deals if total_deals > 0 else 0

    return {
        'pipelineValue': float(pipeline_value),
        'winRate': win_rate,
        'avgDealSize': avg_deal_size,
        'totalDeals': total_deals,
        'closedWon': closed_won,
        'leads': leads,
    }


@bp.route('/pipeline')
def get_pipeline():
    """Get pipeline by stage - varies by selected period."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if not start_date:
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    start = datetime.strptime(start_date, '%Y-%m-%d').date()
    end = datetime.strptime(end_date, '%Y-%m-%d').date()
    period_days = (end - start).days

    stages = ['lead', 'qualified', 'proposal', 'negotiation', 'closed-won']

    # One grouped query instead of five, and no post-hoc scaling.
    #
    # This endpoint used to read the real per-stage totals and then multiply
    # both the value and the count by random factors (0.8-1.2 on value,
    # 0.75-1.25 on count) plus a "period factor" derived from the length of the
    # window. The result reported 47.8M of pipeline against 45.5M that actually
    # existed, disagreed with the dashboard's own pipeline figure by 5M, and
    # returned counts that moved in the opposite direction to the underlying
    # rows. Conversion rates were computed from those invented counts.
    rows = db.session.query(
        Pipeline.stage,
        func.sum(Pipeline.amount).label('value'),
        func.count(Pipeline.id).label('count'),
    ).filter(
        Pipeline.stage.in_(stages)
    ).group_by(Pipeline.stage).all()

    by_stage = {r.stage: r for r in rows}

    results = []
    prev_count = None
    for stage in stages:
        row = by_stage.get(stage)
        value = float(row.value) if row and row.value else 0.0
        count = int(row.count) if row else 0

        # Stage-to-stage conversion, measured. The first stage has nothing
        # upstream of it, so it has no conversion rate rather than a fake 100%.
        conversion_rate = None
        if prev_count:
            conversion_rate = round(count / prev_count * 100, 1)

        results.append({
            'stage': stage.replace('-', ' ').title(),
            'value': round(value, 2),
            'count': count,
            'conversionRate': conversion_rate,
        })
        prev_count = count

    return results


@bp.route('/pipeline-kpis')
def get_pipeline_kpis():
    """Pipeline KPIs.

    The three `*Change` fields and `avgCycleTime` are null. That is deliberate.

    They used to be `random.uniform(5.0, 15.0)` and friends, with a comment
    stating the changes were "ALWAYS non-zero" so the UI would show movement.
    Deal cycle time was `42 + random.randint(-5, 8)` days, a constant with
    jitter. None of it described the business.

    A period-over-period delta needs a prior observation, and this application
    stores no historical snapshots of pipeline value, win rate, or deal size.
    Cycle time needs opportunity stage-transition timestamps, and the Pipeline
    model has only `created_at` and `expected_close_date`. Returning null lets
    the UI omit the figure rather than draw a fictional one.
    """
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    metrics = get_pipeline_metrics(start_date, end_date)

    return {
        'pipelineValue': round(metrics['pipelineValue'], 2),
        'winRate': round(metrics['winRate'], 1),
        'avgDealSize': round(metrics['avgDealSize'], 2),
        # No prior-period snapshot exists to difference against. See docstring.
        'pipelineChange': None,
        'winRateChange': None,
        'dealSizeChange': None,
        # Needs stage-transition timestamps the schema does not carry.
        'avgCycleTime': None,
        'cycleTimeChange': None,
    }


@bp.route('/sales-performance')
def get_sales_performance():
    """Get sales rep performance vs quota - showing a growing org hitting goals."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if not start_date:
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    start = datetime.strptime(start_date, '%Y-%m-%d').date()
    end = datetime.strptime(end_date, '%Y-%m-%d').date()

    # Get all sales reps with their achieved revenue in the selected period
    results = db.session.query(
        SalesRep.id,
        SalesRep.name,
        SalesRep.team,
        SalesRep.region,
        SalesRep.quota,
        func.sum(Transaction.amount).label('achieved'),
        func.count(Transaction.id).label('deals')
    ).outerjoin(
        Transaction,
        (Transaction.sales_rep_id == SalesRep.id) &
        (Transaction.transaction_date >= start) &
        (Transaction.transaction_date <= end) &
        (Transaction.status == 'completed')
    ).group_by(
        SalesRep.id, SalesRep.name, SalesRep.team, SalesRep.region, SalesRep.quota
    ).all()

    reps_data = []
    for row in results:
        achieved = float(row.achieved) if row.achieved else 0
        quota = float(row.quota) if row.quota else 0
        # Calculate attainment as percentage of annual quota achieved
        attainment = round((achieved / quota * 100), 1) if quota > 0 else 0

        reps_data.append({
            'id': row.id,
            'name': row.name,
            'team': row.team,
            'region': row.region,
            'quota': quota,
            'achieved': achieved,
            'deals': row.deals or 0,
            'attainment': attainment,
        })

    # Sort by attainment descending
    reps_data.sort(key=lambda x: x['attainment'], reverse=True)

    # Attainment above is measured: achieved revenue over assigned quota.
    #
    # It used to be discarded here. The block that stood in this place sorted
    # the reps, then overwrote the top six with 145/139/133/127/121/115 percent,
    # the middle six with 105 down to 85, and the rest with 82 down to 61, each
    # plus a random jitter - and then back-solved `achieved` from the invented
    # attainment so the two columns would agree. Its own comment read "Ensure we
    # show a growing organization hitting goals."
    #
    # The leaderboard now shows how the reps actually did.
    return reps_data[:20]


@bp.route('/conversion-rates')
def get_conversion_rates():
    """Get stage-to-stage conversion rates."""
    stages = ['lead', 'qualified', 'proposal', 'negotiation', 'closed-won']

    results = []
    counts = {}

    # Get counts for each stage
    for stage in stages:
        count = db.session.query(
            func.count(Pipeline.id)
        ).filter(
            Pipeline.stage == stage
        ).scalar() or 0
        counts[stage] = count

    # Calculate conversion rates
    for i in range(len(stages) - 1):
        from_stage = stages[i]
        to_stage = stages[i + 1]

        rate = 0
        if counts[from_stage] > 0:
            rate = round((counts[to_stage] / counts[from_stage]) * 100, 1)

        results.append({
            'fromStage': f"{from_stage.title()} → {to_stage.title()}",
            'rate': rate,
        })

    return results


@bp.route('/cycle-time')
def get_cycle_time():
    """Average expected days from opportunity creation to close, by stage.

    Measured from `created_at` and `expected_close_date` on the opportunities
    themselves.

    This is deliberately NOT stage-to-stage transition time, which is what the
    endpoint used to claim. It reported a hardcoded [8, 12, 15, 7] days plus
    `random.randint` jitter, reseeded off the filter string so the invented
    numbers at least stayed stable per window. True transition time needs a
    history of when each opportunity entered each stage, and the Pipeline model
    carries no such timestamps, so it cannot be computed from this schema.

    What is computable is how long deals currently sitting in each stage are
    expected to take end to end, which is a real and useful figure. The label
    says what it is.
    """
    stages = ['lead', 'qualified', 'proposal', 'negotiation']

    rows = db.session.query(
        Pipeline.stage,
        func.avg(
            func.cast(Pipeline.expected_close_date, db.Date)
            - func.cast(Pipeline.created_at, db.Date)
        ).label('avg_days'),
        func.count(Pipeline.id).label('count'),
    ).filter(
        Pipeline.stage.in_(stages),
        Pipeline.expected_close_date.isnot(None),
        Pipeline.created_at.isnot(None),
    ).group_by(Pipeline.stage).all()

    by_stage = {r.stage: r for r in rows}

    result = []
    for stage in stages:
        row = by_stage.get(stage)
        if row is None or row.avg_days is None:
            continue
        result.append({
            'stage': stage.replace('-', ' ').title(),
            'avgDays': round(float(row.avg_days), 1),
            'count': int(row.count),
        })

    return result


@bp.route('/opportunities')
def get_opportunities():
    """Get pipeline opportunities."""
    stage = request.args.get('stage')
    limit = request.args.get('limit', 20, type=int)

    query = db.session.query(Pipeline)

    if stage:
        query = query.filter(Pipeline.stage == stage)

    results = query.order_by(
        Pipeline.amount.desc()
    ).limit(limit).all()

    return [opp.to_dict() for opp in results]


@bp.route('/deal-size-distribution')
def get_deal_size_distribution():
    """Get distribution of deals by size buckets."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if not start_date:
        start_date = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')

    start = datetime.strptime(start_date, '%Y-%m-%d').date()
    end = datetime.strptime(end_date, '%Y-%m-%d').date()

    # Define size buckets
    buckets = [
        (0, 10000, '$0-10K'),
        (10000, 25000, '$10-25K'),
        (25000, 50000, '$25-50K'),
        (50000, 100000, '$50-100K'),
        (100000, 250000, '$100-250K'),
        (250000, float('inf'), '$250K+'),
    ]

    results = []
    for min_val, max_val, label in buckets:
        query = db.session.query(
            func.count(Transaction.id).label('count'),
            func.sum(Transaction.amount).label('value')
        ).filter(
            Transaction.transaction_date >= start,
            Transaction.transaction_date <= end,
            Transaction.status == 'completed',
            Transaction.amount >= min_val
        )

        if max_val != float('inf'):
            query = query.filter(Transaction.amount < max_val)

        result = query.first()

        results.append({
            'bucket': label,
            'count': result.count or 0,
            'value': float(result.value) if result.value else 0,
        })

    return results
