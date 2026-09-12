from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class ReceivableCustomerSummary(BaseModel):
    customer_id: int
    customer_code: str
    customer_name: str
    phone: str | None = None
    credit_limit: Decimal = Decimal("0")
    total_invoiced: Decimal = Decimal("0")
    total_paid: Decimal = Decimal("0")
    balance_due: Decimal = Decimal("0")
    open_invoices: int = 0


class ReceivableInvoiceRow(BaseModel):
    invoice_id: int
    invoice_number: str
    invoice_date: date
    grand_total: Decimal
    amount_paid: Decimal = Decimal("0")
    balance_due: Decimal = Decimal("0")
    payment_status: str


class CustomerLedgerResponse(BaseModel):
    customer: ReceivableCustomerSummary
    invoices: list[ReceivableInvoiceRow]
