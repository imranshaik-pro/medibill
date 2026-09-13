from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import get_current_user, require_permission
from app.db.session import get_db
from app.models.inventory import CurrentStock, InventoryTransaction
from app.models.purchase_invoice import PurchaseInvoice, PurchaseInvoiceItem
from app.models.returns import PurchaseReturn, PurchaseReturnItem, SalesReturn, SalesReturnItem
from app.models.sales_invoice import SalesInvoice, SalesInvoiceItem
from app.models.user import User
from app.schemas.returns import (
    PurchaseReturnCreate, PurchaseReturnResponse,
    SalesReturnCreate, SalesReturnResponse,
)

router = APIRouter()
Q = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(value or 0).quantize(Q, rounding=ROUND_HALF_UP)


def _sales_return_query(db: Session, company_id: int):
    return db.query(SalesReturn).options(joinedload(SalesReturn.items)).filter(SalesReturn.company_id == company_id)


def _purchase_return_query(db: Session, company_id: int):
    return db.query(PurchaseReturn).options(joinedload(PurchaseReturn.items)).filter(PurchaseReturn.company_id == company_id)


@router.post("/sales", response_model=SalesReturnResponse, status_code=status.HTTP_201_CREATED)
def create_sales_return(
    data: SalesReturnCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_inventory")),
):
    if data.return_date > date.today():
        raise HTTPException(status_code=400, detail="Return date cannot be in the future")
    invoice = db.query(SalesInvoice).options(joinedload(SalesInvoice.items)).filter(
        SalesInvoice.id == data.sales_invoice_id,
        SalesInvoice.company_id == current_user.company_id,
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Original sales invoice not found")
    if data.return_date < invoice.invoice_date:
        raise HTTPException(status_code=400, detail="Return date cannot be before the original invoice date")
    if _sales_return_query(db, current_user.company_id).filter(SalesReturn.return_number == data.return_number).first():
        raise HTTPException(status_code=409, detail="Sales return number already exists")

    item_map = {item.id: item for item in invoice.items}
    requested_ids = [x.sales_invoice_item_id for x in data.items]
    if len(requested_ids) != len(set(requested_ids)):
        raise HTTPException(status_code=400, detail="The same sales invoice line cannot be repeated in one return")
    if any(item_id not in item_map for item_id in requested_ids):
        raise HTTPException(status_code=400, detail="One or more return lines do not belong to the original invoice")

    sales_return = SalesReturn(
        company_id=current_user.company_id,
        return_number=data.return_number,
        return_date=data.return_date,
        sales_invoice_id=invoice.id,
        customer_id=invoice.customer_id,
        reason=data.reason,
        created_by=current_user.id,
    )
    db.add(sales_return)

    taxable_total = cgst_total = sgst_total = igst_total = Decimal("0")
    try:
        db.flush()
        for request in data.items:
            original = item_map[request.sales_invoice_item_id]
            already_returned = db.query(func.coalesce(func.sum(SalesReturnItem.quantity), 0)).join(
                SalesReturn, SalesReturn.id == SalesReturnItem.sales_return_id
            ).filter(
                SalesReturn.company_id == current_user.company_id,
                SalesReturnItem.sales_invoice_item_id == original.id,
            ).scalar() or 0
            if int(already_returned) + request.quantity > original.quantity:
                raise HTTPException(status_code=409, detail=f"Return quantity exceeds quantity sold for invoice line {original.id}")

            ratio = Decimal(request.quantity) / Decimal(original.quantity)
            taxable = money(Decimal(original.taxable_amount) * ratio)
            cgst = money(Decimal(original.cgst or 0) * ratio)
            sgst = money(Decimal(original.sgst or 0) * ratio)
            igst = money(Decimal(original.igst or 0) * ratio)
            net = money(taxable + cgst + sgst + igst)
            sales_return.items.append(SalesReturnItem(
                sales_invoice_item_id=original.id,
                product_id=original.product_id,
                batch_id=original.batch_id,
                quantity=request.quantity,
                disposition=request.disposition,
                taxable_amount=taxable,
                cgst=cgst,
                sgst=sgst,
                igst=igst,
                net_amount=net,
                reason=request.reason,
            ))

            stock = db.query(CurrentStock).filter(
                CurrentStock.company_id == current_user.company_id,
                CurrentStock.product_id == original.product_id,
                CurrentStock.batch_id == original.batch_id,
            ).with_for_update().first()
            if request.disposition == "SALEABLE":
                if not stock:
                    stock = CurrentStock(
                        company_id=current_user.company_id,
                        product_id=original.product_id,
                        batch_id=original.batch_id,
                        quantity_on_hand=0,
                        quantity_reserved=0,
                        quantity_available=0,
                    )
                    db.add(stock); db.flush()
                stock.quantity_on_hand = (stock.quantity_on_hand or 0) + request.quantity
                stock.quantity_available = stock.quantity_on_hand - (stock.quantity_reserved or 0)
                stock.last_stock_date = datetime.utcnow()

            db.add(InventoryTransaction(
                company_id=current_user.company_id,
                product_id=original.product_id,
                batch_id=original.batch_id,
                transaction_type=f"SALES_RETURN_{request.disposition}",
                reference_type="SALES_RETURN",
                reference_id=sales_return.id,
                quantity=request.quantity,
                unit_cost=Decimal("0"),
                transaction_date=data.return_date,
                created_by=current_user.id,
            ))
            taxable_total += taxable; cgst_total += cgst; sgst_total += sgst; igst_total += igst

        sales_return.taxable_total = money(taxable_total)
        sales_return.cgst = money(cgst_total)
        sales_return.sgst = money(sgst_total)
        sales_return.igst = money(igst_total)
        sales_return.grand_total = money(taxable_total + cgst_total + sgst_total + igst_total)
        db.commit(); db.refresh(sales_return)
    except HTTPException:
        db.rollback(); raise
    except IntegrityError:
        db.rollback(); raise HTTPException(status_code=409, detail="Sales return conflicts with an existing record")
    except Exception:
        db.rollback(); raise HTTPException(status_code=500, detail="Sales return could not be posted")
    return _sales_return_query(db, current_user.company_id).filter(SalesReturn.id == sales_return.id).first()


@router.get("/sales", response_model=list[SalesReturnResponse])
def list_sales_returns(
    invoice_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = _sales_return_query(db, current_user.company_id)
    if invoice_id is not None:
        query = query.filter(SalesReturn.sales_invoice_id == invoice_id)
    return query.order_by(SalesReturn.return_date.desc(), SalesReturn.id.desc()).limit(limit).all()


@router.post("/purchases", response_model=PurchaseReturnResponse, status_code=status.HTTP_201_CREATED)
def create_purchase_return(
    data: PurchaseReturnCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_inventory")),
):
    if data.return_date > date.today():
        raise HTTPException(status_code=400, detail="Return date cannot be in the future")
    invoice = db.query(PurchaseInvoice).options(joinedload(PurchaseInvoice.items)).filter(
        PurchaseInvoice.id == data.purchase_invoice_id,
        PurchaseInvoice.company_id == current_user.company_id,
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Original purchase invoice not found")
    if data.return_date < invoice.purchase_date:
        raise HTTPException(status_code=400, detail="Return date cannot be before the original purchase date")
    if _purchase_return_query(db, current_user.company_id).filter(PurchaseReturn.return_number == data.return_number).first():
        raise HTTPException(status_code=409, detail="Purchase return number already exists")

    item_map = {item.id: item for item in invoice.items}
    requested_ids = [x.purchase_invoice_item_id for x in data.items]
    if len(requested_ids) != len(set(requested_ids)):
        raise HTTPException(status_code=400, detail="The same purchase invoice line cannot be repeated in one return")
    if any(item_id not in item_map for item_id in requested_ids):
        raise HTTPException(status_code=400, detail="One or more return lines do not belong to the original invoice")

    purchase_return = PurchaseReturn(
        company_id=current_user.company_id,
        return_number=data.return_number,
        return_date=data.return_date,
        purchase_invoice_id=invoice.id,
        supplier_id=invoice.supplier_id,
        reason=data.reason,
        created_by=current_user.id,
    )
    db.add(purchase_return)
    taxable_total = cgst_total = sgst_total = igst_total = Decimal("0")
    try:
        db.flush()
        for request in data.items:
            original = item_map[request.purchase_invoice_item_id]
            prev = db.query(
                func.coalesce(func.sum(PurchaseReturnItem.quantity), 0),
                func.coalesce(func.sum(PurchaseReturnItem.free_quantity), 0),
            ).join(PurchaseReturn, PurchaseReturn.id == PurchaseReturnItem.purchase_return_id).filter(
                PurchaseReturn.company_id == current_user.company_id,
                PurchaseReturnItem.purchase_invoice_item_id == original.id,
            ).first()
            returned_paid, returned_free = int(prev[0] or 0), int(prev[1] or 0)
            if returned_paid + request.quantity > original.quantity:
                raise HTTPException(status_code=409, detail=f"Paid return quantity exceeds original purchased quantity for line {original.id}")
            if returned_free + request.free_quantity > (original.free_quantity or 0):
                raise HTTPException(status_code=409, detail=f"Free return quantity exceeds original scheme quantity for line {original.id}")

            stock_qty = request.quantity + request.free_quantity
            stock = db.query(CurrentStock).filter(
                CurrentStock.company_id == current_user.company_id,
                CurrentStock.product_id == original.product_id,
                CurrentStock.batch_id == original.batch_id,
            ).with_for_update().first()
            if not stock or (stock.quantity_available or 0) < stock_qty:
                raise HTTPException(status_code=409, detail=f"Insufficient available stock to return purchase line {original.id}")

            ratio = Decimal(request.quantity) / Decimal(original.quantity)
            taxable = money(Decimal(original.taxable_amount) * ratio)
            cgst = money(Decimal(original.cgst or 0) * ratio)
            sgst = money(Decimal(original.sgst or 0) * ratio)
            igst = money(Decimal(original.igst or 0) * ratio)
            net = money(taxable + cgst + sgst + igst)
            purchase_return.items.append(PurchaseReturnItem(
                purchase_invoice_item_id=original.id,
                product_id=original.product_id,
                batch_id=original.batch_id,
                quantity=request.quantity,
                free_quantity=request.free_quantity,
                taxable_amount=taxable,
                cgst=cgst,
                sgst=sgst,
                igst=igst,
                net_amount=net,
                reason=request.reason,
            ))

            stock.quantity_on_hand = (stock.quantity_on_hand or 0) - stock_qty
            stock.quantity_available = stock.quantity_on_hand - (stock.quantity_reserved or 0)
            if stock.quantity_on_hand < 0 or stock.quantity_available < 0:
                raise HTTPException(status_code=409, detail="Purchase return would make stock negative")
            stock.last_stock_date = datetime.utcnow()
            db.add(InventoryTransaction(
                company_id=current_user.company_id,
                product_id=original.product_id,
                batch_id=original.batch_id,
                transaction_type="PURCHASE_RETURN",
                reference_type="PURCHASE_RETURN",
                reference_id=purchase_return.id,
                quantity=-stock_qty,
                unit_cost=original.effective_unit_cost or original.purchase_rate,
                transaction_date=data.return_date,
                created_by=current_user.id,
            ))
            taxable_total += taxable; cgst_total += cgst; sgst_total += sgst; igst_total += igst

        purchase_return.taxable_total = money(taxable_total)
        purchase_return.cgst = money(cgst_total)
        purchase_return.sgst = money(sgst_total)
        purchase_return.igst = money(igst_total)
        purchase_return.grand_total = money(taxable_total + cgst_total + sgst_total + igst_total)
        db.commit(); db.refresh(purchase_return)
    except HTTPException:
        db.rollback(); raise
    except IntegrityError:
        db.rollback(); raise HTTPException(status_code=409, detail="Purchase return conflicts with an existing record")
    except Exception:
        db.rollback(); raise HTTPException(status_code=500, detail="Purchase return could not be posted")
    return _purchase_return_query(db, current_user.company_id).filter(PurchaseReturn.id == purchase_return.id).first()


@router.get("/purchases", response_model=list[PurchaseReturnResponse])
def list_purchase_returns(
    invoice_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = _purchase_return_query(db, current_user.company_id)
    if invoice_id is not None:
        query = query.filter(PurchaseReturn.purchase_invoice_id == invoice_id)
    return query.order_by(PurchaseReturn.return_date.desc(), PurchaseReturn.id.desc()).limit(limit).all()
