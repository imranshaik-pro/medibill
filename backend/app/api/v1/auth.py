from datetime import datetime, timedelta
import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas import (
    UserCreate, UserLogin, UserResponse, TokenResponse,
    ForgotPasswordRequest, ForgotPasswordResponse, ResetPasswordRequest,
)
from app.models.user import User
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.password_reset import PasswordResetToken
from app.db.init_db import ensure_company_roles
from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.config import settings

router = APIRouter()
RESET_TOKEN_MINUTES = 30
GENERIC_RESET_MESSAGE = "If an active account exists for that email, password reset instructions are available."


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _validate_password(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    if not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        raise HTTPException(status_code=422, detail="Password must contain at least one letter and one number")


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a tenant and its first administrator."""
    _validate_password(user_data.password)
    email = user_data.email.lower().strip()
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    company = Company(company_name=user_data.company_name.strip(), legal_name=user_data.company_name.strip())
    db.add(company)
    db.flush()

    admin_role = ensure_company_roles(db, company)
    user = User(
        company_id=company.id,
        name=user_data.name.strip(),
        email=email,
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
    user = db.query(User).filter(User.email == credentials.email.lower().strip()).first()
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


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Create a short-lived single-use reset token without exposing account existence."""
    user = db.query(User).filter(User.email == payload.email.lower().strip(), User.is_active.is_(True)).first()
    raw_token = None
    if user:
        now = datetime.utcnow()
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        ).update({"used_at": now}, synchronize_session=False)
        raw_token = secrets.token_urlsafe(48)
        db.add(PasswordResetToken(
            user_id=user.id,
            token_hash=_token_hash(raw_token),
            expires_at=now + timedelta(minutes=RESET_TOKEN_MINUTES),
        ))
        db.commit()

    response = {"message": GENERIC_RESET_MESSAGE}
    # Local-development convenience only. Production never returns the reset token.
    if settings.APP_ENV.lower() != "production" and raw_token:
        response["reset_token"] = raw_token
    return response


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Consume a reset token once and replace the stored password hash."""
    _validate_password(payload.new_password)
    now = datetime.utcnow()
    reset = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == _token_hash(payload.token),
        PasswordResetToken.used_at.is_(None),
        PasswordResetToken.expires_at > now,
    ).first()
    if not reset:
        raise HTTPException(status_code=400, detail="Reset link is invalid or has expired")

    user = db.query(User).filter(User.id == reset.user_id, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=400, detail="Reset link is invalid or has expired")

    user.password_hash = get_password_hash(payload.new_password)
    reset.used_at = now
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.id != reset.id,
        PasswordResetToken.used_at.is_(None),
    ).update({"used_at": now}, synchronize_session=False)
    db.commit()
    return {"message": "Password reset successful. You can now log in with your new password."}
