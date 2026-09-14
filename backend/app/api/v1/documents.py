from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import get_current_user, require_permission
from app.db.session import get_db
from app.models.batch import Batch
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.customer import Customer
from app.models.manufacturer import Manufacturer
from app.models.payment import Payment
from app.models.product import Product
from app.models.sales_invoice import SalesInvoice
from app.models.user import User
from app.schemas.documents import (
    CompanyDocumentProfile,
    DocumentSettingsUpdate,
    InvoiceDocument,
    InvoiceDocumentLine,
)

router = APIRouter()
Q = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(value or 0).quantize(Q, rounding=ROUND_HALF_UP)


ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _under_100(n: int) -> str:
    if n < 20:
        return ONES[n]
    return f"{TENS[n // 10]} {ONES[n % 10]}".strip()


def _under_1000(n: int) -> str:
    if n < 100:
        return _under_100(n)
    rest = n % 100
    return f"{ONES[n // 100]} Hundred{' ' + _under_100(rest) if rest else ''}".strip()


def _integer_words_indian(n: int) -> str:
    if n == 0:
        return "Zero"
    parts: list[str] = []
    crore, n = divmod(n, 10_000_000)
    lakh, n = divmod(n, 100_000)
    thousand, n = divmod(n, 1_000)
    if crore:
        parts.append(f"{_integer_words_indian(crore)} Crore")
    if lakh:
        parts.append(f"{_under_1000(lakh)} Lakh")
    if thousand:
        parts.append(f"{_under_1000(thousand)} Thousand")
    if n:
        parts.append(_under_1000(n))
    return " ".join(parts)


def amount_in_words(value: Decimal) -> str:
    value = money(value)
    rupees = int(value)
    paise = int((value - Decimal(rupees)) * 100)
    text = f"{_integer_words_indian(rupees)} Rupees"
    if paise:
        text += f" and {_under_100(paise)} Paise"
    return f"{text} Only"


def _settings(db: Session, company_id: int) -> CompanySettings:
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        settings = CompanySettings(company_id=company_id, invoice_prefix="INV", next_invoice_number=1, currency="INR", selected_invoice_template="PHARMA_A4")
        db.add(settings)
        db.flush()
    return settings


def _profile(company: Company, settings: CompanySettings) -> CompanyDocumentProfile:
    return CompanyDocumentProfile(
        company_name=company.company_name,
        legal_name=company.legal_name,
        address=company.address,
        city=company.city,
        state=company.state,
        state_code=settings.state_code,
        pincode=company.pincode,
        phone=company.phone,
        email=company.email,
        gstin=company.gstin,
        drug_license_20b=settings.drug_license_20b or company.drug_license_number,
        drug_license_21b=settings.drug_license_21b,
        bank_name=settings.bank_name,
        bank_account_number=settings.bank_account_number,
        bank_branch=settings.bank_branch,
        bank_ifsc=settings.bank_ifsc,
        invoice_terms=settings.invoice_terms,
        jurisdiction=settings.jurisdiction,
        authorized_signatory=settings.authorized_signatory,
        selected_invoice_template=settings.selected_invoice_template or "PHARMA_A4",
    )


@router.get("/settings", response_model=CompanyDocumentProfile)
def get_document_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return _profile(company, _settings(db, current_user.company_id))


@router.put("/settings", response_model=CompanyDocumentProfile)
def update_document_settings(
    data: DocumentSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_inventory")),
):
    company = db.query(Company).filter(Company.id == current_user.company_id).with_for_update().first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    settings = _settings(db, current_user.company_id)
    payload = data.model_dump(exclude_unset=True)
    company_map = {
        "company_address": "address", "company_city": "city", "company_state": "state",
        "company_pincode": "pincode", "company_phone": "phone", "company_email": "email",
        "company_gstin": "gstin",
    }
    settings_map = {
        "company_state_code": "state_code", "drug_license_20b": "drug_license_20b",
        "drug_license_21b": "drug_license_21b", "bank_name": "bank_name",
        "bank_account_number": "bank_account_number", "bank_branch": "bank_branch",
        "bank_ifsc": "bank_ifsc", "invoice_terms": "invoice_terms", "jurisdiction": "jurisdiction",
        "authorized_signatory": "authorized_signatory", "selected_invoice_template": "selected_invoice_template",
    }
    for key, attr in company_map.items():
        if key in payload:
            setattr(company, attr, payload[key])
    for key, attr in settings_map.items():
        if key in payload:
            setattr(settings, attr, payload[key])
    db.commit(); db.refresh(company); db.refresh(settings)
    return _profile(company, settings)


