from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Date, Text
from sqlalchemy.orm import relationship
from datetime import datetime, date
from app.db.base import Base


class Payment(Base):
    """Payment model."""

    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    sales_invoice_id = Column(Integer, ForeignKey("sales_invoices.id"))
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    payment_date = Column(Date, nullable=False, index=True)
    payment_mode = Column(String(50), nullable=False)
    reference_number = Column(String(100))
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    company = relationship("Company", back_populates="payments")
    sales_invoice = relationship("SalesInvoice", back_populates="payments")
