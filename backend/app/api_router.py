from fastapi import APIRouter
from app.routes import dashboard, revenue, customers, operations, forecasting

api_router = APIRouter(prefix="/api")

for module in (dashboard, revenue, customers, operations, forecasting):
    if hasattr(module, "bp"):
        router = module.bp.router if hasattr(module.bp, "router") else module.bp
        api_router.include_router(router)
