from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas import UserCreate, UserLogin, UserResponse, TokenResponse
from app.models.user import User
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.db.init_db import ensure_company_roles
from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.config import settings

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a tenant and its first administrator."""
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    company = Company(company_name=user_data.company_name, legal_name=user_data.company_name)
    db.add(company)
    db.flush()

    admin_role = ensure_company_roles(db, company)
    user = User(
        company_id=company.id,
        name=user_data.name,
        email=user_data.email,
        mobile=user_data.mobile,
        password_hash=get_password_hash(user_data.password),
        is_active=True,
    )
    user.roles.append(admin_role)
    db.add(user)
    db.add(CompanySettings(company_id=company.id, invoice_prefix="INV", next_invoice_number=1, currency="INR"))
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Authenticate a user and issue a tenant-scoped JWT."""
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")

    user.last_login_at = datetime.utcnow()
    access_token = create_access_token(
        data={"sub": str(user.id), "company_id": user.company_id},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    db.commit()
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }
