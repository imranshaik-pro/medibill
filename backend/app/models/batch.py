from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Date, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base import Base


class Batch(Base):
    """Product Batch model."""

    __tablename__ = "batches"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    batch_number = Column(String(50), nullable=False)
    manufacturing_date = Column(Date)
    expiry_date = Column(Date, nullable=False, index=True)
    mrp = Column(Numeric(12, 2), nullable=False)
    purchase_rate = Column(Numeric(12, 2), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        __import__("sqlalchemy").UniqueConstraint(
            "company_id", "product_id", "batch_number", name="uq_company_product_batch"
        ),
    )

    company = relationship("Company", back_populates="batches")
    product = relationship("Product", back_populates="batches")
    inventory_transactions = relationship("InventoryTransaction", back_populates="batch")
    current_stock = relationship("CurrentStock", back_populates="batch", uselist=False)
