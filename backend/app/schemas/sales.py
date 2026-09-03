from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class SalesItemCreate(BaseModel):
    product_id: int
    batch_id: int
    quantity: int = Field(ge=1)
    selling_price: Decimal = Field(ge=0, decimal_places=2, max_digits=12)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100, decimal_places=2, max_digits=5)
    gst_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100, decimal_places=2, max_digits=5)


class SalesInvoiceCreate(BaseModel):
    invoice_number: str = Field(min_length=1, max_length=50)
    invoice_date: date
    customer_id: int
    tax_mode: Literal["INTRA_STATE", "INTER_STATE"] = "INTRA_STATE"
    payment_mode: Literal["CASH", "UPI", "CARD", "BANK", "CREDIT"] = "CREDIT"
    amount_paid: Decimal = Field(default=Decimal("0"), ge=0, decimal_places=2, max_digits=14)
    payment_reference: str | None = Field(default=None, max_length=100)
    items: list[SalesItemCreate] = Field(min_length=1)
    notes: str | None = None

    @model_validator(mode="after")
    def validate_payment(self):
        if self.payment_mode == "CREDIT" and self.amount_paid > 0:
            raise ValueError("Credit invoices cannot have an amount paid at posting")
        return self


class SalesItemResponse(BaseModel):
    id: int
    product_id: int
    batch_id: int
    quantity: int
    mrp: Decimal
    selling_price: Decimal
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


class SalesInvoiceResponse(BaseModel):
    id: int
    company_id: int
    invoice_number: str
    invoice_date: date
    customer_id: int
    subtotal: Decimal
    discount_total: Decimal
    taxable_total: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    round_off: Decimal
    grand_total: Decimal
    payment_status: str
    amount_paid: Decimal = Decimal("0")
    balance_due: Decimal = Decimal("0")
    notes: str | None
    created_by: int
    created_at: datetime
    updated_at: datetime
    customer_name: str | None = None
    items: list[SalesItemResponse] = []

    class Config:
        from_attributes = True


class PaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0, decimal_places=2, max_digits=14)
    payment_date: date
    payment_mode: Literal["CASH", "UPI", "CARD", "BANK"]
    reference_number: str | None = Field(default=None, max_length=100)
    notes: str | None = None
