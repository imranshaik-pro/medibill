from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base import Base


class Product(Base):
    """Product model."""

    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    product_code = Column(String(50), nullable=False)
    product_name = Column(String(255), nullable=False)
    generic_name = Column(String(255))
    brand_name = Column(String(255))
    manufacturer_id = Column(Integer, ForeignKey("manufacturers.id"))
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    hsn_code = Column(String(20))
    gst_rate = Column(Numeric(5, 2), default=0)
    unit = Column(String(50), default="Piece")
    pack_size = Column(Integer, default=1)
    default_mrp = Column(Numeric(12, 2))
    default_selling_price = Column(Numeric(12, 2))
    reorder_level = Column(Integer, default=50)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        __import__("sqlalchemy").UniqueConstraint("company_id", "product_code", name="uq_company_product_code"),
    )

    # Relationships
    company = relationship("Company", back_populates="products")
    category = relationship("Category", back_populates="products")
    manufacturer = relationship("Manufacturer", back_populates="products")
    batches = relationship("Batch", back_populates="product")
    inventory_transactions = relationship("InventoryTransaction", back_populates="product")
    current_stock = relationship("CurrentStock", back_populates="product")
