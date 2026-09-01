"""API v1 module."""

from fastapi import APIRouter
from app.api.v1 import auth, users, health, master_data

router = APIRouter(prefix="/api/v1")

router.include_router(health.router, tags=["health"])
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(users.router, prefix="/users", tags=["users"])
router.include_router(master_data.router, prefix="/master-data", tags=["master-data"])
