"""Database initialization and tenant role/permission seeding."""

from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.user import User, Role, Permission
from app.models.company_settings import CompanySettings
from app.core.constants import Role as RoleConstants


PERMISSIONS = [
    ("create_invoice", "Create sales invoices"),
    ("view_invoice", "View invoices"),
    ("manage_customers", "Manage customers"),
    ("manage_products", "Manage products"),
    ("manage_inventory", "Manage inventory"),
    ("manage_users", "Manage users"),
    ("view_reports", "View reports"),
    ("manage_settings", "Manage company settings"),
]


def seed_permissions(db: Session) -> dict[str, Permission]:
    """Create the global permission catalog idempotently."""
    result = {}
    for name, description in PERMISSIONS:
        permission = db.query(Permission).filter(Permission.name == name).first()
        if permission is None:
            permission = Permission(name=name, description=description)
            db.add(permission)
            db.flush()
        result[name] = permission
    return result


def ensure_company_roles(db: Session, company: Company) -> Role:
    """Ensure the default roles exist for a tenant and return its Admin role."""
    permissions = seed_permissions(db)
    role_permissions = {
        RoleConstants.ADMIN: list(permissions.values()),
        RoleConstants.MANAGER: [permissions[name] for name in (
            "create_invoice", "view_invoice", "manage_customers", "manage_products",
            "manage_inventory", "manage_users",
        )],
        RoleConstants.BILLING_OPERATOR: [permissions[name] for name in (
            "create_invoice", "view_invoice", "manage_customers", "manage_products",
        )],
        RoleConstants.INVENTORY_OPERATOR: [permissions[name] for name in (
            "manage_products", "manage_inventory",
        )],
        RoleConstants.ACCOUNTS: [permissions[name] for name in (
            "view_invoice", "view_reports",
        )],
        RoleConstants.VIEWER: [permissions[name] for name in (
            "view_invoice", "view_reports",
        )],
    }

    descriptions = {
        RoleConstants.ADMIN: "Administrator with full access",
        RoleConstants.MANAGER: "Manager role",
        RoleConstants.BILLING_OPERATOR: "Billing operator",
        RoleConstants.INVENTORY_OPERATOR: "Inventory operator",
        RoleConstants.ACCOUNTS: "Accounts role",
        RoleConstants.VIEWER: "Read-only access",
    }

    admin_role = None
    for role_name, role_perms in role_permissions.items():
        role = (
            db.query(Role)
            .filter(Role.company_id == company.id, Role.name == role_name)
            .first()
        )
        if role is None:
            role = Role(
                company_id=company.id,
                name=role_name,
                description=descriptions[role_name],
                is_active=True,
            )
            role.permissions = role_perms
            db.add(role)
        elif not role.permissions:
            role.permissions = role_perms
        if role_name == RoleConstants.ADMIN:
            admin_role = role

    db.flush()
    return admin_role


def init_db(db: Session) -> None:
    """Initialize global permissions and tenant roles idempotently."""
    seed_permissions(db)
    companies = db.query(Company).all()
    for company in companies:
        ensure_company_roles(db, company)
    db.commit()
