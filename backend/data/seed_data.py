"""
Synthetic Data Generator for Enterprise Analytics Dashboard

Generates realistic business data including:
- 100+ products across 8 categories
- 2,000+ customers across segments
- 25 sales reps in 5 regions
- 50,000+ transactions over 2 years
- 500+ pipeline opportunities
"""

import contextlib
import os
import sys
from datetime import datetime, timedelta
import random
from decimal import Decimal

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from faker import Faker
import numpy as np

fake = Faker()
Faker.seed(42)
random.seed(42)
np.random.seed(42)

# Configuration
NUM_PRODUCTS = 120
NUM_CUSTOMERS = 2000
NUM_SALES_REPS = 31
NUM_TRANSACTIONS = 55000
NUM_PIPELINE = 500
START_DATE = None
END_DATE = None

# Categories and their pricing tiers
CATEGORIES = {
    'Enterprise Software': (15000, 50000),
    'Professional Services': (5000, 25000),
    'Cloud Infrastructure': (2000, 15000),
    'Data Analytics': (3000, 20000),
    'Security Solutions': (5000, 30000),
    'Integration Platform': (2000, 10000),
    'Development Tools': (500, 5000),
    'Support & Maintenance': (1000, 8000),
}

REGIONS = ['North America', 'Europe', 'Asia Pacific', 'Latin America', 'Middle East']
CHANNELS = ['direct', 'online', 'partner']
SEGMENTS = ['enterprise', 'mid-market', 'smb']
INDUSTRIES = [
    'Technology', 'Healthcare', 'Finance', 'Manufacturing', 'Retail',
    'Education', 'Government', 'Media', 'Transportation', 'Energy'
]
ACQUISITION_CHANNELS = ['Direct Sales', 'Referral', 'Organic Search', 'Paid Ads', 'Events']
PIPELINE_STAGES = ['lead', 'qualified', 'proposal', 'negotiation', 'closed-won', 'closed-lost']
TEAMS = ['Enterprise', 'Mid-Market', 'SMB']


def generate_products():
    """Generate product catalog."""
    products = []
    product_id = 1

    for category, (min_price, max_price) in CATEGORIES.items():
        # Generate 10-20 products per category
        num_products = random.randint(10, 20)
        for _ in range(num_products):
            if product_id > NUM_PRODUCTS:
                break

            price = round(random.uniform(min_price, max_price), 2)
            cost = round(price * random.uniform(0.3, 0.6), 2)

            products.append({
                'id': product_id,
                'name': f"{fake.company()} {category.split()[0]} Suite",
                'category': category,
                'unit_price': price,
                'cost': cost,
                'is_active': random.random() > 0.1,
            })
            product_id += 1

    return products[:NUM_PRODUCTS]


def generate_sales_reps():
    """Generate sales team."""
    reps = []

    for i in range(NUM_SALES_REPS):
        team = random.choice(TEAMS)
        region = REGIONS[i % len(REGIONS)]

        # Quotas scaled for enterprise software company
        # With ~$40k avg deal and ~900 deals/rep/year, annual revenue ~$36-45M per rep
        # Set quotas so attainment ranges from 70-130%
        if team == 'Enterprise':
            quota = random.randint(38000000, 52000000)  # $38-52M annual
        elif team == 'Mid-Market':
            quota = random.randint(32000000, 45000000)  # $32-45M annual
        else:
            quota = random.randint(28000000, 40000000)  # $28-40M annual

        reps.append({
            'id': i + 1,
            'name': fake.name(),
            'team': team,
            'region': region,
            'quota': quota,
            'hire_date': fake.date_between(start_date='-5y', end_date='-6m'),
        })

    return reps


