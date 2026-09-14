"""API v1 module."""

from fastapi import APIRouter
from app.api.v1 import auth, users, health, master_data, inventory, purchases, sales, receivables, pharma, dashboard, returns, accounting

router = APIRouter(prefix="/api/v1")

router.include_router(health.router, tags=["health"])
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(users.router, prefix="/users", tags=["users"])
router.include_router(master_data.router, prefix="/master-data", tags=["master-data"])
router.include_router(inventory.router, prefix="/inventory", tags=["inventory"])
router.include_router(purchases.router, prefix="/purchases", tags=["purchases"])
router.include_router(sales.router, prefix="/sales", tags=["sales"])
router.include_router(receivables.router, prefix="/receivables", tags=["receivables"])
router.include_router(pharma.router, prefix="/pharma", tags=["pharma"])
router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
router.include_router(returns.router, prefix="/returns", tags=["returns"])
router.include_router(accounting.router, prefix="/accounting", tags=["accounting"])
