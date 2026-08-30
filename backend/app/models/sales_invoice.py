from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Date, Text
from sqlalchemy.orm import relationship
from datetime import datetime, date
from app.db.base import Base


class SalesInvoice(Base):
    """Sales invoice header."""

    __tablename__ = "sales_invoices"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    invoice_number = Column(String(50), nullable=False)
    invoice_date = Column(Date, nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    subtotal = Column(Numeric(14, 2), nullable=False)
    discount_total = Column(Numeric(14, 2), default=0)
    taxable_total = Column(Numeric(14, 2), nullable=False)
    cgst = Column(Numeric(14, 2), default=0)
    sgst = Column(Numeric(14, 2), default=0)
    igst = Column(Numeric(14, 2), default=0)
    round_off = Column(Numeric(14, 2), default=0)
    grand_total = Column(Numeric(14, 2), nullable=False)
    payment_status = Column(String(50), default="Pending", index=True)
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        __import__("sqlalchemy").UniqueConstraint("company_id", "invoice_number", name="uq_company_invoice_number"),
    )

    # Relationships
    company = relationship("Company", back_populates="sales_invoices")
    customer = relationship("Customer", back_populates="sales_invoices")
    items = relationship("SalesInvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="sales_invoice")


class SalesInvoiceItem(Base):
    """Sales invoice item line."""

    __tablename__ = "sales_invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    sales_invoice_id = Column(Integer, ForeignKey("sales_invoices.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    mrp = Column(Numeric(12, 2), nullable=False)
    selling_price = Column(Numeric(12, 2), nullable=False)
    discount_percent = Column(Numeric(5, 2), default=0)
    discount_amount = Column(Numeric(12, 2), default=0)
    taxable_amount = Column(Numeric(14, 2), nullable=False)
    gst_rate = Column(Numeric(5, 2), nullable=False)
    cgst = Column(Numeric(14, 2), default=0)
    sgst = Column(Numeric(14, 2), default=0)
    igst = Column(Numeric(14, 2), default=0)
    net_amount = Column(Numeric(14, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    invoice = relationship("SalesInvoice", back_populates="items")
