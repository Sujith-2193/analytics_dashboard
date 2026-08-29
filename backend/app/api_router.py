from fastapi import APIRouter
from app.routes import dashboard, revenue, customers, operations, forecasting

api_router = APIRouter(prefix="/api")

# Route modules continue to register through the migration compatibility layer.
for module in (dashboard, revenue, customers, operations, forecasting):
    if hasattr(module, "bp"):
        api_router.include_router(module.bp.router if hasattr(module.bp, "router") else module.bp)
