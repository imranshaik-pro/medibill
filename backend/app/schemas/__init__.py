from pydantic import BaseModel, EmailStr, Field
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
from app.schemas.purchase import (
    SupplierCreate, SupplierUpdate, SupplierResponse,
    PurchaseItemCreate, PurchaseInvoiceCreate, PurchaseItemResponse, PurchaseInvoiceResponse,
)


class UserBase(BaseModel):
    name: str
    email: EmailStr
    mobile: Optional[str] = None


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)
    company_name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    new_password: str = Field(min_length=8, max_length=128)


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
    "ForgotPasswordRequest", "ForgotPasswordResponse", "ResetPasswordRequest",
    "CustomerCreate", "CustomerUpdate", "CustomerResponse",
    "CategoryCreate", "CategoryUpdate", "CategoryResponse",
    "ManufacturerCreate", "ManufacturerUpdate", "ManufacturerResponse",
    "ProductCreate", "ProductUpdate", "ProductResponse",
    "BatchCreate", "BatchUpdate", "BatchResponse",
    "StockAdjustmentCreate", "StockResponse", "InventoryTransactionResponse",
    "SupplierCreate", "SupplierUpdate", "SupplierResponse",
    "PurchaseItemCreate", "PurchaseInvoiceCreate", "PurchaseItemResponse", "PurchaseInvoiceResponse",
]
