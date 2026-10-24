from fastapi import APIRouter, Depends
from app.schemas import UserResponse
from app.models.user import User
from app.api.dependencies import get_current_user

router = APIRouter()


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current authenticated user information."""
    return current_user


@router.get("/me/capabilities", response_model=list[str])
def get_capabilities(current_user: User = Depends(get_current_user)):
    return sorted({permission.name for role in current_user.roles
                   if role.is_active and role.company_id == current_user.company_id
                   for permission in role.permissions})
