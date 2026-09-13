from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


CustomerType = Literal["MEDICAL_STORE", "PHARMACY", "CLINIC", "HOSPITAL", "DISTRIBUTOR", "OTHER"]


class CustomerBase(BaseModel):
    customer_code: str = Field(min_length=1, max_length=50)
    customer_name: str = Field(min_length=1, max_length=255)
    business_name: Optional[str] = Field(default=None, max_length=255)
    customer_type: CustomerType = "OTHER"
    contact_person: Optional[str] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[EmailStr] = None
    billing_address: Optional[str] = None
    shipping_address: Optional[str] = None
    gstin: Optional[str] = Field(default=None, max_length=15)
    drug_license_number: Optional[str] = Field(default=None, max_length=100)
    drug_license_type: Optional[str] = Field(default=None, max_length=50)
    drug_license_issue_date: Optional[date] = None
    drug_license_expiry_date: Optional[date] = None
    state: Optional[str] = Field(default=None, max_length=100)
    state_code: Optional[str] = Field(default=None, max_length=10)
    pincode: Optional[str] = Field(default=None, max_length=10)
    credit_limit: Optional[Decimal] = Field(default=None, ge=0)
    credit_days: int = Field(default=30, ge=0)
    opening_balance: Decimal = Field(default=Decimal("0"))
    is_active: bool = True


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    customer_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    business_name: Optional[str] = Field(default=None, max_length=255)
    customer_type: Optional[CustomerType] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[EmailStr] = None
    billing_address: Optional[str] = None
    shipping_address: Optional[str] = None
    gstin: Optional[str] = Field(default=None, max_length=15)
    drug_license_number: Optional[str] = Field(default=None, max_length=100)
    drug_license_type: Optional[str] = Field(default=None, max_length=50)
    drug_license_issue_date: Optional[date] = None
    drug_license_expiry_date: Optional[date] = None
    state: Optional[str] = Field(default=None, max_length=100)
    state_code: Optional[str] = Field(default=None, max_length=10)
    pincode: Optional[str] = Field(default=None, max_length=10)
    credit_limit: Optional[Decimal] = Field(default=None, ge=0)
    credit_days: Optional[int] = Field(default=None, ge=0)
    opening_balance: Optional[Decimal] = None
    is_active: Optional[bool] = None


class CustomerResponse(CustomerBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    is_active: bool = True


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    is_active: Optional[bool] = None


class CategoryResponse(CategoryBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime


class ManufacturerBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    address: Optional[str] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[EmailStr] = None
    gstin: Optional[str] = Field(default=None, max_length=15)
    is_active: bool = True


class ManufacturerCreate(ManufacturerBase):
    pass


class ManufacturerUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    address: Optional[str] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[EmailStr] = None
    gstin: Optional[str] = Field(default=None, max_length=15)
    is_active: Optional[bool] = None


class ManufacturerResponse(ManufacturerBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime


class ProductBase(BaseModel):
    product_code: str = Field(min_length=1, max_length=50)
    product_name: str = Field(min_length=1, max_length=255)
    generic_name: Optional[str] = None
    brand_name: Optional[str] = None
    manufacturer_id: Optional[int] = None
    category_id: int
    schedule_category: Optional[str] = Field(default=None, max_length=50)
    dosage_form: Optional[str] = Field(default=None, max_length=100)
    strength: Optional[str] = Field(default=None, max_length=100)
    hsn_code: Optional[str] = Field(default=None, max_length=20)
    barcode: Optional[str] = Field(default=None, max_length=100)
    gst_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    unit: str = Field(default="Piece", max_length=50)
    pack_size: int = Field(default=1, ge=1)
    default_mrp: Optional[Decimal] = Field(default=None, ge=0)
    default_selling_price: Optional[Decimal] = Field(default=None, ge=0)
    minimum_sale_rate: Optional[Decimal] = Field(default=None, ge=0)
    reorder_level: int = Field(default=50, ge=0)
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    product_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    generic_name: Optional[str] = None
    brand_name: Optional[str] = None
    manufacturer_id: Optional[int] = None
    category_id: Optional[int] = None
    schedule_category: Optional[str] = Field(default=None, max_length=50)
    dosage_form: Optional[str] = Field(default=None, max_length=100)
    strength: Optional[str] = Field(default=None, max_length=100)
    hsn_code: Optional[str] = Field(default=None, max_length=20)
    barcode: Optional[str] = Field(default=None, max_length=100)
    gst_rate: Optional[Decimal] = Field(default=None, ge=0, le=100)
    unit: Optional[str] = Field(default=None, max_length=50)
    pack_size: Optional[int] = Field(default=None, ge=1)
    default_mrp: Optional[Decimal] = Field(default=None, ge=0)
    default_selling_price: Optional[Decimal] = Field(default=None, ge=0)
    minimum_sale_rate: Optional[Decimal] = Field(default=None, ge=0)
    reorder_level: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class ProductResponse(ProductBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime
