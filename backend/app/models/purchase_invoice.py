from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Date, Text
from sqlalchemy.orm import relationship
from datetime import datetime, date
from app.db.base import Base


class PurchaseInvoice(Base):
    """Purchase invoice header."""

    __tablename__ = "purchase_invoices"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    purchase_number = Column(String(50), nullable=False)
    purchase_date = Column(Date, nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    subtotal = Column(Numeric(14, 2), nullable=False)
    discount_total = Column(Numeric(14, 2), default=0)
    taxable_total = Column(Numeric(14, 2), nullable=False)
    cgst = Column(Numeric(14, 2), default=0)
    sgst = Column(Numeric(14, 2), default=0)
    igst = Column(Numeric(14, 2), default=0)
    round_off = Column(Numeric(14, 2), default=0)
    grand_total = Column(Numeric(14, 2), nullable=False)
    payment_status = Column(String(50), default="Pending")
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        __import__("sqlalchemy").UniqueConstraint("company_id", "purchase_number", name="uq_company_purchase_number"),
    )

    # Relationships
    company = relationship("Company", back_populates="purchase_invoices")
    supplier = relationship("Supplier", back_populates="purchase_invoices")
    items = relationship("PurchaseInvoiceItem", back_populates="invoice", cascade="all, delete-orphan")


class PurchaseInvoiceItem(Base):
    """Purchase invoice item line."""

    __tablename__ = "purchase_invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_invoice_id = Column(Integer, ForeignKey("purchase_invoices.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    mrp = Column(Numeric(12, 2), nullable=False)
    purchase_rate = Column(Numeric(12, 2), nullable=False)
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
    invoice = relationship("PurchaseInvoice", back_populates="items")
