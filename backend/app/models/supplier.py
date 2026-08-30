from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base import Base


class Supplier(Base):
    """Supplier model."""

    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    supplier_code = Column(String(50), nullable=False)
    supplier_name = Column(String(255), nullable=False)
    contact_person = Column(String(255))
    phone = Column(String(20))
    email = Column(String(255))
    address = Column(Text)
    gstin = Column(String(15))
    credit_days = Column(Integer, default=30)
    credit_limit = Column(String(20))
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        __import__("sqlalchemy").UniqueConstraint("company_id", "supplier_code", name="uq_company_supplier_code"),
    )

    # Relationships
    company = relationship("Company", back_populates="suppliers")
    purchase_invoices = relationship("PurchaseInvoice", back_populates="supplier")
