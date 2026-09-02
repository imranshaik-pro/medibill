from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, EmailStr, Field, model_validator


class SupplierCreate(BaseModel):
    supplier_code: str = Field(min_length=1, max_length=50)
    supplier_name: str = Field(min_length=1, max_length=255)
    contact_person: str | None = None
    phone: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    address: str | None = None
    gstin: str | None = Field(default=None, min_length=0, max_length=15)
    credit_days: int = Field(default=30, ge=0)
    credit_limit: str | None = Field(default=None, max_length=20)
    is_active: bool = True


class SupplierUpdate(BaseModel):
    supplier_name: str | None = Field(default=None, min_length=1, max_length=255)
    contact_person: str | None = None
    phone: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    address: str | None = None
    gstin: str | None = Field(default=None, min_length=0, max_length=15)
    credit_days: int | None = Field(default=None, ge=0)
    credit_limit: str | None = Field(default=None, max_length=20)
    is_active: bool | None = None


class SupplierResponse(SupplierCreate):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PurchaseItemCreate(BaseModel):
    product_id: int
    batch_number: str = Field(min_length=1, max_length=50)
    manufacturing_date: date | None = None
    expiry_date: date
    quantity: int = Field(ge=1)
    mrp: Decimal = Field(ge=0, decimal_places=2, max_digits=12)
    purchase_rate: Decimal = Field(ge=0, decimal_places=2, max_digits=12)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100, decimal_places=2, max_digits=5)
    gst_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100, decimal_places=2, max_digits=5)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.manufacturing_date and self.expiry_date < self.manufacturing_date:
            raise ValueError("Expiry date cannot be before manufacturing date")
        return self


class PurchaseInvoiceCreate(BaseModel):
    purchase_number: str = Field(min_length=1, max_length=50)
    purchase_date: date
    supplier_id: int
    tax_mode: Literal["INTRA_STATE", "INTER_STATE"] = "INTRA_STATE"
    items: list[PurchaseItemCreate] = Field(min_length=1)
    notes: str | None = None


class PurchaseItemResponse(BaseModel):
    id: int
    product_id: int
    batch_id: int
    quantity: int
    mrp: Decimal
    purchase_rate: Decimal
    discount_percent: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    gst_rate: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    net_amount: Decimal
    batch_number: str | None = None
    product_name: str | None = None

    class Config:
        from_attributes = True


class PurchaseInvoiceResponse(BaseModel):
    id: int
    company_id: int
    purchase_number: str
    purchase_date: date
    supplier_id: int
    subtotal: Decimal
    discount_total: Decimal
    taxable_total: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    round_off: Decimal
    grand_total: Decimal
    payment_status: str
    notes: str | None
    created_by: int
    created_at: datetime
    updated_at: datetime
    supplier_name: str | None = None
    items: list[PurchaseItemResponse] = []

    class Config:
        from_attributes = True
