"""Application constants."""

# Transaction Types
class TransactionType:
    OPENING = "OPENING"
    PURCHASE = "PURCHASE"
    SALE = "SALE"
    PURCHASE_RETURN = "PURCHASE_RETURN"
    SALES_RETURN = "SALES_RETURN"
    ADJUSTMENT = "ADJUSTMENT"
    DAMAGE = "DAMAGE"
    EXPIRY = "EXPIRY"


# Payment Status
class PaymentStatus:
    PENDING = "Pending"
    PARTIAL = "Partial"
    PAID = "Paid"
    CANCELLED = "Cancelled"


# Payment Modes
class PaymentMode:
    CASH = "Cash"
    UPI = "UPI"
    CREDIT = "Credit"
    BANK_TRANSFER = "Bank Transfer"
    CHEQUE = "Cheque"
    CARD = "Card"
    OTHER = "Other"


# Roles
class Role:
    ADMIN = "Admin"
    MANAGER = "Manager"
    BILLING_OPERATOR = "Billing Operator"
    INVENTORY_OPERATOR = "Inventory Operator"
    ACCOUNTS = "Accounts"
    VIEWER = "Viewer"


# Invoice Statuses
class InvoiceStatus:
    DRAFT = "Draft"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"
