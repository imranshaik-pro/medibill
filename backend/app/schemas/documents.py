from datetime import date
from decimal import Decimal
from pydantic import BaseModel, Field


class DocumentSettingsUpdate(BaseModel):
    company_address: str | None = None
    company_city: str | None = Field(default=None, max_length=100)
    company_state: str | None = Field(default=None, max_length=100)
    company_state_code: str | None = Field(default=None, max_length=10)
    company_pincode: str | None = Field(default=None, max_length=10)
    company_phone: str | None = Field(default=None, max_length=20)
    company_email: str | None = Field(default=None, max_length=255)
    company_gstin: str | None = Field(default=None, max_length=15)
    drug_license_20b: str | None = Field(default=None, max_length=100)
    drug_license_21b: str | None = Field(default=None, max_length=100)
    bank_name: str | None = Field(default=None, max_length=120)
    bank_account_number: str | None = Field(default=None, max_length=80)
    bank_branch: str | None = Field(default=None, max_length=160)
    bank_ifsc: str | None = Field(default=None, max_length=30)
    invoice_terms: str | None = None
    jurisdiction: str | None = Field(default=None, max_length=160)
    authorized_signatory: str | None = Field(default=None, max_length=160)
    selected_invoice_template: str | None = Field(default=None, max_length=100)


class CompanyDocumentProfile(BaseModel):
    company_name: str
    legal_name: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    state_code: str | None = None
    pincode: str | None = None
    phone: str | None = None
    email: str | None = None
    gstin: str | None = None
    drug_license_20b: str | None = None
    drug_license_21b: str | None = None
    bank_name: str | None = None
    bank_account_number: str | None = None
    bank_branch: str | None = None
    bank_ifsc: str | None = None
    invoice_terms: str | None = None
    jurisdiction: str | None = None
    authorized_signatory: str | None = None
    selected_invoice_template: str | None = None


class InvoiceDocumentLine(BaseModel):
    sno: int
    product_name: str
    hsn_code: str | None = None
    pack: str | None = None
    manufacturer: str | None = None
    batch_number: str
    expiry_date: date
    quantity: int
    free_quantity: int = 0
    discount_percent: Decimal
    rate: Decimal
    mrp: Decimal
    gst_rate: Decimal
    taxable_amount: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    net_amount: Decimal


class InvoiceDocument(BaseModel):
    invoice_id: int
    invoice_number: str
    invoice_date: date
    pay_type: str
    company: CompanyDocumentProfile
    customer_name: str
    customer_address: str | None = None
    customer_phone: str | None = None
    customer_gstin: str | None = None
    customer_drug_license: str | None = None
    customer_state: str | None = None
    customer_state_code: str | None = None
    lines: list[InvoiceDocumentLine]
    subtotal: Decimal
    discount_total: Decimal
    taxable_total: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    total_gst: Decimal
    round_off: Decimal
    grand_total: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    amount_in_words: str
    gst_rate_summary: dict[str, Decimal]
    notes: str | None = None
