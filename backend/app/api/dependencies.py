"""Shared FastAPI dependencies for authentication, tenancy and RBAC."""

from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User

security = HTTPBearer(auto_error=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Resolve and validate the authenticated user from the bearer JWT."""
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token", headers={"WWW-Authenticate": "Bearer"})

    user_id = payload.get("sub")
    company_id = payload.get("company_id")
    try:
        user_id = int(user_id)
        company_id = int(company_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token payload", headers={"WWW-Authenticate": "Bearer"})

    user = (
        db.query(User)
        .filter(User.id == user_id, User.company_id == company_id, User.is_active.is_(True))
        .first()
    )
    if not user:
        raise HTTPException(status_code=401, detail="User is inactive or no longer exists", headers={"WWW-Authenticate": "Bearer"})
    return user


def get_current_company_id(current_user: User = Depends(get_current_user)) -> int:
    """Return the tenant/company id belonging to the authenticated user."""
    return current_user.company_id


def require_permission(permission_name: str) -> Callable:
    """Build a dependency that requires a named permission on an active role."""

    def permission_dependency(current_user: User = Depends(get_current_user)) -> User:
        has_permission = any(
            role.is_active and any(permission.name == permission_name for permission in role.permissions)
            for role in current_user.roles
        )
        if not has_permission:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Permission required: {permission_name}")
        return current_user

    return permission_dependency
