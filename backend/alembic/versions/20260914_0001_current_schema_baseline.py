"""MediBill current-schema baseline.

Revision ID: 20260914_0001
Revises: None
Create Date: 2026-09-14

This is the first versioned schema revision for MediBill.  On a fresh database it
creates the complete schema represented by the SQLAlchemy model registry.  An
existing unversioned database that has already been reconciled to this exact
schema should be stamped to this revision instead of replaying it.
"""

from alembic import op

from app.db.base import Base
from app.models import *  # noqa: F401,F403 - registers all tables in metadata

revision = "20260914_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, checkfirst=True)
