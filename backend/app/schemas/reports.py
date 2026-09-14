from datetime import date
from decimal import Decimal
from pydantic import BaseModel


class InventoryIntelligenceRow(BaseModel):
    product_id: int
    product_code: str
    product_name: str
    batch_id: int
    batch_number: str
    expiry_date: date
    days_to_expiry: int
    quantity_available: int
    purchase_rate: Decimal
    stock_value: Decimal
    reorder_level: int
    product_available: int
    reorder_suggested: int
    units_sold_30d: int
    last_sale_date: date | None = None
    movement_class: str


class SalesRegisterRow(BaseModel):
    invoice_id: int
    invoice_date: date
    invoice_number: str
    customer_name: str
    billed_units: int
    free_units: int
    taxable_total: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    gross_invoice: Decimal
    returns: Decimal
    net_sales: Decimal


class PurchaseRegisterRow(BaseModel):
    invoice_id: int
    purchase_date: date
    purchase_number: str
    supplier_name: str
    paid_units: int
    free_units: int
    taxable_total: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    gross_purchase: Decimal
    returns: Decimal
    net_purchase: Decimal


class ProductPerformanceRow(BaseModel):
    product_id: int
    product_code: str
    product_name: str
    billed_units: int
    free_units: int
    net_sales: Decimal


class CustomerPerformanceRow(BaseModel):
    customer_id: int
    customer_name: str
    invoice_count: int
    net_sales: Decimal
