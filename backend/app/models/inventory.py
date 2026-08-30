from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Date
from sqlalchemy.orm import relationship
from datetime import datetime, date
from app.db.base import Base


class InventoryTransaction(Base):
    """Inventory transaction ledger."""

    __tablename__ = "inventory_transactions"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    transaction_type = Column(String(50), nullable=False)
    reference_type = Column(String(50))
    reference_id = Column(Integer)
    quantity = Column(Integer, nullable=False)
    unit_cost = Column(Numeric(12, 2))
    transaction_date = Column(Date, nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    company = relationship("Company", back_populates="inventory_transactions")
    product = relationship("Product", back_populates="inventory_transactions")
    batch = relationship("Batch", back_populates="inventory_transactions")


class CurrentStock(Base):
    """Current stock position."""

    __tablename__ = "current_stock"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    quantity_on_hand = Column(Integer, default=0)
    quantity_reserved = Column(Integer, default=0)
    quantity_available = Column(Integer, default=0)
    last_stock_date = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        __import__("sqlalchemy").UniqueConstraint("company_id", "product_id", "batch_id", name="uq_company_product_batch_stock"),
    )

    # Relationships
    company = relationship("Company", back_populates="current_stock")
    product = relationship("Product", back_populates="current_stock")
    batch = relationship("Batch", back_populates="current_stock")
