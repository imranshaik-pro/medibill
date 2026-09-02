from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

from app.schemas.master_data import (
    CustomerCreate, CustomerUpdate, CustomerResponse,
    CategoryCreate, CategoryUpdate, CategoryResponse,
    ManufacturerCreate, ManufacturerUpdate, ManufacturerResponse,
    ProductCreate, ProductUpdate, ProductResponse,
)
from app.schemas.inventory import (
    BatchCreate, BatchUpdate, BatchResponse,
    StockAdjustmentCreate, StockResponse, InventoryTransactionResponse,
)


class UserBase(BaseModel):
    name: str
    email: EmailStr
    mobile: Optional[str] = None


class UserCreate(UserBase):
    password: str
    company_name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    id: int
    company_id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


__all__ = [
    "UserBase", "UserCreate", "UserLogin", "UserResponse", "TokenResponse",
    "CustomerCreate", "CustomerUpdate", "CustomerResponse",
    "CategoryCreate", "CategoryUpdate", "CategoryResponse",
    "ManufacturerCreate", "ManufacturerUpdate", "ManufacturerResponse",
    "ProductCreate", "ProductUpdate", "ProductResponse",
    "BatchCreate", "BatchUpdate", "BatchResponse",
    "StockAdjustmentCreate", "StockResponse", "InventoryTransactionResponse",
]
