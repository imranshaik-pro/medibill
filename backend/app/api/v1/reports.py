from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.batch import Batch
from app.models.customer import Customer
from app.models.inventory import CurrentStock
from app.models.product import Product
from app.models.purchase_invoice import PurchaseInvoice, PurchaseInvoiceItem
from app.models.returns import PurchaseReturn, SalesReturn
from app.models.sales_invoice import SalesInvoice, SalesInvoiceItem
from app.models.supplier import Supplier
from app.models.user import User
from app.schemas.reports import (
    CustomerPerformanceRow,
    InventoryIntelligenceRow,
    ProductPerformanceRow,
    PurchaseRegisterRow,
    SalesRegisterRow,
)

router = APIRouter()
Q = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(value or 0).quantize(Q, rounding=ROUND_HALF_UP)


@router.get("/inventory-intelligence", response_model=list[InventoryIntelligenceRow])
def inventory_intelligence(
    include_zero: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = current_user.company_id
    today = date.today()
    last_30 = today - timedelta(days=30)

    sales_rows = db.query(
        SalesInvoiceItem.product_id,
        func.coalesce(func.sum(SalesInvoiceItem.quantity + SalesInvoiceItem.free_quantity), 0),
        func.max(SalesInvoice.invoice_date),
    ).join(SalesInvoice, SalesInvoice.id == SalesInvoiceItem.sales_invoice_id).filter(
        SalesInvoice.company_id == company_id,
    ).group_by(SalesInvoiceItem.product_id).all()
    last_sale_map = {r[0]: r[2] for r in sales_rows}

    sales_30_rows = db.query(
        SalesInvoiceItem.product_id,
        func.coalesce(func.sum(SalesInvoiceItem.quantity + SalesInvoiceItem.free_quantity), 0),
    ).join(SalesInvoice, SalesInvoice.id == SalesInvoiceItem.sales_invoice_id).filter(
        SalesInvoice.company_id == company_id,
        SalesInvoice.invoice_date >= last_30,
        SalesInvoice.invoice_date <= today,
    ).group_by(SalesInvoiceItem.product_id).all()
    sold_30 = {r[0]: int(r[1] or 0) for r in sales_30_rows}

    total_stock_rows = db.query(
        CurrentStock.product_id,
        func.coalesce(func.sum(CurrentStock.quantity_available), 0),
    ).filter(CurrentStock.company_id == company_id).group_by(CurrentStock.product_id).all()
    total_stock = {r[0]: int(r[1] or 0) for r in total_stock_rows}

    query = db.query(CurrentStock, Product, Batch).join(
        Product, Product.id == CurrentStock.product_id
    ).join(Batch, Batch.id == CurrentStock.batch_id).filter(
        CurrentStock.company_id == company_id,
        Product.company_id == company_id,
        Batch.company_id == company_id,
    )
    if not include_zero:
        query = query.filter(CurrentStock.quantity_available != 0)

    result: list[InventoryIntelligenceRow] = []
    for stock, product, batch in query.order_by(Product.product_name, Batch.expiry_date).all():
        available = int(stock.quantity_available or 0)
        product_available = total_stock.get(product.id, 0)
        reorder = max(0, int(product.reorder_level or 0) - product_available)
        units_30 = sold_30.get(product.id, 0)
        last_sale = last_sale_map.get(product.id)
        if units_30 >= 50:
            movement = "FAST"
        elif units_30 > 0:
            movement = "ACTIVE"
        elif last_sale and last_sale >= today - timedelta(days=90):
            movement = "SLOW"
        else:
            movement = "NON_MOVING"
        result.append(InventoryIntelligenceRow(
            product_id=product.id,
            product_code=product.product_code,
            product_name=product.product_name,
            batch_id=batch.id,
            batch_number=batch.batch_number,
            expiry_date=batch.expiry_date,
            days_to_expiry=(batch.expiry_date - today).days,
            quantity_available=available,
            purchase_rate=money(batch.purchase_rate),
            stock_value=money(Decimal(available) * Decimal(batch.purchase_rate or 0)),
            reorder_level=int(product.reorder_level or 0),
            product_available=product_available,
            reorder_suggested=reorder,
            units_sold_30d=units_30,
            last_sale_date=last_sale,
            movement_class=movement,
        ))
    return result


@router.get("/sales-register", response_model=list[SalesRegisterRow])
def sales_register(
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = current_user.company_id
    item_rows = db.query(
        SalesInvoiceItem.sales_invoice_id,
        func.coalesce(func.sum(SalesInvoiceItem.quantity), 0),
        func.coalesce(func.sum(SalesInvoiceItem.free_quantity), 0),
    ).join(SalesInvoice, SalesInvoice.id == SalesInvoiceItem.sales_invoice_id).filter(
        SalesInvoice.company_id == company_id,
    ).group_by(SalesInvoiceItem.sales_invoice_id).all()
    item_map = {r[0]: (int(r[1] or 0), int(r[2] or 0)) for r in item_rows}
    return_rows = db.query(
        SalesReturn.sales_invoice_id,
        func.coalesce(func.sum(SalesReturn.grand_total), 0),
    ).filter(SalesReturn.company_id == company_id).group_by(SalesReturn.sales_invoice_id).all()
    return_map = {r[0]: money(r[1]) for r in return_rows}

    query = db.query(SalesInvoice, Customer).join(Customer, Customer.id == SalesInvoice.customer_id).filter(SalesInvoice.company_id == company_id)
    if from_date: query = query.filter(SalesInvoice.invoice_date >= from_date)
    if to_date: query = query.filter(SalesInvoice.invoice_date <= to_date)
    out = []
    for invoice, customer in query.order_by(SalesInvoice.invoice_date.desc(), SalesInvoice.id.desc()).limit(limit).all():
        billed, free = item_map.get(invoice.id, (0, 0)); returned = return_map.get(invoice.id, Decimal("0"))
        out.append(SalesRegisterRow(
            invoice_id=invoice.id, invoice_date=invoice.invoice_date, invoice_number=invoice.invoice_number,
            customer_name=customer.business_name or customer.customer_name, billed_units=billed, free_units=free,
            taxable_total=money(invoice.taxable_total), cgst=money(invoice.cgst), sgst=money(invoice.sgst), igst=money(invoice.igst),
            gross_invoice=money(invoice.grand_total), returns=returned, net_sales=money(Decimal(invoice.grand_total) - returned),
        ))
    return out


@router.get("/purchase-register", response_model=list[PurchaseRegisterRow])
def purchase_register(
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = current_user.company_id
    item_rows = db.query(
        PurchaseInvoiceItem.purchase_invoice_id,
        func.coalesce(func.sum(PurchaseInvoiceItem.quantity), 0),
        func.coalesce(func.sum(PurchaseInvoiceItem.free_quantity), 0),
    ).join(PurchaseInvoice, PurchaseInvoice.id == PurchaseInvoiceItem.purchase_invoice_id).filter(
        PurchaseInvoice.company_id == company_id,
    ).group_by(PurchaseInvoiceItem.purchase_invoice_id).all()
    item_map = {r[0]: (int(r[1] or 0), int(r[2] or 0)) for r in item_rows}
    return_rows = db.query(
        PurchaseReturn.purchase_invoice_id,
        func.coalesce(func.sum(PurchaseReturn.grand_total), 0),
    ).filter(PurchaseReturn.company_id == company_id).group_by(PurchaseReturn.purchase_invoice_id).all()
    return_map = {r[0]: money(r[1]) for r in return_rows}

    query = db.query(PurchaseInvoice, Supplier).join(Supplier, Supplier.id == PurchaseInvoice.supplier_id).filter(PurchaseInvoice.company_id == company_id)
    if from_date: query = query.filter(PurchaseInvoice.purchase_date >= from_date)
    if to_date: query = query.filter(PurchaseInvoice.purchase_date <= to_date)
    out = []
    for invoice, supplier in query.order_by(PurchaseInvoice.purchase_date.desc(), PurchaseInvoice.id.desc()).limit(limit).all():
        paid, free = item_map.get(invoice.id, (0, 0)); returned = return_map.get(invoice.id, Decimal("0"))
        out.append(PurchaseRegisterRow(
            invoice_id=invoice.id, purchase_date=invoice.purchase_date, purchase_number=invoice.purchase_number,
            supplier_name=supplier.supplier_name, paid_units=paid, free_units=free,
            taxable_total=money(invoice.taxable_total), cgst=money(invoice.cgst), sgst=money(invoice.sgst), igst=money(invoice.igst),
            gross_purchase=money(invoice.grand_total), returns=returned, net_purchase=money(Decimal(invoice.grand_total) - returned),
        ))
    return out


@router.get("/top-products", response_model=list[ProductPerformanceRow])
def top_products(
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(
        Product.id, Product.product_code, Product.product_name,
        func.coalesce(func.sum(SalesInvoiceItem.quantity), 0),
        func.coalesce(func.sum(SalesInvoiceItem.free_quantity), 0),
        func.coalesce(func.sum(SalesInvoiceItem.net_amount), 0),
    ).join(SalesInvoiceItem, SalesInvoiceItem.product_id == Product.id).join(
        SalesInvoice, SalesInvoice.id == SalesInvoiceItem.sales_invoice_id
    ).filter(Product.company_id == current_user.company_id, SalesInvoice.company_id == current_user.company_id)
    if from_date: query = query.filter(SalesInvoice.invoice_date >= from_date)
    if to_date: query = query.filter(SalesInvoice.invoice_date <= to_date)
    rows = query.group_by(Product.id, Product.product_code, Product.product_name).order_by(func.sum(SalesInvoiceItem.net_amount).desc()).limit(limit).all()
    return [ProductPerformanceRow(product_id=r[0], product_code=r[1], product_name=r[2], billed_units=int(r[3] or 0), free_units=int(r[4] or 0), net_sales=money(r[5])) for r in rows]


@router.get("/top-customers", response_model=list[CustomerPerformanceRow])
def top_customers(
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(
        Customer.id, Customer.customer_name,
        func.count(SalesInvoice.id),
        func.coalesce(func.sum(SalesInvoice.grand_total), 0),
    ).join(SalesInvoice, SalesInvoice.customer_id == Customer.id).filter(
        Customer.company_id == current_user.company_id, SalesInvoice.company_id == current_user.company_id,
    )
    if from_date: query = query.filter(SalesInvoice.invoice_date >= from_date)
    if to_date: query = query.filter(SalesInvoice.invoice_date <= to_date)
    rows = query.group_by(Customer.id, Customer.customer_name).order_by(func.sum(SalesInvoice.grand_total).desc()).limit(limit).all()
    return [CustomerPerformanceRow(customer_id=r[0], customer_name=r[1], invoice_count=int(r[2] or 0), net_sales=money(r[3])) for r in rows]
