from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.batch import Batch
from app.models.customer import Customer
from app.models.inventory import CurrentStock
from app.models.payment import Payment
from app.models.product import Product
from app.models.purchase_invoice import PurchaseInvoice
from app.models.returns import PurchaseReturn, SalesReturn
from app.models.sales_invoice import SalesInvoice, SalesInvoiceItem
from app.models.supplier_payment import SupplierPayment
from app.models.user import User
from app.schemas.dashboard import DashboardSummary

router = APIRouter()
Q = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(value or 0).quantize(Q, rounding=ROUND_HALF_UP)


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = current_user.company_id
    today = date.today()
    month_start = today.replace(day=1)
    near_expiry_limit = today + timedelta(days=90)

    total_sales_gross = money(db.query(func.coalesce(func.sum(SalesInvoice.grand_total), 0)).filter(SalesInvoice.company_id == company_id).scalar())
    sales_returns_total = money(db.query(func.coalesce(func.sum(SalesReturn.grand_total), 0)).filter(SalesReturn.company_id == company_id).scalar())
    total_sales = money(max(Decimal("0"), total_sales_gross - sales_returns_total))

    today_sales_gross = money(db.query(func.coalesce(func.sum(SalesInvoice.grand_total), 0)).filter(SalesInvoice.company_id == company_id, SalesInvoice.invoice_date == today).scalar())
    today_sales_returns = money(db.query(func.coalesce(func.sum(SalesReturn.grand_total), 0)).filter(SalesReturn.company_id == company_id, SalesReturn.return_date == today).scalar())
    today_sales = money(max(Decimal("0"), today_sales_gross - today_sales_returns))

    monthly_sales_gross = money(db.query(func.coalesce(func.sum(SalesInvoice.grand_total), 0)).filter(SalesInvoice.company_id == company_id, SalesInvoice.invoice_date >= month_start, SalesInvoice.invoice_date <= today).scalar())
    monthly_sales_returns = money(db.query(func.coalesce(func.sum(SalesReturn.grand_total), 0)).filter(SalesReturn.company_id == company_id, SalesReturn.return_date >= month_start, SalesReturn.return_date <= today).scalar())
    monthly_sales = money(max(Decimal("0"), monthly_sales_gross - monthly_sales_returns))

    total_purchases = money(db.query(func.coalesce(func.sum(PurchaseInvoice.grand_total), 0)).filter(PurchaseInvoice.company_id == company_id).scalar())
    total_purchase_returns = money(db.query(func.coalesce(func.sum(PurchaseReturn.grand_total), 0)).filter(PurchaseReturn.company_id == company_id).scalar())
    supplier_payments = money(db.query(func.coalesce(func.sum(SupplierPayment.amount), 0)).filter(SupplierPayment.company_id == company_id).scalar())
    total_payables = money(max(Decimal("0"), total_purchases - total_purchase_returns - supplier_payments))

    today_purchases_gross = money(db.query(func.coalesce(func.sum(PurchaseInvoice.grand_total), 0)).filter(PurchaseInvoice.company_id == company_id, PurchaseInvoice.purchase_date == today).scalar())
    today_purchase_returns = money(db.query(func.coalesce(func.sum(PurchaseReturn.grand_total), 0)).filter(PurchaseReturn.company_id == company_id, PurchaseReturn.return_date == today).scalar())
    today_purchases = money(max(Decimal("0"), today_purchases_gross - today_purchase_returns))

    monthly_purchases_gross = money(db.query(func.coalesce(func.sum(PurchaseInvoice.grand_total), 0)).filter(PurchaseInvoice.company_id == company_id, PurchaseInvoice.purchase_date >= month_start, PurchaseInvoice.purchase_date <= today).scalar())
    monthly_purchase_returns = money(db.query(func.coalesce(func.sum(PurchaseReturn.grand_total), 0)).filter(PurchaseReturn.company_id == company_id, PurchaseReturn.return_date >= month_start, PurchaseReturn.return_date <= today).scalar())
    monthly_purchases = money(max(Decimal("0"), monthly_purchases_gross - monthly_purchase_returns))

    today_collections = money(db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(Payment.company_id == company_id, Payment.payment_date == today).scalar())
    payment_total = money(db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(Payment.company_id == company_id).scalar())
    opening_total = money(db.query(func.coalesce(func.sum(Customer.opening_balance), 0)).filter(Customer.company_id == company_id).scalar())
    total_receivables = money(max(Decimal("0"), opening_total + total_sales - payment_total))

    stock_rows = db.query(CurrentStock, Batch).join(Batch, Batch.id == CurrentStock.batch_id).filter(CurrentStock.company_id == company_id).all()
    current_stock_units = 0
    current_stock_value = Decimal("0")
    near_expiry_batches = 0
    expired_batches = 0
    for stock, batch in stock_rows:
        qty = stock.quantity_available or 0
        current_stock_units += qty
        current_stock_value += Decimal(qty) * Decimal(batch.purchase_rate or 0)
        if qty > 0:
            if batch.expiry_date < today: expired_batches += 1
            elif batch.expiry_date <= near_expiry_limit: near_expiry_batches += 1

    product_stock = db.query(Product.id, Product.reorder_level, func.coalesce(func.sum(CurrentStock.quantity_available), 0).label("available")).outerjoin(CurrentStock, (CurrentStock.product_id == Product.id) & (CurrentStock.company_id == company_id)).filter(Product.company_id == company_id, Product.is_active.is_(True)).group_by(Product.id, Product.reorder_level).all()
    low_stock_items = sum(1 for _, reorder_level, available in product_stock if int(available or 0) <= int(reorder_level or 0))

    today_profit = db.query(func.coalesce(func.sum(SalesInvoiceItem.taxable_amount - (SalesInvoiceItem.quantity * Batch.purchase_rate)), 0)).join(SalesInvoice, SalesInvoice.id == SalesInvoiceItem.sales_invoice_id).join(Batch, Batch.id == SalesInvoiceItem.batch_id).filter(SalesInvoice.company_id == company_id, SalesInvoice.invoice_date == today).scalar()

    return DashboardSummary(
        today_sales=today_sales,
        monthly_sales=monthly_sales,
        total_sales=total_sales,
        today_purchases=today_purchases,
        monthly_purchases=monthly_purchases,
        today_collections=today_collections,
        total_receivables=total_receivables,
        total_payables=total_payables,
        current_stock_units=current_stock_units,
        current_stock_value=money(current_stock_value),
        low_stock_items=low_stock_items,
        near_expiry_batches=near_expiry_batches,
        expired_batches=expired_batches,
        today_estimated_gross_profit=money(today_profit),
    )
