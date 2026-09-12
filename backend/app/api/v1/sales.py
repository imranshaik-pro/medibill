from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import get_current_user, require_permission
from app.db.session import get_db
from app.models.batch import Batch
from app.models.customer import Customer
from app.models.inventory import CurrentStock, InventoryTransaction
from app.models.payment import Payment
from app.models.product import Product
from app.models.sales_invoice import SalesInvoice, SalesInvoiceItem
from app.models.user import User
from app.schemas.sales import PaymentCreate, SalesInvoiceCreate, SalesInvoiceResponse, SalesItemResponse

router = APIRouter()
Q = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(Q, rounding=ROUND_HALF_UP)


def _payment_totals(db: Session, invoice: SalesInvoice) -> tuple[Decimal, Decimal]:
    paid = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.company_id == invoice.company_id,
        Payment.sales_invoice_id == invoice.id,
    ).scalar()
    amount_paid = money(Decimal(paid or 0))
    return amount_paid, money(max(Decimal("0"), Decimal(invoice.grand_total) - amount_paid))


def _invoice_response(db: Session, invoice: SalesInvoice) -> SalesInvoiceResponse:
    product_ids = {item.product_id for item in invoice.items}
    batch_ids = {item.batch_id for item in invoice.items}
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()} if product_ids else {}
    batches = {b.id: b for b in db.query(Batch).filter(Batch.id.in_(batch_ids)).all()} if batch_ids else {}
    amount_paid, balance_due = _payment_totals(db, invoice)
    items = [
        SalesItemResponse(
            id=item.id,
            product_id=item.product_id,
            batch_id=item.batch_id,
            quantity=item.quantity,
            mrp=item.mrp,
            selling_price=item.selling_price,
            discount_percent=item.discount_percent,
            discount_amount=item.discount_amount,
            taxable_amount=item.taxable_amount,
            gst_rate=item.gst_rate,
            cgst=item.cgst,
            sgst=item.sgst,
            igst=item.igst,
            net_amount=item.net_amount,
            batch_number=batches.get(item.batch_id).batch_number if batches.get(item.batch_id) else None,
            product_name=products.get(item.product_id).product_name if products.get(item.product_id) else None,
        )
        for item in invoice.items
    ]
    return SalesInvoiceResponse(
        id=invoice.id,
        company_id=invoice.company_id,
        invoice_number=invoice.invoice_number,
        invoice_date=invoice.invoice_date,
        customer_id=invoice.customer_id,
        subtotal=invoice.subtotal,
        discount_total=invoice.discount_total,
        taxable_total=invoice.taxable_total,
        cgst=invoice.cgst,
        sgst=invoice.sgst,
        igst=invoice.igst,
        round_off=invoice.round_off,
        grand_total=invoice.grand_total,
        payment_status=invoice.payment_status,
        amount_paid=amount_paid,
        balance_due=balance_due,
        notes=invoice.notes,
        created_by=invoice.created_by,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
        customer_name=invoice.customer.customer_name if invoice.customer else None,
        items=items,
    )


def _load_invoice(db: Session, company_id: int, invoice_id: int) -> SalesInvoice | None:
    return db.query(SalesInvoice).options(
        joinedload(SalesInvoice.customer),
        joinedload(SalesInvoice.items),
    ).filter(
        SalesInvoice.id == invoice_id,
        SalesInvoice.company_id == company_id,
    ).first()


