"""Import all SQLAlchemy models so they are registered in Base.metadata."""

from app.models.company import Company
from app.models.user import User, Role, Permission, UserRole
from app.models.customer import Customer
from app.models.product import Product
from app.models.supplier import Supplier
from app.models.manufacturer import Manufacturer
from app.models.category import Category
from app.models.batch import Batch
from app.models.inventory import InventoryTransaction, CurrentStock
from app.models.sales_invoice import SalesInvoice, SalesInvoiceItem
from app.models.purchase_invoice import PurchaseInvoice, PurchaseInvoiceItem
from app.models.payment import Payment
from app.models.audit_log import AuditLog
from app.models.customer_price import CustomerProductPrice, CustomerProductPriceHistory
from app.models.company_settings import CompanySettings

__all__ = [
    "Company", "User", "Role", "Permission", "UserRole", "Customer", "Product",
    "Supplier", "Manufacturer", "Category", "Batch", "InventoryTransaction",
    "CurrentStock", "SalesInvoice", "SalesInvoiceItem", "PurchaseInvoice",
    "PurchaseInvoiceItem", "Payment", "AuditLog", "CustomerProductPrice",
    "CustomerProductPriceHistory", "CompanySettings",
]
