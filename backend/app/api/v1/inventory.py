from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_permission
from app.db.session import get_db
from app.models.batch import Batch
from app.models.inventory import CurrentStock, InventoryTransaction
from app.models.product import Product
from app.models.user import User
from app.schemas.inventory import (
    BatchCreate, BatchResponse, BatchUpdate,
    InventoryTransactionResponse, StockAdjustmentCreate, StockResponse,
)

router = APIRouter()


def _batch(db: Session, company_id: int, batch_id: int):
    return db.query(Batch).filter(Batch.id == batch_id, Batch.company_id == company_id).first()


@router.get("/batches", response_model=list[BatchResponse])
def list_batches(
    product_id: int | None = None,
    active_only: bool = True,
    expiring_within_days: int | None = Query(default=None, ge=0, le=3650),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Batch).filter(Batch.company_id == current_user.company_id)
    if product_id is not None:
        query = query.filter(Batch.product_id == product_id)
    if active_only:
        query = query.filter(Batch.is_active.is_(True))
    if expiring_within_days is not None:
        today = date.today()
        query = query.filter(Batch.expiry_date >= today, Batch.expiry_date <= date.fromordinal(today.toordinal() + expiring_within_days))
    return query.order_by(Batch.expiry_date, Batch.batch_number).all()


@router.post("/batches", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
def create_batch(
    data: BatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_inventory")),
):
    product = db.query(Product).filter(Product.id == data.product_id, Product.company_id == current_user.company_id).first()
    if not product:
        raise HTTPException(status_code=400, detail="Product does not belong to this company")
    batch = Batch(company_id=current_user.company_id, **data.model_dump())
    db.add(batch)
    try:
        db.commit(); db.refresh(batch)
    except IntegrityError:
        db.rollback(); raise HTTPException(status_code=409, detail="Batch number already exists for this product")
    return batch


@router.patch("/batches/{batch_id}", response_model=BatchResponse)
def update_batch(
    batch_id: int,
    data: BatchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_inventory")),
):
    batch = _batch(db, current_user.company_id, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(batch, key, value)
    if batch.manufacturing_date and batch.expiry_date < batch.manufacturing_date:
        raise HTTPException(status_code=400, detail="Expiry date cannot be before manufacturing date")
    db.commit(); db.refresh(batch)
    return batch


@router.get("/stock", response_model=list[StockResponse])
def list_stock(
    product_id: int | None = None,
    include_zero: bool = False,
    expiring_within_days: int | None = Query(default=None, ge=0, le=3650),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(CurrentStock, Product, Batch)
        .join(Product, Product.id == CurrentStock.product_id)
        .join(Batch, Batch.id == CurrentStock.batch_id)
        .filter(CurrentStock.company_id == current_user.company_id)
    )
    if product_id is not None:
        query = query.filter(CurrentStock.product_id == product_id)
    if not include_zero:
        query = query.filter(CurrentStock.quantity_on_hand != 0)
    if expiring_within_days is not None:
        today = date.today()
        limit = date.fromordinal(today.toordinal() + expiring_within_days)
        query = query.filter(Batch.expiry_date >= today, Batch.expiry_date <= limit)
    rows = query.order_by(Batch.expiry_date, Product.product_name).all()
    return [StockResponse(
        id=s.id, company_id=s.company_id, product_id=s.product_id, batch_id=s.batch_id,
        quantity_on_hand=s.quantity_on_hand or 0, quantity_reserved=s.quantity_reserved or 0,
        quantity_available=s.quantity_available or 0, last_stock_date=s.last_stock_date,
        product_name=p.product_name, product_code=p.product_code,
        batch_number=b.batch_number, expiry_date=b.expiry_date,
    ) for s, p, b in rows]


@router.post("/adjustments", response_model=InventoryTransactionResponse, status_code=status.HTTP_201_CREATED)
def adjust_stock(
    data: StockAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_inventory")),
):
    batch = _batch(db, current_user.company_id, data.batch_id)
    if not batch or batch.product_id != data.product_id:
        raise HTTPException(status_code=400, detail="Batch does not belong to the selected product")
    if not batch.is_active:
        raise HTTPException(status_code=400, detail="Batch is inactive")
    stock = db.query(CurrentStock).filter(
        CurrentStock.company_id == current_user.company_id,
        CurrentStock.product_id == data.product_id,
        CurrentStock.batch_id == data.batch_id,
    ).first()
    if not stock:
        stock = CurrentStock(company_id=current_user.company_id, product_id=data.product_id, batch_id=data.batch_id)
        db.add(stock)
        db.flush()
    new_qty = (stock.quantity_on_hand or 0) + data.quantity
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Stock cannot become negative")
    available = new_qty - (stock.quantity_reserved or 0)
    if available < 0:
        raise HTTPException(status_code=400, detail="Adjustment would reduce stock below reserved quantity")
    stock.quantity_on_hand = new_qty
    stock.quantity_available = available
    stock.last_stock_date = datetime.utcnow()
    tx = InventoryTransaction(
        company_id=current_user.company_id,
        product_id=data.product_id,
        batch_id=data.batch_id,
        transaction_type=data.transaction_type,
        reference_type=data.reference_type,
        reference_id=data.reference_id,
        quantity=data.quantity,
        unit_cost=data.unit_cost,
        transaction_date=data.transaction_date or date.today(),
        created_by=current_user.id,
    )
    db.add(tx); db.commit(); db.refresh(tx)
    return tx


@router.get("/transactions", response_model=list[InventoryTransactionResponse])
def list_transactions(
    product_id: int | None = None,
    batch_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(InventoryTransaction).filter(InventoryTransaction.company_id == current_user.company_id)
    if product_id is not None: query = query.filter(InventoryTransaction.product_id == product_id)
    if batch_id is not None: query = query.filter(InventoryTransaction.batch_id == batch_id)
    return query.order_by(InventoryTransaction.created_at.desc()).limit(limit).all()
