from sqlalchemy import Column, Integer, DateTime, ForeignKey, Numeric, Date
from sqlalchemy.orm import relationship
from datetime import datetime, date
from app.db.base import Base


class CustomerProductPrice(Base):
    """Customer-specific product pricing."""

    __tablename__ = "customer_product_prices"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    last_sold_price = Column(Numeric(12, 2))
    last_sold_mrp = Column(Numeric(12, 2))
    last_discount_percent = Column(Numeric(5, 2))
    last_discount_amount = Column(Numeric(12, 2))
    last_sold_date = Column(Date)
    last_invoice_id = Column(Integer, ForeignKey("sales_invoices.id"))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        __import__("sqlalchemy").UniqueConstraint("company_id", "customer_id", "product_id", name="uq_company_customer_product"),
    )

    # Relationships
    customer = relationship("Customer", back_populates="product_prices")


class CustomerProductPriceHistory(Base):
    """Historical customer-product pricing."""

    __tablename__ = "customer_product_price_history"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    sales_invoice_id = Column(Integer, ForeignKey("sales_invoices.id"), nullable=False)
    mrp = Column(Numeric(12, 2), nullable=False)
    selling_price = Column(Numeric(12, 2), nullable=False)
    discount_percent = Column(Numeric(5, 2))
    discount_amount = Column(Numeric(12, 2))
    sold_date = Column(Date, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
