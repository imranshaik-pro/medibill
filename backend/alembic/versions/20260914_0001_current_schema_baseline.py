"""MediBill current-schema baseline.

Revision ID: 20260914_0001
Revises: None
Create Date: 2026-09-14

This is the first versioned schema revision for MediBill. On a fresh database it
creates the schema that existed when this baseline was introduced. Later models
must be created only by their own incremental Alembic revisions.

An existing unversioned database that has already been reconciled to this exact
baseline schema should be stamped to this revision instead of replaying it.
"""

from alembic import op

from app.db.base import Base
from app.models import *  # noqa: F401,F403 - registers model tables in metadata

revision = "20260914_0001"
down_revision = None
branch_labels = None
depends_on = None

# The baseline uses SQLAlchemy metadata rather than explicit op.create_table calls.
# Exclude tables introduced by revisions after the baseline date. Without this,
# importing a newer model causes the historical baseline to create that table on
# fresh databases before its incremental migration runs.
POST_BASELINE_TABLES = {"password_reset_tokens"}


def _baseline_tables():
    return [
        table
        for table in Base.metadata.sorted_tables
        if table.name not in POST_BASELINE_TABLES
    ]


def upgrade() -> None:
    bind = op.get_bind()
    for table in _baseline_tables():
        table.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    for table in reversed(_baseline_tables()):
        table.drop(bind=bind, checkfirst=True)
