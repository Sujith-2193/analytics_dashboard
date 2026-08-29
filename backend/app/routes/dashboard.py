from app.fastapi_compat import Blueprint, request
from sqlalchemy import func, extract
from datetime import datetime, timedelta
from app import db
from app.models import Transaction, Customer, Pipeline, Product
from app.routes.operations import get_pipeline_metrics

bp = Blueprint('dashboard', __name__, url_prefix='/api/dashboard')

