from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, func
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base import Base


class Company(Base):
    """Company model."""

    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String(255), nullable=False)
    legal_name = Column(String(255))
    address = Column(Text)
    city = Column(String(100))
    state = Column(String(100))
    pincode = Column(String(10))
    phone = Column(String(20))
    email = Column(String(255))
    gstin = Column(String(15))
    drug_license_number = Column(String(50))
    logo_path = Column(String(255))
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    users = relationship("User", back_populates="company")
    customers = relationship("Customer", back_populates="company")
    products = relationship("Product", back_populates="company")
    suppliers = relationship("Supplier", back_populates="company")
    manufacturers = relationship("Manufacturer", back_populates="company")
    categories = relationship("Category", back_populates="company")
    batches = relationship("Batch", back_populates="company")
    inventory_transactions = relationship("InventoryTransaction", back_populates="company")
    current_stock = relationship("CurrentStock", back_populates="company")
    sales_invoices = relationship("SalesInvoice", back_populates="company")
    purchase_invoices = relationship("PurchaseInvoice", back_populates="company")
    payments = relationship("Payment", back_populates="company")
    audit_logs = relationship("AuditLog", back_populates="company")
    company_settings = relationship(
        "CompanySettings", back_populates="company", uselist=False
    )
