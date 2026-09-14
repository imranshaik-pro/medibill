from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import get_current_user, require_permission
from app.core.security import get_password_hash
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.company_settings import CompanySettings
from app.models.user import Permission, Role, User
from app.schemas.admin import (
    AdminUserCreate,
    AdminUserInfo,
    AdminUserUpdate,
    AuditLogInfo,
    BusinessControlUpdate,
    PermissionInfo,
    RoleCreate,
    RoleInfo,
    RoleUpdate,
)
from app.services.audit import write_audit

router = APIRouter()


def _tenant_roles(db: Session, company_id: int, role_ids: list[int]) -> list[Role]:
    roles = db.query(Role).options(joinedload(Role.permissions)).filter(
        Role.company_id == company_id,
        Role.id.in_(role_ids),
    ).all()
    if len(roles) != len(set(role_ids)):
        raise HTTPException(status_code=400, detail="One or more roles are invalid for this company")
    return roles


@router.get("/users", response_model=list[AdminUserInfo])
def list_users(
    search: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_users")),
):
    q = db.query(User).options(joinedload(User.roles).joinedload(Role.permissions)).filter(
        User.company_id == current_user.company_id
    )
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(or_(User.name.ilike(term), User.email.ilike(term), User.mobile.ilike(term)))
    return q.order_by(User.name).all()


@router.post("/users", response_model=AdminUserInfo, status_code=status.HTTP_201_CREATED)
def create_user(
    data: AdminUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_users")),
):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=409, detail="Email already exists")
    roles = _tenant_roles(db, current_user.company_id, data.role_ids)
    user = User(
        company_id=current_user.company_id,
        name=data.name,
        email=data.email,
        mobile=data.mobile,
        password_hash=get_password_hash(data.password),
        is_active=True,
    )
    user.roles = roles
    db.add(user)
    db.flush()
    write_audit(
        db,
        company_id=current_user.company_id,
        user_id=current_user.id,
        action="USER_CREATE",
        entity_type="USER",
        entity_id=user.id,
        new_value={"email": user.email, "role_ids": data.role_ids},
    )
    db.commit()
    return db.query(User).options(joinedload(User.roles).joinedload(Role.permissions)).filter(User.id == user.id).first()


@router.patch("/users/{user_id}", response_model=AdminUserInfo)
def update_user(
    user_id: int,
    data: AdminUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_users")),
):
    user = db.query(User).options(joinedload(User.roles)).filter(
        User.id == user_id,
        User.company_id == current_user.company_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    payload = data.model_dump(exclude_unset=True)
    old = {"name": user.name, "mobile": user.mobile, "is_active": user.is_active, "role_ids": [r.id for r in user.roles]}
    if "is_active" in payload and user.id == current_user.id and payload["is_active"] is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
    if "role_ids" in payload:
        user.roles = _tenant_roles(db, current_user.company_id, payload.pop("role_ids"))
    if payload.pop("new_password", None):
        user.password_hash = get_password_hash(data.new_password)
    for key in ("name", "mobile", "is_active"):
        if key in payload:
            setattr(user, key, payload[key])
    write_audit(
        db,
        company_id=current_user.company_id,
        user_id=current_user.id,
        action="USER_UPDATE",
        entity_type="USER",
        entity_id=user.id,
        old_value=old,
        new_value={"name": user.name, "mobile": user.mobile, "is_active": user.is_active, "role_ids": [r.id for r in user.roles]},
    )
    db.commit()
    return db.query(User).options(joinedload(User.roles).joinedload(Role.permissions)).filter(User.id == user.id).first()


@router.get("/permissions", response_model=list[PermissionInfo])
def list_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_users")),
):
    return db.query(Permission).order_by(Permission.name).all()


@router.get("/roles", response_model=list[RoleInfo])
def list_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_users")),
):
    return db.query(Role).options(joinedload(Role.permissions)).filter(
        Role.company_id == current_user.company_id
    ).order_by(Role.name).all()


