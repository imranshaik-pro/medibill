from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class SalesReturnItemCreate(BaseModel):
    sales_invoice_item_id: int
    quantity: int = Field(ge=1)
    disposition: Literal["SALEABLE", "DAMAGED", "EXPIRED"] = "SALEABLE"
    reason: str | None = None


class SalesReturnCreate(BaseModel):
    return_number: str = Field(min_length=1, max_length=50)
    return_date: date
    sales_invoice_id: int
    reason: str | None = None
    items: list[SalesReturnItemCreate] = Field(min_length=1)


class SalesReturnItemResponse(BaseModel):
    id: int
    sales_invoice_item_id: int
    product_id: int
    batch_id: int
    quantity: int
    disposition: str
    taxable_amount: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    net_amount: Decimal
    reason: str | None = None
    class Config:
        from_attributes = True


class SalesReturnResponse(BaseModel):
    id: int
    company_id: int
    return_number: str
    return_date: date
    sales_invoice_id: int
    customer_id: int
    taxable_total: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    grand_total: Decimal
    reason: str | None = None
    created_by: int
    created_at: datetime
    items: list[SalesReturnItemResponse] = []
    class Config:
        from_attributes = True


class PurchaseReturnItemCreate(BaseModel):
    purchase_invoice_item_id: int
    quantity: int = Field(ge=1)
    free_quantity: int = Field(default=0, ge=0)
    reason: str | None = None


class PurchaseReturnCreate(BaseModel):
    return_number: str = Field(min_length=1, max_length=50)
    return_date: date
    purchase_invoice_id: int
    reason: str | None = None
    items: list[PurchaseReturnItemCreate] = Field(min_length=1)


class PurchaseReturnItemResponse(BaseModel):
    id: int
    purchase_invoice_item_id: int
    product_id: int
    batch_id: int
    quantity: int
    free_quantity: int = 0
    taxable_amount: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    net_amount: Decimal
    reason: str | None = None
    class Config:
        from_attributes = True


class PurchaseReturnResponse(BaseModel):
    id: int
    company_id: int
    return_number: str
    return_date: date
    purchase_invoice_id: int
    supplier_id: int
    taxable_total: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    grand_total: Decimal
    reason: str | None = None
    created_by: int
    created_at: datetime
    items: list[PurchaseReturnItemResponse] = []
    class Config:
        from_attributes = True
