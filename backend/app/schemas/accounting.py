from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class SupplierPaymentCreate(BaseModel):
    supplier_id: int
    purchase_invoice_id: int | None = None
    amount: Decimal = Field(gt=0, decimal_places=2, max_digits=14)
    payment_date: date
    payment_mode: Literal["CASH", "UPI", "CARD", "BANK", "CHEQUE"]
    reference_number: str | None = Field(default=None, max_length=100)
    notes: str | None = None


class SupplierPaymentResponse(SupplierPaymentCreate):
    id: int
    company_id: int
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True


class SupplierLedgerRow(BaseModel):
    entry_date: date
    entry_type: str
    reference: str
    debit: Decimal
    credit: Decimal
    balance: Decimal


class SupplierLedgerSummary(BaseModel):
    supplier_id: int
    supplier_code: str
    supplier_name: str
    total_purchases: Decimal
    total_returns: Decimal
    total_payments: Decimal
    outstanding: Decimal
    rows: list[SupplierLedgerRow]


class GstSummary(BaseModel):
    taxable_sales: Decimal
    sales_cgst: Decimal
    sales_sgst: Decimal
    sales_igst: Decimal
    sales_gst_total: Decimal
    sales_returns_taxable: Decimal
    sales_returns_cgst: Decimal
    sales_returns_sgst: Decimal
    sales_returns_igst: Decimal
    taxable_purchases: Decimal
    purchase_cgst: Decimal
    purchase_sgst: Decimal
    purchase_igst: Decimal
    purchase_gst_total: Decimal
    purchase_returns_taxable: Decimal
    purchase_returns_cgst: Decimal
    purchase_returns_sgst: Decimal
    purchase_returns_igst: Decimal
    net_output_gst: Decimal
    net_input_gst: Decimal
    estimated_net_gst_payable: Decimal