@router.post("/roles", response_model=RoleInfo, status_code=status.HTTP_201_CREATED)
def create_role(
    data: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_users")),
):
    if db.query(Role).filter(Role.company_id == current_user.company_id, Role.name == data.name).first():
        raise HTTPException(status_code=409, detail="Role already exists")
    permissions = db.query(Permission).filter(Permission.id.in_(data.permission_ids)).all() if data.permission_ids else []
    if len(permissions) != len(set(data.permission_ids)):
        raise HTTPException(status_code=400, detail="One or more permissions are invalid")
    role = Role(company_id=current_user.company_id, name=data.name, description=data.description, is_active=True)
    role.permissions = permissions
    db.add(role)
    db.flush()
    write_audit(db, company_id=current_user.company_id, user_id=current_user.id, action="ROLE_CREATE", entity_type="ROLE", entity_id=role.id, new_value={"name": role.name, "permission_ids": data.permission_ids})
    db.commit()
    db.refresh(role)
    return role


@router.patch("/roles/{role_id}", response_model=RoleInfo)
def update_role(
    role_id: int,
    data: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_users")),
):
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role_id, Role.company_id == current_user.company_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    old = {"description": role.description, "is_active": role.is_active, "permission_ids": [p.id for p in role.permissions]}
    payload = data.model_dump(exclude_unset=True)
    if "permission_ids" in payload:
        ids = payload.pop("permission_ids")
        permissions = db.query(Permission).filter(Permission.id.in_(ids)).all() if ids else []
        if len(permissions) != len(set(ids)):
            raise HTTPException(status_code=400, detail="One or more permissions are invalid")
        role.permissions = permissions
    for key in ("description", "is_active"):
        if key in payload:
            setattr(role, key, payload[key])
    write_audit(db, company_id=current_user.company_id, user_id=current_user.id, action="ROLE_UPDATE", entity_type="ROLE", entity_id=role.id, old_value=old, new_value={"description": role.description, "is_active": role.is_active, "permission_ids": [p.id for p in role.permissions]})
    db.commit()
    return db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role.id).first()


@router.get("/audit-logs", response_model=list[AuditLogInfo])
def list_audit_logs(
    action: str | None = None,
    entity_type: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_users")),
):
    q = db.query(AuditLog, User.name).outerjoin(User, User.id == AuditLog.user_id).filter(AuditLog.company_id == current_user.company_id)
    if action:
        q = q.filter(AuditLog.action == action)
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    rows = q.order_by(AuditLog.timestamp.desc()).limit(limit).all()
    return [AuditLogInfo(
        id=log.id, user_id=log.user_id, action=log.action, entity_type=log.entity_type,
        entity_id=log.entity_id, old_value=log.old_value, new_value=log.new_value,
        timestamp=log.timestamp, user_name=user_name,
    ) for log, user_name in rows]


@router.get("/business-controls")
def get_business_controls(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_settings")),
):
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == current_user.company_id).first()
    if not settings:
        settings = CompanySettings(company_id=current_user.company_id, invoice_prefix="INV", next_invoice_number=1, currency="INR")
        db.add(settings); db.commit(); db.refresh(settings)
    return {
        "invoice_prefix": settings.invoice_prefix,
        "next_invoice_number": settings.next_invoice_number,
        "default_payment_mode": settings.default_payment_mode,
        "currency": settings.currency,
        "selected_invoice_template": settings.selected_invoice_template,
    }


@router.patch("/business-controls")
def update_business_controls(
    data: BusinessControlUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_settings")),
):
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == current_user.company_id).with_for_update().first()
    if not settings:
        settings = CompanySettings(company_id=current_user.company_id, invoice_prefix="INV", next_invoice_number=1, currency="INR")
        db.add(settings); db.flush()
    old = {"invoice_prefix": settings.invoice_prefix, "default_payment_mode": settings.default_payment_mode, "currency": settings.currency, "selected_invoice_template": settings.selected_invoice_template}
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(settings, key, value)
    write_audit(db, company_id=current_user.company_id, user_id=current_user.id, action="BUSINESS_CONTROLS_UPDATE", entity_type="COMPANY_SETTINGS", entity_id=settings.id, old_value=old, new_value=data.model_dump(exclude_unset=True))
    db.commit(); db.refresh(settings)
    return {
        "invoice_prefix": settings.invoice_prefix,
        "next_invoice_number": settings.next_invoice_number,
        "default_payment_mode": settings.default_payment_mode,
        "currency": settings.currency,
        "selected_invoice_template": settings.selected_invoice_template,
    }