def generate_customers():
    """Generate customer base.

    Churn is *generated from behaviour*, not rolled independently, so the
    dataset actually contains a learnable signal. Each customer gets a latent
    engagement score, and their churn hazard is a function of that score plus
    segment and tenure. The label is then derived from the hazard rather than
    assigned at random.

    This matters: an earlier version of this generator drew `status` from a
    bare `random.random()` with no relationship to any other column, which made
    churn statistically unlearnable by construction. Any classifier trained on
    it would have scored at the base rate, correctly.

    `engagement` and `churn_date` are internal fields consumed by
    generate_transactions(); they are not persisted to the database. Recency
    and frequency in the transaction history are what a model actually sees.
    """
    customers = []

    # Distribution: 15% enterprise, 35% mid-market, 50% SMB
    segments = ['enterprise'] * 300 + ['mid-market'] * 700 + ['smb'] * 1000

    # Smaller accounts churn more often, which is the usual shape in B2B.
    segment_hazard = {'enterprise': 0.05, 'mid-market': 0.11, 'smb': 0.19}

    for i in range(NUM_CUSTOMERS):
        segment = segments[i] if i < len(segments) else random.choice(SEGMENTS)
        region = random.choice(REGIONS)
        acquisition_date = fake.date_between(start_date=START_DATE, end_date=END_DATE)

        # Latent propensity to keep buying. Drives transaction frequency below,
        # so it reaches the model only through observable behaviour.
        engagement = random.betavariate(2.6, 2.0)

        # LTV varies by segment and scales with engagement.
        if segment == 'enterprise':
            ltv = int(random.randint(50000, 500000) * (0.55 + 0.9 * engagement))
        elif segment == 'mid-market':
            ltv = int(random.randint(10000, 100000) * (0.55 + 0.9 * engagement))
        else:
            ltv = int(random.randint(1000, 20000) * (0.55 + 0.9 * engagement))

        # Tenure in days at the end of the window.
        end_date = END_DATE.date() if hasattr(END_DATE, 'date') else END_DATE
        tenure_days = max((end_date - acquisition_date).days, 0)

        # Hazard: disengaged, small, and newly acquired accounts churn most.
        hazard = segment_hazard[segment]
        hazard *= (1.9 - 1.4 * engagement)          # engagement dominates
        hazard *= (1.35 if tenure_days < 180 else 1.0)  # early-life churn
        hazard += random.uniform(-0.03, 0.03)       # irreducible noise
        hazard = min(max(hazard, 0.01), 0.85)

        roll = random.random()
        churn_date = None
        if roll < hazard:
            status = 'churned'
            # Stopped buying somewhere in the back half of their tenure.
            if tenure_days > 60:
                offset = random.randint(30, max(31, int(tenure_days * 0.8)))
                churn_date = acquisition_date + timedelta(days=offset)
            else:
                churn_date = acquisition_date + timedelta(days=15)
        elif roll < hazard * 1.9:
            # Still buying but decaying. generate_transactions() thins them out.
            status = 'at-risk'
        else:
            status = 'active'

        customers.append({
            'id': i + 1,
            'name': fake.name(),
            'company': fake.company(),
            'industry': random.choice(INDUSTRIES),
            'segment': segment,
            'acquisition_date': acquisition_date,
            'acquisition_channel': random.choice(ACQUISITION_CHANNELS),
            'lifetime_value': ltv,
            'status': status,
            'region': region,
            # internal only, stripped before insert
            'engagement': engagement,
            'churn_date': churn_date,
        })

    return customers


def generate_transactions(products, customers, sales_reps):
    """Generate transaction history."""
    transactions = []

    # Apply seasonality pattern (higher in Q4, lower in summer)
    seasonality = {
        1: 0.92, 2: 0.88, 3: 0.95, 4: 0.90,
        5: 0.98, 6: 1.02, 7: 0.95, 8: 1.05,
        9: 1.12, 10: 1.08, 11: 1.18, 12: 1.15,
    }

    # Weighted sampling pool. Engagement drives how often a customer appears,
    # so frequency and monetary value carry real signal about churn instead of
    # being uniform across the base.
    end_date_d = END_DATE.date() if hasattr(END_DATE, 'date') else END_DATE
    pool = [c for c in customers]
    weights = [0.25 + 1.75 * c['engagement'] for c in pool]

    def eligible(c, on_date):
        """Is this customer still transacting on `on_date`?"""
        if on_date < c['acquisition_date']:
            return False
        if c['churn_date'] is not None and on_date >= c['churn_date']:
            return False
        if c['status'] == 'at-risk':
            # Activity decays over the final 120 days rather than stopping dead.
            days_left = (end_date_d - on_date).days
            if days_left < 120:
                return random.random() < (0.15 + 0.85 * days_left / 120)
        return True

    def pick_customer(on_date, attempts=12):
        for _ in range(attempts):
            c = random.choices(pool, weights=weights, k=1)[0]
            if eligible(c, on_date):
                return c
        return None

    # Generate transactions with realistic patterns
    current_date = START_DATE
    transaction_id = 1
    daily_base = NUM_TRANSACTIONS / 730  # Average daily transactions

    while current_date <= END_DATE and transaction_id <= NUM_TRANSACTIONS:
        month = current_date.month
        seasonal_factor = seasonality.get(month, 1.0)

        # Add some weekly pattern (less on weekends)
        day_of_week = current_date.weekday()
        if day_of_week >= 5:
            daily_factor = 0.3
        else:
            daily_factor = 1.0

        # Growth trend (10% YoY)
        days_from_start = (current_date - START_DATE).days
        growth_factor = 1 + (days_from_start / 365) * 0.1

        num_daily_transactions = int(daily_base * seasonal_factor * daily_factor * growth_factor)
        num_daily_transactions = max(1, num_daily_transactions + random.randint(-10, 10))

        for _ in range(num_daily_transactions):
            if transaction_id > NUM_TRANSACTIONS:
                break

            customer = pick_customer(current_date.date())
            if customer is None:
                continue

            product = random.choice(products)
            sales_rep = random.choice(sales_reps)

            # Quantity varies by product category
            if product['category'] in ['Enterprise Software', 'Professional Services']:
                quantity = 1
            else:
                quantity = random.randint(1, 10)

            amount = product['unit_price'] * quantity

            # Most transactions are completed
            status_roll = random.random()
            if status_roll < 0.92:
                status = 'completed'
            elif status_roll < 0.97:
                status = 'pending'
            else:
                status = 'refunded'

            transactions.append({
                'id': transaction_id,
                'transaction_date': current_date.date(),
                'amount': round(amount, 2),
                'quantity': quantity,
                'product_id': product['id'],
                'customer_id': customer['id'],
                'sales_rep_id': sales_rep['id'],
                'region': customer['region'],
                'channel': random.choice(CHANNELS),
                'status': status,
            })

            transaction_id += 1

        current_date += timedelta(days=1)

    return transactions


