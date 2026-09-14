from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_permission
from app.db.session import get_db
from app.models.purchase_invoice import PurchaseInvoice
from app.models.returns import PurchaseReturn, SalesReturn
from app.models.sales_invoice import SalesInvoice
from app.models.supplier import Supplier
from app.models.supplier_payment import SupplierPayment
from app.models.user import User
from app.schemas.accounting import (
    GstSummary,
    SupplierLedgerRow,
    SupplierLedgerSummary,
    SupplierPaymentCreate,
    SupplierPaymentResponse,
)

router = APIRouter()
Q = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(value or 0).quantize(Q, rounding=ROUND_HALF_UP)


@router.post("/supplier-payments", response_model=SupplierPaymentResponse, status_code=status.HTTP_201_CREATED)
def create_supplier_payment(
    data: SupplierPaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_inventory")),
):
    if data.payment_date > date.today():
        raise HTTPException(status_code=400, detail="Payment date cannot be in the future")
    supplier = db.query(Supplier).filter(
        Supplier.id == data.supplier_id,
        Supplier.company_id == current_user.company_id,
    ).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if data.purchase_invoice_id is not None:
        invoice = db.query(PurchaseInvoice).filter(
            PurchaseInvoice.id == data.purchase_invoice_id,
            PurchaseInvoice.company_id == current_user.company_id,
            PurchaseInvoice.supplier_id == data.supplier_id,
        ).first()
        if not invoice:
            raise HTTPException(status_code=400, detail="Purchase invoice does not belong to the selected supplier")

    total_purchases = money(db.query(func.coalesce(func.sum(PurchaseInvoice.grand_total), 0)).filter(
        PurchaseInvoice.company_id == current_user.company_id,
        PurchaseInvoice.supplier_id == data.supplier_id,
    ).scalar())
    total_returns = money(db.query(func.coalesce(func.sum(PurchaseReturn.grand_total), 0)).filter(
        PurchaseReturn.company_id == current_user.company_id,
        PurchaseReturn.supplier_id == data.supplier_id,
    ).scalar())
    total_paid = money(db.query(func.coalesce(func.sum(SupplierPayment.amount), 0)).filter(
        SupplierPayment.company_id == current_user.company_id,
        SupplierPayment.supplier_id == data.supplier_id,
    ).scalar())
    outstanding = money(max(Decimal("0"), total_purchases - total_returns - total_paid))
    if money(data.amount) > outstanding:
        raise HTTPException(status_code=400, detail=f"Payment exceeds supplier outstanding of {outstanding}")

    payment = SupplierPayment(
        company_id=current_user.company_id,
        supplier_id=data.supplier_id,
        purchase_invoice_id=data.purchase_invoice_id,
        amount=money(data.amount),
        payment_date=data.payment_date,
        payment_mode=data.payment_mode,
        reference_number=data.reference_number,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(payment)
    try:
        db.commit(); db.refresh(payment)
    except IntegrityError:
        db.rollback(); raise HTTPException(status_code=409, detail="Supplier payment could not be recorded")
    return payment


@router.get("/suppliers", response_model=list[SupplierLedgerSummary])
def list_supplier_ledgers(
    search: str | None = Query(default=None, max_length=100),
    outstanding_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Supplier).filter(Supplier.company_id == current_user.company_id)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter((Supplier.supplier_name.ilike(term)) | (Supplier.supplier_code.ilike(term)) | (Supplier.gstin.ilike(term)))
    result = []
    for supplier in query.order_by(Supplier.supplier_name).all():
        ledger = _supplier_ledger(db, current_user.company_id, supplier)
        if outstanding_only and ledger.outstanding <= 0:
            continue
        result.append(ledger)
    return result


@router.get("/suppliers/{supplier_id}", response_model=SupplierLedgerSummary)
def get_supplier_ledger(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id, Supplier.company_id == current_user.company_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return _supplier_ledger(db, current_user.company_id, supplier)


def _supplier_ledger(db: Session, company_id: int, supplier: Supplier) -> SupplierLedgerSummary:
    entries = []
    invoices = db.query(PurchaseInvoice).filter(PurchaseInvoice.company_id == company_id, PurchaseInvoice.supplier_id == supplier.id).all()
    returns = db.query(PurchaseReturn).filter(PurchaseReturn.company_id == company_id, PurchaseReturn.supplier_id == supplier.id).all()
    payments = db.query(SupplierPayment).filter(SupplierPayment.company_id == company_id, SupplierPayment.supplier_id == supplier.id).all()
    for x in invoices: entries.append((x.purchase_date, x.created_at, "PURCHASE", x.purchase_number, money(x.grand_total), Decimal("0")))
    for x in returns: entries.append((x.return_date, x.created_at, "PURCHASE_RETURN", x.return_number, Decimal("0"), money(x.grand_total)))
    for x in payments: entries.append((x.payment_date, x.created_at, "PAYMENT", x.reference_number or f"PAY-{x.id}", Decimal("0"), money(x.amount)))
    entries.sort(key=lambda x: (x[0], x[1], x[2]))
    balance = Decimal("0"); rows = []
    for entry_date, _, entry_type, reference, debit, credit in entries:
        balance = money(balance + debit - credit)
        rows.append(SupplierLedgerRow(entry_date=entry_date, entry_type=entry_type, reference=reference, debit=debit, credit=credit, balance=balance))
    return SupplierLedgerSummary(
        supplier_id=supplier.id,
        supplier_code=supplier.supplier_code,
        supplier_name=supplier.supplier_name,
        total_purchases=money(sum((x[4] for x in entries if x[2] == "PURCHASE"), Decimal("0"))),
        total_returns=money(sum((x[5] for x in entries if x[2] == "PURCHASE_RETURN"), Decimal("0"))),
        total_payments=money(sum((x[5] for x in entries if x[2] == "PAYMENT"), Decimal("0"))),
        outstanding=money(max(Decimal("0"), balance)),
        rows=rows,
    )


@router.get("/gst-summary", response_model=GstSummary)
def gst_summary(
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if from_date and to_date and from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date cannot be after to_date")

    def totals(model, date_col, taxable_col, cgst_col, sgst_col, igst_col):
        q = db.query(
            func.coalesce(func.sum(taxable_col), 0),
            func.coalesce(func.sum(cgst_col), 0),
            func.coalesce(func.sum(sgst_col), 0),
            func.coalesce(func.sum(igst_col), 0),
        ).filter(model.company_id == current_user.company_id)
        if from_date: q = q.filter(date_col >= from_date)
        if to_date: q = q.filter(date_col <= to_date)
        row = q.first()
        return tuple(money(v) for v in row)

    s = totals(SalesInvoice, SalesInvoice.invoice_date, SalesInvoice.taxable_total, SalesInvoice.cgst, SalesInvoice.sgst, SalesInvoice.igst)
    sr = totals(SalesReturn, SalesReturn.return_date, SalesReturn.taxable_total, SalesReturn.cgst, SalesReturn.sgst, SalesReturn.igst)
    p = totals(PurchaseInvoice, PurchaseInvoice.purchase_date, PurchaseInvoice.taxable_total, PurchaseInvoice.cgst, PurchaseInvoice.sgst, PurchaseInvoice.igst)
    pr = totals(PurchaseReturn, PurchaseReturn.return_date, PurchaseReturn.taxable_total, PurchaseReturn.cgst, PurchaseReturn.sgst, PurchaseReturn.igst)
    output = money((s[1]+s[2]+s[3]) - (sr[1]+sr[2]+sr[3]))
    input_gst = money((p[1]+p[2]+p[3]) - (pr[1]+pr[2]+pr[3]))
    return GstSummary(
        taxable_sales=money(s[0]-sr[0]), sales_cgst=s[1], sales_sgst=s[2], sales_igst=s[3], sales_gst_total=money(s[1]+s[2]+s[3]),
        sales_returns_taxable=sr[0], sales_returns_cgst=sr[1], sales_returns_sgst=sr[2], sales_returns_igst=sr[3],
        taxable_purchases=money(p[0]-pr[0]), purchase_cgst=p[1], purchase_sgst=p[2], purchase_igst=p[3], purchase_gst_total=money(p[1]+p[2]+p[3]),
        purchase_returns_taxable=pr[0], purchase_returns_cgst=pr[1], purchase_returns_sgst=pr[2], purchase_returns_igst=pr[3],
        net_output_gst=output, net_input_gst=input_gst, estimated_net_gst_payable=money(max(Decimal("0"), output-input_gst)),
    )
