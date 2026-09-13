from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.batch import Batch
from app.models.customer import Customer
from app.models.inventory import CurrentStock
from app.models.payment import Payment
from app.models.product import Product
from app.models.sales_invoice import SalesInvoice
from app.models.user import User
from app.schemas.pharma import CustomerCreditProfile, ExpiryDashboard, ExpiryStockRow, FefoBatchSuggestion

router = APIRouter()
Q = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(value or 0).quantize(Q, rounding=ROUND_HALF_UP)


def expiry_bucket(days: int) -> str:
    if days < 0:
        return "EXPIRED"
    if days <= 30:
        return "WITHIN_30_DAYS"
    if days <= 60:
        return "31_60_DAYS"
    if days <= 90:
        return "61_90_DAYS"
    if days <= 180:
        return "91_180_DAYS"
    return "OVER_180_DAYS"


@router.get("/fefo/{product_id}", response_model=list[FefoBatchSuggestion])
def fefo_batches(
    product_id: int,
    include_expired: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.company_id == current_user.company_id,
        Product.is_active.is_(True),
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    today = date.today()
    query = (
        db.query(CurrentStock, Batch)
        .join(Batch, Batch.id == CurrentStock.batch_id)
        .filter(
            CurrentStock.company_id == current_user.company_id,
            CurrentStock.product_id == product_id,
            CurrentStock.quantity_available > 0,
            Batch.company_id == current_user.company_id,
            Batch.is_active.is_(True),
        )
    )
    if not include_expired:
        query = query.filter(Batch.expiry_date >= today)
    rows = query.order_by(Batch.expiry_date.asc(), Batch.batch_number.asc()).all()

    result = []
    for index, (stock, batch) in enumerate(rows):
        result.append(FefoBatchSuggestion(
            batch_id=batch.id,
            product_id=product_id,
            batch_number=batch.batch_number,
            expiry_date=batch.expiry_date,
            days_to_expiry=(batch.expiry_date - today).days,
            quantity_on_hand=stock.quantity_on_hand or 0,
            quantity_reserved=stock.quantity_reserved or 0,
            quantity_available=stock.quantity_available or 0,
            mrp=money(batch.mrp),
            purchase_rate=money(batch.purchase_rate),
            recommended=index == 0 and batch.expiry_date >= today,
        ))
    return result


@router.get("/expiry-dashboard", response_model=ExpiryDashboard)
def expiry_dashboard(
    max_days: int = Query(default=180, ge=1, le=3650),
    include_expired: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    rows = (
        db.query(CurrentStock, Batch, Product)
        .join(Batch, Batch.id == CurrentStock.batch_id)
        .join(Product, Product.id == CurrentStock.product_id)
        .filter(
            CurrentStock.company_id == current_user.company_id,
            CurrentStock.quantity_available > 0,
            Batch.company_id == current_user.company_id,
            Product.company_id == current_user.company_id,
        )
        .order_by(Batch.expiry_date.asc(), Product.product_name.asc())
        .all()
    )

    output: list[ExpiryStockRow] = []
    counts = {
        "EXPIRED": 0,
        "WITHIN_30_DAYS": 0,
        "31_60_DAYS": 0,
        "61_90_DAYS": 0,
        "91_180_DAYS": 0,
    }
    for stock, batch, product in rows:
        days = (batch.expiry_date - today).days
        if days < 0 and not include_expired:
            continue
        if days > max_days:
            continue
        bucket = expiry_bucket(days)
        if bucket in counts:
            counts[bucket] += 1
        qty = stock.quantity_available or 0
        output.append(ExpiryStockRow(
            product_id=product.id,
            product_code=product.product_code,
            product_name=product.product_name,
            batch_id=batch.id,
            batch_number=batch.batch_number,
            expiry_date=batch.expiry_date,
            days_to_expiry=days,
            expiry_bucket=bucket,
            quantity_available=qty,
            purchase_rate=money(batch.purchase_rate),
            mrp=money(batch.mrp),
            purchase_value=money(Decimal(qty) * Decimal(batch.purchase_rate or 0)),
            mrp_value=money(Decimal(qty) * Decimal(batch.mrp or 0)),
        ))

    return ExpiryDashboard(
        expired_count=counts["EXPIRED"],
        within_30_count=counts["WITHIN_30_DAYS"],
        days_31_60_count=counts["31_60_DAYS"],
        days_61_90_count=counts["61_90_DAYS"],
        days_91_180_count=counts["91_180_DAYS"],
        rows=output,
    )


@router.get("/customers/{customer_id}/credit", response_model=CustomerCreditProfile)
def customer_credit_profile(
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

    invoice_total = db.query(func.coalesce(func.sum(SalesInvoice.grand_total), 0)).filter(
        SalesInvoice.company_id == current_user.company_id,
        SalesInvoice.customer_id == customer.id,
    ).scalar()
    payment_total = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.company_id == current_user.company_id,
        Payment.customer_id == customer.id,
    ).scalar()
    opening = money(customer.opening_balance)
    outstanding = money(opening + money(invoice_total) - money(payment_total))
    limit = money(customer.credit_limit) if customer.credit_limit is not None else None
    available = money(limit - outstanding) if limit is not None else None

    expiry = customer.drug_license_expiry_date
    if not customer.drug_license_number:
        licence_status = "NOT_RECORDED"
    elif expiry is None:
        licence_status = "VALIDITY_NOT_RECORDED"
    elif expiry < date.today():
        licence_status = "EXPIRED"
    elif (expiry - date.today()).days <= 90:
        licence_status = "EXPIRING_SOON"
    else:
        licence_status = "VALID"

    return CustomerCreditProfile(
        customer_id=customer.id,
        customer_name=customer.customer_name,
        credit_limit=limit,
        opening_balance=opening,
        outstanding=outstanding,
        available_credit=available,
        credit_days=customer.credit_days or 0,
        drug_license_number=customer.drug_license_number,
        drug_license_expiry_date=expiry,
        licence_status=licence_status,
    )
