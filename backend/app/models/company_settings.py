from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base import Base


class CompanySettings(Base):
    """Company settings and invoice/document configuration."""

    __tablename__ = "company_settings"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, unique=True)
    invoice_prefix = Column(String(10))
    next_invoice_number = Column(Integer, default=1)
    default_payment_mode = Column(String(100))
    invoice_terms = Column(Text)
    selected_invoice_template = Column(String(100), default="PHARMA_A4")
    currency = Column(String(10), default="INR")

    # Pharma invoice identity / statutory display fields.
    state_code = Column(String(10))
    drug_license_20b = Column(String(100))
    drug_license_21b = Column(String(100))

    # Optional bank/payment footer details.
    bank_name = Column(String(120))
    bank_account_number = Column(String(80))
    bank_branch = Column(String(160))
    bank_ifsc = Column(String(30))

    jurisdiction = Column(String(160))
    authorized_signatory = Column(String(160))

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    company = relationship("Company", back_populates="company_settings")
