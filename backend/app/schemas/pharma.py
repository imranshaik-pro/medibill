from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class FefoBatchSuggestion(BaseModel):
    batch_id: int
    product_id: int
    batch_number: str
    expiry_date: date
    days_to_expiry: int
    quantity_on_hand: int
    quantity_reserved: int
    quantity_available: int
    mrp: Decimal
    purchase_rate: Decimal
    recommended: bool = False


class ExpiryStockRow(BaseModel):
    product_id: int
    product_code: str
    product_name: str
    batch_id: int
    batch_number: str
    expiry_date: date
    days_to_expiry: int
    expiry_bucket: str
    quantity_available: int
    purchase_rate: Decimal
    mrp: Decimal
    purchase_value: Decimal
    mrp_value: Decimal


class ExpiryDashboard(BaseModel):
    expired_count: int
    within_30_count: int
    days_31_60_count: int
    days_61_90_count: int
    days_91_180_count: int
    rows: list[ExpiryStockRow]


class CustomerCreditProfile(BaseModel):
    customer_id: int
    customer_name: str
    credit_limit: Decimal | None
    opening_balance: Decimal
    outstanding: Decimal
    available_credit: Decimal | None
    credit_days: int
    drug_license_number: str | None
    drug_license_expiry_date: date | None
    licence_status: str