def generate_pipeline(customers, sales_reps):
    """Generate sales pipeline."""
    pipeline = []

    # Stage distribution (funnel shape)
    stage_weights = {
        'lead': 0.35,
        'qualified': 0.25,
        'proposal': 0.20,
        'negotiation': 0.12,
        'closed-won': 0.05,
        'closed-lost': 0.03,
    }

    stages = []
    for stage, weight in stage_weights.items():
        stages.extend([stage] * int(weight * 100))

    for i in range(NUM_PIPELINE):
        customer = random.choice([c for c in customers if c['status'] != 'churned'])
        sales_rep = random.choice(sales_reps)
        stage = random.choice(stages)

        # Amount varies by customer segment
        if customer['segment'] == 'enterprise':
            amount = random.randint(50000, 500000)
        elif customer['segment'] == 'mid-market':
            amount = random.randint(20000, 150000)
        else:
            amount = random.randint(5000, 50000)

        # Probability increases with stage
        probability_map = {
            'lead': random.randint(10, 25),
            'qualified': random.randint(25, 45),
            'proposal': random.randint(45, 65),
            'negotiation': random.randint(65, 85),
            'closed-won': 100,
            'closed-lost': 0,
        }

        expected_close = fake.date_between(
            start_date=datetime.now(),
            end_date=datetime.now() + timedelta(days=180)
        )

        pipeline.append({
            'id': i + 1,
            'opportunity_name': f"{customer['company']} - {fake.bs().title()}",
            'customer_id': customer['id'],
            'sales_rep_id': sales_rep['id'],
            'stage': stage,
            'amount': amount,
            'probability': probability_map[stage],
            'expected_close_date': expected_close,
        })

    return pipeline


def seed_database():
    """Seed the database with generated data."""
    global START_DATE, END_DATE
    START_DATE = datetime.now() - timedelta(days=730)  # 2 years ago
    END_DATE = datetime.now()

    from flask import current_app
    from app import create_app, db
    from app.models import Product, Customer, SalesRep, Transaction, Pipeline

    # Reuse an active application context when there is one, and only build an
    # app when called standalone. Unconditionally calling create_app() here was
    # half of a recursion loop with the factory's old auto-reseed block.
    if current_app:
        ctx = contextlib.nullcontext()
    else:
        ctx = create_app('development').app_context()

    with ctx:
        print("Generating synthetic data...")

        # Generate data
        products_data = generate_products()
        sales_reps_data = generate_sales_reps()
        customers_data = generate_customers()
        transactions_data = generate_transactions(products_data, customers_data, sales_reps_data)
        pipeline_data = generate_pipeline(customers_data, sales_reps_data)

        print(f"Generated {len(products_data)} products")
        print(f"Generated {len(sales_reps_data)} sales reps")
        print(f"Generated {len(customers_data)} customers")
        print(f"Generated {len(transactions_data)} transactions")
        print(f"Generated {len(pipeline_data)} pipeline opportunities")

        # Clear existing data
        print("\nClearing existing data...")
        db.session.execute(db.text('TRUNCATE TABLE transactions, pipeline, customers, sales_reps, products RESTART IDENTITY CASCADE'))
        db.session.commit()

        # Insert products
        print("Inserting products...")
        for p in products_data:
            product = Product(**p)
            db.session.add(product)
        db.session.commit()

        # Insert sales reps
        print("Inserting sales reps...")
        for s in sales_reps_data:
            rep = SalesRep(**s)
            db.session.add(rep)
        db.session.commit()

        # Insert customers. `engagement` and `churn_date` are generator-internal
        # latents used to shape transaction history; they are deliberately not
        # persisted, so no model can cheat by reading the label's cause directly.
        print("Inserting customers...")
        internal_fields = ('engagement', 'churn_date')
        for c in customers_data:
            customer = Customer(**{k: v for k, v in c.items() if k not in internal_fields})
            db.session.add(customer)
        db.session.commit()

        # Insert transactions in batches
        print("Inserting transactions...")
        batch_size = 1000
        for i in range(0, len(transactions_data), batch_size):
            batch = transactions_data[i:i + batch_size]
            for t in batch:
                transaction = Transaction(**t)
                db.session.add(transaction)
            db.session.commit()
            print(f"  Inserted {min(i + batch_size, len(transactions_data))} / {len(transactions_data)}")

        # Insert pipeline
        print("Inserting pipeline...")
        for p in pipeline_data:
            opp = Pipeline(**p)
            db.session.add(opp)
        db.session.commit()

        print("\nDatabase seeding complete!")


if __name__ == '__main__':
    seed_database()
