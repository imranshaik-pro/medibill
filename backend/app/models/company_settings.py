from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base import Base


class CompanySettings(Base):
    """Company settings and configuration."""

    __tablename__ = "company_settings"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, unique=True)
    invoice_prefix = Column(String(10))
    next_invoice_number = Column(Integer, default=1)
    default_payment_mode = Column(String(100))
    invoice_terms = Column(Text)
    selected_invoice_template = Column(String(100))
    currency = Column(String(10), default="INR")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    company = relationship("Company", back_populates="company_settings")