@router.get("/sales-invoices/{invoice_id}", response_model=InvoiceDocument)
def get_sales_invoice_document(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = db.query(SalesInvoice).options(
        joinedload(SalesInvoice.customer), joinedload(SalesInvoice.items)
    ).filter(
        SalesInvoice.id == invoice_id,
        SalesInvoice.company_id == current_user.company_id,
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Sales invoice not found")

    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    settings = _settings(db, current_user.company_id)
    customer: Customer = invoice.customer
    product_ids = {x.product_id for x in invoice.items}
    batch_ids = {x.batch_id for x in invoice.items}
    products = {p.id: p for p in db.query(Product).options(joinedload(Product.manufacturer)).filter(Product.id.in_(product_ids)).all()} if product_ids else {}
    batches = {b.id: b for b in db.query(Batch).filter(Batch.id.in_(batch_ids)).all()} if batch_ids else {}

    payment_rows = db.query(Payment).filter(
        Payment.company_id == current_user.company_id,
        Payment.sales_invoice_id == invoice.id,
    ).order_by(Payment.payment_date, Payment.id).all()
    amount_paid = money(sum((Decimal(p.amount) for p in payment_rows), Decimal("0")))
    balance_due = money(max(Decimal("0"), Decimal(invoice.grand_total) - amount_paid))
    pay_type = "Credit" if not payment_rows else payment_rows[0].payment_mode.title()
    if amount_paid < money(invoice.grand_total):
        pay_type = "Credit" if amount_paid == 0 else f"Partial / {pay_type}"

    gst_summary: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    lines: list[InvoiceDocumentLine] = []
    for index, item in enumerate(invoice.items, start=1):
        product = products.get(item.product_id)
        batch = batches.get(item.batch_id)
        if not product or not batch:
            continue
        gst_summary[f"{money(item.gst_rate)}%"] += money((item.cgst or 0) + (item.sgst or 0) + (item.igst or 0))
        pack = f"{product.pack_size} {product.unit}" if product.pack_size else product.unit
        lines.append(InvoiceDocumentLine(
            sno=index,
            product_name=product.product_name,
            hsn_code=product.hsn_code,
            pack=pack,
            manufacturer=product.manufacturer.name if product.manufacturer else None,
            batch_number=batch.batch_number,
            expiry_date=batch.expiry_date,
            quantity=item.quantity,
            free_quantity=getattr(item, "free_quantity", 0) or 0,
            discount_percent=money(item.discount_percent),
            rate=money(item.selling_price),
            mrp=money(item.mrp),
            gst_rate=money(item.gst_rate),
            taxable_amount=money(item.taxable_amount),
            cgst=money(item.cgst), sgst=money(item.sgst), igst=money(item.igst),
            net_amount=money(item.net_amount),
        ))

    return InvoiceDocument(
        invoice_id=invoice.id,
        invoice_number=invoice.invoice_number,
        invoice_date=invoice.invoice_date,
        pay_type=pay_type,
        company=_profile(company, settings),
        customer_name=customer.business_name or customer.customer_name,
        customer_address=customer.billing_address,
        customer_phone=customer.phone,
        customer_gstin=customer.gstin,
        customer_drug_license=customer.drug_license_number,
        customer_state=customer.state,
        customer_state_code=customer.state_code,
        lines=lines,
        subtotal=money(invoice.subtotal),
        discount_total=money(invoice.discount_total),
        taxable_total=money(invoice.taxable_total),
        cgst=money(invoice.cgst), sgst=money(invoice.sgst), igst=money(invoice.igst),
        total_gst=money((invoice.cgst or 0) + (invoice.sgst or 0) + (invoice.igst or 0)),
        round_off=money(invoice.round_off),
        grand_total=money(invoice.grand_total),
        amount_paid=amount_paid,
        balance_due=balance_due,
        amount_in_words=amount_in_words(Decimal(invoice.grand_total)),
        gst_rate_summary={k: money(v) for k, v in gst_summary.items()},
        notes=invoice.notes,
    )
