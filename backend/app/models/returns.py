from datetime import datetime, date

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class SalesReturn(Base):
    __tablename__ = "sales_returns"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    return_number = Column(String(50), nullable=False)
    return_date = Column(Date, nullable=False, default=date.today)
    sales_invoice_id = Column(Integer, ForeignKey("sales_invoices.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    taxable_total = Column(Numeric(14, 2), nullable=False, default=0)
    cgst = Column(Numeric(14, 2), nullable=False, default=0)
    sgst = Column(Numeric(14, 2), nullable=False, default=0)
    igst = Column(Numeric(14, 2), nullable=False, default=0)
    grand_total = Column(Numeric(14, 2), nullable=False, default=0)
    reason = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        __import__("sqlalchemy").UniqueConstraint("company_id", "return_number", name="uq_company_sales_return_number"),
    )

    invoice = relationship("SalesInvoice")
    customer = relationship("Customer")
    items = relationship("SalesReturnItem", back_populates="sales_return", cascade="all, delete-orphan")


class SalesReturnItem(Base):
    __tablename__ = "sales_return_items"

    id = Column(Integer, primary_key=True, index=True)
    sales_return_id = Column(Integer, ForeignKey("sales_returns.id"), nullable=False, index=True)
    sales_invoice_item_id = Column(Integer, ForeignKey("sales_invoice_items.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    disposition = Column(String(20), nullable=False, default="SALEABLE")
    taxable_amount = Column(Numeric(14, 2), nullable=False)
    cgst = Column(Numeric(14, 2), nullable=False, default=0)
    sgst = Column(Numeric(14, 2), nullable=False, default=0)
    igst = Column(Numeric(14, 2), nullable=False, default=0)
    net_amount = Column(Numeric(14, 2), nullable=False)
    reason = Column(Text)

    sales_return = relationship("SalesReturn", back_populates="items")
    invoice_item = relationship("SalesInvoiceItem")
    product = relationship("Product")
    batch = relationship("Batch")


class PurchaseReturn(Base):
    __tablename__ = "purchase_returns"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    return_number = Column(String(50), nullable=False)
    return_date = Column(Date, nullable=False, default=date.today)
    purchase_invoice_id = Column(Integer, ForeignKey("purchase_invoices.id"), nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False, index=True)
    taxable_total = Column(Numeric(14, 2), nullable=False, default=0)
    cgst = Column(Numeric(14, 2), nullable=False, default=0)
    sgst = Column(Numeric(14, 2), nullable=False, default=0)
    igst = Column(Numeric(14, 2), nullable=False, default=0)
    grand_total = Column(Numeric(14, 2), nullable=False, default=0)
    reason = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        __import__("sqlalchemy").UniqueConstraint("company_id", "return_number", name="uq_company_purchase_return_number"),
    )

    invoice = relationship("PurchaseInvoice")
    supplier = relationship("Supplier")
    items = relationship("PurchaseReturnItem", back_populates="purchase_return", cascade="all, delete-orphan")


class PurchaseReturnItem(Base):
    __tablename__ = "purchase_return_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_return_id = Column(Integer, ForeignKey("purchase_returns.id"), nullable=False, index=True)
    purchase_invoice_item_id = Column(Integer, ForeignKey("purchase_invoice_items.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    taxable_amount = Column(Numeric(14, 2), nullable=False)
    cgst = Column(Numeric(14, 2), nullable=False, default=0)
    sgst = Column(Numeric(14, 2), nullable=False, default=0)
    igst = Column(Numeric(14, 2), nullable=False, default=0)
    net_amount = Column(Numeric(14, 2), nullable=False)
    reason = Column(Text)

    purchase_return = relationship("PurchaseReturn", back_populates="items")
    invoice_item = relationship("PurchaseInvoiceItem")
    product = relationship("Product")
    batch = relationship("Batch")
