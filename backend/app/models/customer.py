from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base import Base


class Customer(Base):
    """Customer model."""

    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    customer_code = Column(String(50), nullable=False)
    customer_name = Column(String(255), nullable=False)
    contact_person = Column(String(255))
    phone = Column(String(20))
    email = Column(String(255))
    billing_address = Column(Text)
    shipping_address = Column(Text)
    gstin = Column(String(15))
    state = Column(String(100))
    pincode = Column(String(10))
    credit_limit = Column(Numeric(12, 2))
    credit_days = Column(Integer, default=30)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        __import__("sqlalchemy").UniqueConstraint("company_id", "customer_code", name="uq_company_customer_code"),
    )

    # Relationships
    company = relationship("Company", back_populates="customers")
    sales_invoices = relationship("SalesInvoice", back_populates="customer")
