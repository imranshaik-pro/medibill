from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import get_current_user, require_permission
from app.db.session import get_db
from app.models.batch import Batch
from app.models.inventory import CurrentStock, InventoryTransaction
from app.models.product import Product
from app.models.purchase_invoice import PurchaseInvoice, PurchaseInvoiceItem
from app.models.supplier import Supplier
from app.models.user import User
from app.schemas.purchase import (
    PurchaseInvoiceCreate, PurchaseInvoiceResponse, PurchaseItemResponse,
    SupplierCreate, SupplierResponse, SupplierUpdate,
)

router = APIRouter()
Q = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return value.quantize(Q, rounding=ROUND_HALF_UP)


def supplier_query(db: Session, company_id: int):
    return db.query(Supplier).filter(Supplier.company_id == company_id)


@router.get("/suppliers", response_model=list[SupplierResponse])
def list_suppliers(
    search: str | None = Query(default=None, max_length=100),
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = supplier_query(db, current_user.company_id)
    if active_only:
        query = query.filter(Supplier.is_active.is_(True))
    if search:
        term = f"%{search.strip()}%"
        query = query.filter((Supplier.supplier_name.ilike(term)) | (Supplier.supplier_code.ilike(term)))
    return query.order_by(Supplier.supplier_name).all()


@router.post("/suppliers", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
def create_supplier(
    data: SupplierCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_inventory")),
):
    supplier = Supplier(company_id=current_user.company_id, **data.model_dump())
    db.add(supplier)
    try:
        db.commit(); db.refresh(supplier)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Supplier code already exists for this company")
    return supplier


@router.get("/suppliers/{supplier_id}", response_model=SupplierResponse)
def get_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supplier = supplier_query(db, current_user.company_id).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier


@router.patch("/suppliers/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: int,
    data: SupplierUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_inventory")),
):
    supplier = supplier_query(db, current_user.company_id).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(supplier, key, value)
    db.commit(); db.refresh(supplier)
    return supplier


def _invoice_response(invoice: PurchaseInvoice) -> PurchaseInvoiceResponse:
    items = []
    for item in invoice.items:
        items.append(PurchaseItemResponse(
            id=item.id, product_id=item.product_id, batch_id=item.batch_id,
            quantity=item.quantity, mrp=item.mrp, purchase_rate=item.purchase_rate,
            discount_percent=item.discount_percent, discount_amount=item.discount_amount,
            taxable_amount=item.taxable_amount, gst_rate=item.gst_rate,
            cgst=item.cgst, sgst=item.sgst, igst=item.igst, net_amount=item.net_amount,
            batch_number=item.batch.batch_number if item.batch else None,
            product_name=item.product.product_name if item.product else None,
        ))
    return PurchaseInvoiceResponse(
        id=invoice.id, company_id=invoice.company_id, purchase_number=invoice.purchase_number,
        purchase_date=invoice.purchase_date, supplier_id=invoice.supplier_id,
        subtotal=invoice.subtotal, discount_total=invoice.discount_total,
        taxable_total=invoice.taxable_total, cgst=invoice.cgst, sgst=invoice.sgst,
        igst=invoice.igst, round_off=invoice.round_off, grand_total=invoice.grand_total,
        payment_status=invoice.payment_status, notes=invoice.notes, created_by=invoice.created_by,
        created_at=invoice.created_at, updated_at=invoice.updated_at,
        supplier_name=invoice.supplier.supplier_name if invoice.supplier else None, items=items,
    )


@router.post("/invoices", response_model=PurchaseInvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_purchase_invoice(
    data: PurchaseInvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_inventory")),
):
    supplier = supplier_query(db, current_user.company_id).filter(Supplier.id == data.supplier_id).first()
    if not supplier or not supplier.is_active:
        raise HTTPException(status_code=400, detail="Supplier is not available")
    if data.purchase_date > date.today():
        raise HTTPException(status_code=400, detail="Purchase date cannot be in the future")
    if db.query(PurchaseInvoice).filter(PurchaseInvoice.company_id == current_user.company_id, PurchaseInvoice.purchase_number == data.purchase_number).first():
        raise HTTPException(status_code=409, detail="Purchase number already exists for this company")

    product_ids = {item.product_id for item in data.items}
    products = {p.id: p for p in db.query(Product).filter(Product.company_id == current_user.company_id, Product.id.in_(product_ids)).all()}
    if len(products) != len(product_ids):
        raise HTTPException(status_code=400, detail="One or more products do not belong to this company")
    if any(not p.is_active for p in products.values()):
        raise HTTPException(status_code=400, detail="Cannot purchase an inactive product")

    invoice = PurchaseInvoice(
        company_id=current_user.company_id, purchase_number=data.purchase_number,
        purchase_date=data.purchase_date, supplier_id=data.supplier_id,
        subtotal=Decimal("0"), discount_total=Decimal("0"), taxable_total=Decimal("0"),
        cgst=Decimal("0"), sgst=Decimal("0"), igst=Decimal("0"), round_off=Decimal("0"),
        grand_total=Decimal("0"), payment_status="Pending", notes=data.notes,
        created_by=current_user.id,
    )
    db.add(invoice)
    db.flush()

    subtotal = discount_total = taxable_total = cgst_total = sgst_total = igst_total = Decimal("0")
    try:
        for item in data.items:
            if item.expiry_date < data.purchase_date:
                raise HTTPException(status_code=400, detail=f"Expiry date cannot be before purchase date for batch {item.batch_number}")
            product = products[item.product_id]
            batch = db.query(Batch).filter(
                Batch.company_id == current_user.company_id,
                Batch.product_id == item.product_id,
                Batch.batch_number == item.batch_number,
            ).first()
            if batch:
                if not batch.is_active:
                    raise HTTPException(status_code=400, detail=f"Batch {item.batch_number} is inactive")
                if money(batch.mrp) != money(item.mrp) or money(batch.purchase_rate) != money(item.purchase_rate):
                    raise HTTPException(status_code=409, detail=f"Batch {item.batch_number} already exists with different MRP or purchase rate")
            else:
                batch = Batch(
                    company_id=current_user.company_id, product_id=item.product_id,
                    batch_number=item.batch_number, manufacturing_date=item.manufacturing_date,
                    expiry_date=item.expiry_date, mrp=money(item.mrp), purchase_rate=money(item.purchase_rate),
                )
                db.add(batch); db.flush()

            gross = money(item.purchase_rate * item.quantity)
            discount = money(gross * item.discount_percent / Decimal("100"))
            taxable = money(gross - discount)
            gst = money(taxable * item.gst_rate / Decimal("100"))
            if data.tax_mode == "INTER_STATE":
                cgst = sgst = Decimal("0"); igst = gst
            else:
                cgst = money(gst / Decimal("2")); sgst = money(gst - cgst); igst = Decimal("0")
            net = money(taxable + cgst + sgst + igst)

            invoice.items.append(PurchaseInvoiceItem(
                product_id=item.product_id, batch_id=batch.id, quantity=item.quantity,
                mrp=money(item.mrp), purchase_rate=money(item.purchase_rate),
                discount_percent=item.discount_percent, discount_amount=discount,
                taxable_amount=taxable, gst_rate=item.gst_rate, cgst=cgst, sgst=sgst,
                igst=igst, net_amount=net,
            ))

            stock = db.query(CurrentStock).filter(
                CurrentStock.company_id == current_user.company_id,
                CurrentStock.product_id == item.product_id,
                CurrentStock.batch_id == batch.id,
            ).first()
            if not stock:
                stock = CurrentStock(company_id=current_user.company_id, product_id=item.product_id, batch_id=batch.id, quantity_on_hand=0, quantity_reserved=0, quantity_available=0)
                db.add(stock); db.flush()
            stock.quantity_on_hand = (stock.quantity_on_hand or 0) + item.quantity
            stock.quantity_available = (stock.quantity_on_hand or 0) - (stock.quantity_reserved or 0)
            stock.last_stock_date = datetime.utcnow()

            db.add(InventoryTransaction(
                company_id=current_user.company_id, product_id=item.product_id, batch_id=batch.id,
                transaction_type="PURCHASE", reference_type="PURCHASE_INVOICE", reference_id=invoice.id,
                quantity=item.quantity, unit_cost=money(item.purchase_rate), transaction_date=data.purchase_date,
                created_by=current_user.id,
            ))
            subtotal += gross; discount_total += discount; taxable_total += taxable
            cgst_total += cgst; sgst_total += sgst; igst_total += igst

        invoice.subtotal = money(subtotal); invoice.discount_total = money(discount_total)
        invoice.taxable_total = money(taxable_total); invoice.cgst = money(cgst_total)
        invoice.sgst = money(sgst_total); invoice.igst = money(igst_total)
        invoice.grand_total = money(taxable_total + cgst_total + sgst_total + igst_total)
        invoice.round_off = Decimal("0")
        db.commit()
        db.refresh(invoice)
    except HTTPException:
        db.rollback(); raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Purchase could not be posted because of a duplicate or conflicting record")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Purchase could not be posted")

    invoice = db.query(PurchaseInvoice).options(
        joinedload(PurchaseInvoice.supplier),
        joinedload(PurchaseInvoice.items).joinedload(PurchaseInvoiceItem.batch),
        joinedload(PurchaseInvoice.items).joinedload(PurchaseInvoiceItem.product),
    ).filter(PurchaseInvoice.id == invoice.id, PurchaseInvoice.company_id == current_user.company_id).first()
    return _invoice_response(invoice)


@router.get("/invoices", response_model=list[PurchaseInvoiceResponse])
def list_purchase_invoices(
    search: str | None = Query(default=None, max_length=100),
    supplier_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(PurchaseInvoice).options(joinedload(PurchaseInvoice.supplier), joinedload(PurchaseInvoice.items).joinedload(PurchaseInvoiceItem.batch), joinedload(PurchaseInvoice.items).joinedload(PurchaseInvoiceItem.product)).filter(PurchaseInvoice.company_id == current_user.company_id)
    if search:
        query = query.filter(PurchaseInvoice.purchase_number.ilike(f"%{search.strip()}%"))
    if supplier_id is not None: query = query.filter(PurchaseInvoice.supplier_id == supplier_id)
    if from_date is not None: query = query.filter(PurchaseInvoice.purchase_date >= from_date)
    if to_date is not None: query = query.filter(PurchaseInvoice.purchase_date <= to_date)
    invoices = query.order_by(PurchaseInvoice.purchase_date.desc(), PurchaseInvoice.id.desc()).limit(limit).all()
    return [_invoice_response(x) for x in invoices]


@router.get("/invoices/{invoice_id}", response_model=PurchaseInvoiceResponse)
def get_purchase_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = db.query(PurchaseInvoice).options(joinedload(PurchaseInvoice.supplier), joinedload(PurchaseInvoice.items).joinedload(PurchaseInvoiceItem.batch), joinedload(PurchaseInvoice.items).joinedload(PurchaseInvoiceItem.product)).filter(PurchaseInvoice.id == invoice_id, PurchaseInvoice.company_id == current_user.company_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")
    return _invoice_response(invoice)
