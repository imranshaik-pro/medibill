"""Committed invoice-command outcomes; retained for the full retry horizon."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, JSON, UniqueConstraint
from app.db.base import Base


class CommandReceipt(Base):
    __tablename__ = "command_receipts"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False)
    operation = Column(String(50), nullable=False)
    key = Column(String(128), nullable=False)
    request_hash = Column(String(64), nullable=False)
    response = Column(JSON, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("company_id", "user_id", "operation", "key", name="uq_command_scope_key"),)
