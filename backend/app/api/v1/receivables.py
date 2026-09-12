from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.customer import Customer
from app.models.payment import Payment
from app.models.sales_invoice import SalesInvoice
from app.models.user import User
from app.schemas.receivables import (
    CustomerLedgerResponse,
    ReceivableCustomerSummary,
    ReceivableInvoiceRow,
)

router = APIRouter()
Q = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(value or 0).quantize(Q, rounding=ROUND_HALF_UP)


def _summary_maps(db: Session, company_id: int):
    invoice_rows = db.query(
        SalesInvoice.customer_id,
        func.coalesce(func.sum(SalesInvoice.grand_total), 0),
        func.coalesce(func.sum(func.case((SalesInvoice.payment_status != "Paid", 1), else_=0)), 0),
    ).filter(
        SalesInvoice.company_id == company_id,
    ).group_by(SalesInvoice.customer_id).all()

    payment_rows = db.query(
        Payment.customer_id,
        func.coalesce(func.sum(Payment.amount), 0),
    ).filter(
        Payment.company_id == company_id,
    ).group_by(Payment.customer_id).all()

    invoice_map = {
        row[0]: (money(row[1]), int(row[2] or 0))
        for row in invoice_rows
    }
    payment_map = {row[0]: money(row[1]) for row in payment_rows}
    return invoice_map, payment_map


@router.get("/customers", response_model=list[ReceivableCustomerSummary])
def list_customer_receivables(
    search: str | None = Query(default=None, max_length=100),
    outstanding_only: bool = True,
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Customer).filter(Customer.company_id == current_user.company_id)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            (Customer.customer_name.ilike(term))
            | (Customer.customer_code.ilike(term))
            | (Customer.phone.ilike(term))
        )

    invoice_map, payment_map = _summary_maps(db, current_user.company_id)
    rows: list[ReceivableCustomerSummary] = []
    for customer in query.order_by(Customer.customer_name).limit(limit).all():
        total_invoiced, open_invoices = invoice_map.get(customer.id, (Decimal("0"), 0))
        total_paid = payment_map.get(customer.id, Decimal("0"))
        balance_due = money(max(Decimal("0"), total_invoiced - total_paid))
        if outstanding_only and balance_due <= 0:
            continue
        rows.append(
            ReceivableCustomerSummary(
                customer_id=customer.id,
                customer_code=customer.customer_code,
                customer_name=customer.customer_name,
                phone=customer.phone,
                credit_limit=money(customer.credit_limit),
                total_invoiced=total_invoiced,
                total_paid=total_paid,
                balance_due=balance_due,
                open_invoices=open_invoices,
            )
        )
    return rows


@router.get("/customers/{customer_id}", response_model=CustomerLedgerResponse)
def get_customer_ledger(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == current_user.company_id,
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    invoices = db.query(SalesInvoice).filter(
        SalesInvoice.company_id == current_user.company_id,
        SalesInvoice.customer_id == customer_id,
    ).order_by(SalesInvoice.invoice_date.desc(), SalesInvoice.id.desc()).all()

    payment_rows = db.query(
        Payment.sales_invoice_id,
        func.coalesce(func.sum(Payment.amount), 0),
    ).filter(
        Payment.company_id == current_user.company_id,
        Payment.customer_id == customer_id,
        Payment.sales_invoice_id.isnot(None),
    ).group_by(Payment.sales_invoice_id).all()
    paid_by_invoice = {row[0]: money(row[1]) for row in payment_rows}

    invoice_rows: list[ReceivableInvoiceRow] = []
    total_invoiced = Decimal("0")
    total_paid = Decimal("0")
    open_invoices = 0
    for invoice in invoices:
        paid = paid_by_invoice.get(invoice.id, Decimal("0"))
        balance = money(max(Decimal("0"), Decimal(invoice.grand_total) - paid))
        total_invoiced += Decimal(invoice.grand_total)
        total_paid += paid
        if balance > 0:
            open_invoices += 1
        invoice_rows.append(
            ReceivableInvoiceRow(
                invoice_id=invoice.id,
                invoice_number=invoice.invoice_number,
                invoice_date=invoice.invoice_date,
                grand_total=money(invoice.grand_total),
                amount_paid=paid,
                balance_due=balance,
                payment_status=invoice.payment_status,
            )
        )

    summary = ReceivableCustomerSummary(
        customer_id=customer.id,
        customer_code=customer.customer_code,
        customer_name=customer.customer_name,
        phone=customer.phone,
        credit_limit=money(customer.credit_limit),
        total_invoiced=money(total_invoiced),
        total_paid=money(total_paid),
        balance_due=money(max(Decimal("0"), total_invoiced - total_paid)),
        open_invoices=open_invoices,
    )
    return CustomerLedgerResponse(customer=summary, invoices=invoice_rows)
