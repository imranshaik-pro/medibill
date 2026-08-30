"""Database initialization."""
from sqlalchemy.orm import Session
from app.models.company import Company
from app.models.user import User, Role, Permission
from app.core.security import get_password_hash
from app.core.constants import Role as RoleConstants


def init_db(db: Session) -> None:
    """Initialize database with default data."""
    # Check if data already exists
    if db.query(Permission).first():
        return

    # Create permissions
    permissions_data = [
        ("create_invoice", "Create sales invoices"),
        ("view_invoice", "View invoices"),
        ("manage_customers", "Manage customers"),
        ("manage_products", "Manage products"),
        ("manage_inventory", "Manage inventory"),
        ("manage_users", "Manage users"),
        ("view_reports", "View reports"),
        ("manage_settings", "Manage company settings"),
    ]

    permissions = []
    for name, description in permissions_data:
        perm = Permission(name=name, description=description)
        db.add(perm)
        permissions.append(perm)

    db.flush()

    # Create default roles
    roles_data = [
        (RoleConstants.ADMIN, "Administrator with full access", permissions),
        (RoleConstants.MANAGER, "Manager role", permissions[:6]),
        (RoleConstants.BILLING_OPERATOR, "Billing operator", [permissions[0], permissions[1], permissions[3], permissions[4]]),
        (RoleConstants.INVENTORY_OPERATOR, "Inventory operator", [permissions[3], permissions[4]]),
        (RoleConstants.VIEWER, "Read-only access", [permissions[1], permissions[6]]),
    ]

    for role_name, description, role_perms in roles_data:
        role = Role(name=role_name, description=description)
        role.permissions = role_perms
        db.add(role)

    db.commit()
