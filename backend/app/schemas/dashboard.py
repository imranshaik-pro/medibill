from decimal import Decimal

from pydantic import BaseModel


class DashboardSummary(BaseModel):
    today_sales: Decimal
    monthly_sales: Decimal
    total_sales: Decimal
    today_purchases: Decimal
    monthly_purchases: Decimal
    today_collections: Decimal
    total_receivables: Decimal
    total_payables: Decimal
    current_stock_units: int
    current_stock_value: Decimal
    low_stock_items: int
    near_expiry_batches: int
    expired_batches: int
    today_estimated_gross_profit: Decimal
