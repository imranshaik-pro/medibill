"""Add retry receipts and issued-document snapshots; seed accounting capabilities."""
from alembic import op
import sqlalchemy as sa

revision = "20261024_0003"
down_revision = "20260916_0002"
branch_labels = None
depends_on = None

# Explicit migration-local policy, independent of future application defaults.
GRANTS = {
    "collect_payment": ("Collect customer payments", ("Admin", "Manager", "Billing Operator", "Accounts")),
    "pay_supplier": ("Pay suppliers", ("Admin", "Manager", "Accounts")),
    "override_credit_limit": ("Override customer credit limit", ("Admin", "Manager")),
    "override_minimum_sale_rate": ("Override minimum sale rate", ("Admin", "Manager")),
}


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '3s'")
    op.add_column("sales_invoices", sa.Column("document_snapshot", sa.JSON(), nullable=True))
    op.create_table(
        "command_receipts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("operation", sa.String(50), nullable=False),
        sa.Column("key", sa.String(128), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("response", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("company_id", "user_id", "operation", "key", name="uq_command_scope_key"),
    )
    for name, (description, roles) in GRANTS.items():
        bind.execute(sa.text("""INSERT INTO permissions (name, description, created_at)
            VALUES (:name, :description, CURRENT_TIMESTAMP) ON CONFLICT (name) DO NOTHING"""),
            {"name": name, "description": description})
        for role in roles:
            bind.execute(sa.text("""INSERT INTO role_permissions (role_id, permission_id)
                SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
                WHERE r.name = :role AND p.name = :name
                ON CONFLICT (role_id, permission_id) DO NOTHING"""), {"role": role, "name": name})


def downgrade():
    raise RuntimeError("Keep the additive schema on app rollback; receipts and issued snapshots must be retained")