@router.post("/invoices", response_model=SalesInvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_sales_invoice(
    data: SalesInvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_inventory")),
):
    if data.invoice_date > date.today():
        raise HTTPException(status_code=400, detail="Invoice date cannot be in the future")

    customer = db.query(Customer).filter(
        Customer.id == data.customer_id,
        Customer.company_id == current_user.company_id,
        Customer.is_active.is_(True),
    ).first()
    if not customer:
        raise HTTPException(status_code=400, detail="Customer is not available")

    if db.query(SalesInvoice).filter(
        SalesInvoice.company_id == current_user.company_id,
        SalesInvoice.invoice_number == data.invoice_number,
    ).first():
        raise HTTPException(status_code=409, detail="Invoice number already exists for this company")

    product_ids = {item.product_id for item in data.items}
    batch_ids = {item.batch_id for item in data.items}
    products = {p.id: p for p in db.query(Product).filter(
        Product.company_id == current_user.company_id,
        Product.id.in_(product_ids),
    ).all()}
    batches = {b.id: b for b in db.query(Batch).filter(
        Batch.company_id == current_user.company_id,
        Batch.id.in_(batch_ids),
    ).all()}
    if len(products) != len(product_ids):
        raise HTTPException(status_code=400, detail="One or more products do not belong to this company")
    if len(batches) != len(batch_ids):
        raise HTTPException(status_code=400, detail="One or more batches do not belong to this company")
    if any(not p.is_active for p in products.values()):
        raise HTTPException(status_code=400, detail="Cannot sell an inactive product")

    invoice = SalesInvoice(
        company_id=current_user.company_id,
        invoice_number=data.invoice_number,
        invoice_date=data.invoice_date,
        customer_id=data.customer_id,
        subtotal=Decimal("0"),
        discount_total=Decimal("0"),
        taxable_total=Decimal("0"),
        cgst=Decimal("0"),
        sgst=Decimal("0"),
        igst=Decimal("0"),
        round_off=Decimal("0"),
        grand_total=Decimal("0"),
        payment_status="Pending",
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(invoice)

    try:
        db.flush()
        subtotal = discount_total = taxable_total = Decimal("0")
        cgst_total = sgst_total = igst_total = Decimal("0")

        for item in data.items:
            product = products[item.product_id]
            batch = batches[item.batch_id]
            if batch.product_id != item.product_id:
                raise HTTPException(status_code=400, detail=f"Batch {batch.batch_number} does not belong to {product.product_name}")
            if not batch.is_active:
                raise HTTPException(status_code=400, detail=f"Batch {batch.batch_number} is inactive")
            if batch.expiry_date < data.invoice_date:
                raise HTTPException(status_code=400, detail=f"Batch {batch.batch_number} is expired")
            if money(item.selling_price) > money(batch.mrp):
                raise HTTPException(status_code=400, detail=f"Selling price cannot exceed MRP for batch {batch.batch_number}")

            stock = db.query(CurrentStock).filter(
                CurrentStock.company_id == current_user.company_id,
                CurrentStock.product_id == item.product_id,
                CurrentStock.batch_id == item.batch_id,
            ).with_for_update().first()
            if not stock:
                raise HTTPException(status_code=409, detail=f"No stock exists for batch {batch.batch_number}")
            available = stock.quantity_available if stock.quantity_available is not None else ((stock.quantity_on_hand or 0) - (stock.quantity_reserved or 0))
            if available < item.quantity:
                raise HTTPException(status_code=409, detail=f"Insufficient stock for batch {batch.batch_number}. Available: {available}")

            gross = money(item.selling_price * item.quantity)
            discount = money(gross * item.discount_percent / Decimal("100"))
            taxable = money(gross - discount)
            gst = money(taxable * item.gst_rate / Decimal("100"))
            if data.tax_mode == "INTER_STATE":
                cgst = sgst = Decimal("0")
                igst = gst
            else:
                cgst = money(gst / Decimal("2"))
                sgst = money(gst - cgst)
                igst = Decimal("0")
            net = money(taxable + cgst + sgst + igst)

            invoice.items.append(SalesInvoiceItem(
                product_id=item.product_id,
                batch_id=item.batch_id,
                quantity=item.quantity,
                mrp=money(batch.mrp),
                selling_price=money(item.selling_price),
                discount_percent=item.discount_percent,
                discount_amount=discount,
                taxable_amount=taxable,
                gst_rate=item.gst_rate,
                cgst=cgst,
                sgst=sgst,
                igst=igst,
                net_amount=net,
            ))

            stock.quantity_on_hand = (stock.quantity_on_hand or 0) - item.quantity
            stock.quantity_available = stock.quantity_on_hand - (stock.quantity_reserved or 0)
            stock.last_stock_date = datetime.utcnow()
            if stock.quantity_on_hand < 0 or stock.quantity_available < 0:
                raise HTTPException(status_code=409, detail=f"Stock conflict for batch {batch.batch_number}")

            db.add(InventoryTransaction(
                company_id=current_user.company_id,
                product_id=item.product_id,
                batch_id=item.batch_id,
                transaction_type="SALE",
                reference_type="SALES_INVOICE",
                reference_id=invoice.id,
                quantity=-item.quantity,
                unit_cost=money(batch.purchase_rate),
                transaction_date=data.invoice_date,
                created_by=current_user.id,
            ))

            subtotal += gross
            discount_total += discount
            taxable_total += taxable
            cgst_total += cgst
            sgst_total += sgst
            igst_total += igst

        invoice.subtotal = money(subtotal)
        invoice.discount_total = money(discount_total)
        invoice.taxable_total = money(taxable_total)
        invoice.cgst = money(cgst_total)
        invoice.sgst = money(sgst_total)
        invoice.igst = money(igst_total)
        invoice.grand_total = money(taxable_total + cgst_total + sgst_total + igst_total)
        invoice.round_off = Decimal("0")

        amount_paid = money(data.amount_paid)
        if amount_paid > invoice.grand_total:
            raise HTTPException(status_code=400, detail="Amount paid cannot exceed invoice total")
        if amount_paid > 0:
            db.add(Payment(
                company_id=current_user.company_id,
                sales_invoice_id=invoice.id,
                customer_id=customer.id,
                amount=amount_paid,
                payment_date=data.invoice_date,
                payment_mode=data.payment_mode,
                reference_number=data.payment_reference,
                created_by=current_user.id,
            ))

        if amount_paid >= invoice.grand_total:
            invoice.payment_status = "Paid"
        elif amount_paid > 0:
            invoice.payment_status = "Partial"
        else:
            invoice.payment_status = "Pending"

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Sale could not be posted because of a duplicate or conflicting record")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Sale could not be posted")

    posted = _load_invoice(db, current_user.company_id, invoice.id)
    return _invoice_response(db, posted)


@router.get("/invoices", response_model=list[SalesInvoiceResponse])
def list_sales_invoices(
    search: str | None = Query(default=None, max_length=100),
    customer_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(SalesInvoice).options(
        joinedload(SalesInvoice.customer),
        joinedload(SalesInvoice.items),
    ).filter(SalesInvoice.company_id == current_user.company_id)
    if search:
        term = f"%{search.strip()}%"
        query = query.join(Customer).filter(
            (SalesInvoice.invoice_number.ilike(term)) | (Customer.customer_name.ilike(term))
        )
    if customer_id is not None:
        query = query.filter(SalesInvoice.customer_id == customer_id)
    if from_date is not None:
        query = query.filter(SalesInvoice.invoice_date >= from_date)
    if to_date is not None:
        query = query.filter(SalesInvoice.invoice_date <= to_date)
    invoices = query.order_by(SalesInvoice.invoice_date.desc(), SalesInvoice.id.desc()).limit(limit).all()
    return [_invoice_response(db, invoice) for invoice in invoices]


@router.get("/invoices/{invoice_id}", response_model=SalesInvoiceResponse)
def get_sales_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = _load_invoice(db, current_user.company_id, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Sales invoice not found")
    return _invoice_response(db, invoice)


@router.post("/invoices/{invoice_id}/payments", response_model=SalesInvoiceResponse)
def record_payment(
    invoice_id: int,
    data: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_inventory")),
):
    invoice = _load_invoice(db, current_user.company_id, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Sales invoice not found")
    if data.payment_date > date.today():
        raise HTTPException(status_code=400, detail="Payment date cannot be in the future")
    amount_paid, balance_due = _payment_totals(db, invoice)
    if money(data.amount) > balance_due:
        raise HTTPException(status_code=400, detail="Payment exceeds invoice balance")

    try:
        db.add(Payment(
            company_id=current_user.company_id,
            sales_invoice_id=invoice.id,
            customer_id=invoice.customer_id,
            amount=money(data.amount),
            payment_date=data.payment_date,
            payment_mode=data.payment_mode,
            reference_number=data.reference_number,
            notes=data.notes,
            created_by=current_user.id,
        ))
        new_paid = money(amount_paid + data.amount)
        invoice.payment_status = "Paid" if new_paid >= money(invoice.grand_total) else "Partial"
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Payment could not be recorded")

    refreshed = _load_invoice(db, current_user.company_id, invoice.id)
    return _invoice_response(db, refreshed)
