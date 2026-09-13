from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, Field, model_validator


class BatchCreate(BaseModel):
    product_id: int
    batch_number: str = Field(min_length=1, max_length=50)
    manufacturing_date: date | None = None
    expiry_date: date
    mrp: Decimal = Field(ge=0, decimal_places=2, max_digits=12)
    purchase_rate: Decimal = Field(ge=0, decimal_places=2, max_digits=12)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.manufacturing_date and self.expiry_date < self.manufacturing_date:
            raise ValueError("Expiry date cannot be before manufacturing date")
        return self


class BatchUpdate(BaseModel):
    manufacturing_date: date | None = None
    expiry_date: date | None = None
    mrp: Decimal | None = Field(default=None, ge=0, decimal_places=2, max_digits=12)
    purchase_rate: Decimal | None = Field(default=None, ge=0, decimal_places=2, max_digits=12)
    is_active: bool | None = None


class BatchResponse(BaseModel):
    id: int
    company_id: int
    product_id: int
    batch_number: str
    manufacturing_date: date | None
    expiry_date: date
    mrp: Decimal
    purchase_rate: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


AdjustmentReason = Literal["DAMAGE", "EXPIRED", "PHYSICAL_SHORTAGE", "PHYSICAL_EXCESS", "SAMPLE", "INTERNAL_USE", "OTHER"]


class StockAdjustmentCreate(BaseModel):
    product_id: int
    batch_id: int
    quantity: int = Field(ne=0)
    reason: AdjustmentReason
    notes: str | None = Field(default=None, max_length=1000)
    unit_cost: Decimal | None = Field(default=None, ge=0, decimal_places=2, max_digits=12)
    transaction_date: date | None = None

    @model_validator(mode="after")
    def validate_reason_direction(self):
        if self.reason in {"DAMAGE", "EXPIRED", "PHYSICAL_SHORTAGE", "SAMPLE", "INTERNAL_USE"} and self.quantity > 0:
            raise ValueError(f"{self.reason} adjustment must reduce stock")
        if self.reason == "PHYSICAL_EXCESS" and self.quantity < 0:
            raise ValueError("PHYSICAL_EXCESS adjustment must increase stock")
        if self.reason == "OTHER" and not (self.notes or "").strip():
            raise ValueError("Notes are required when adjustment reason is OTHER")
        return self


class StockResponse(BaseModel):
    id: int
    company_id: int
    product_id: int
    batch_id: int
    quantity_on_hand: int
    quantity_reserved: int
    quantity_available: int
    last_stock_date: datetime | None
    product_name: str
    product_code: str
    batch_number: str
    expiry_date: date


class InventoryTransactionResponse(BaseModel):
    id: int
    company_id: int
    product_id: int
    batch_id: int
    transaction_type: str
    reference_type: str | None
    reference_id: int | None
    reason: str | None = None
    notes: str | None = None
    quantity: int
    unit_cost: Decimal | None
    transaction_date: date
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True
