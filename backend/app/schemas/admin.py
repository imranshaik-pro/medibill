from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class PermissionInfo(BaseModel):
    id: int
    name: str
    description: str | None = None

    class Config:
        from_attributes = True


class RoleInfo(BaseModel):
    id: int
    name: str
    description: str | None = None
    is_active: bool
    permissions: list[PermissionInfo] = []

    class Config:
        from_attributes = True


class AdminUserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    mobile: str | None = Field(default=None, max_length=20)
    password: str = Field(min_length=8, max_length=128)
    role_ids: list[int] = Field(min_length=1)


class AdminUserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    mobile: str | None = Field(default=None, max_length=20)
    is_active: bool | None = None
    role_ids: list[int] | None = None
    new_password: str | None = Field(default=None, min_length=8, max_length=128)


class AdminUserInfo(BaseModel):
    id: int
    name: str
    email: EmailStr
    mobile: str | None = None
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime
    roles: list[RoleInfo] = []

    class Config:
        from_attributes = True


class RoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    permission_ids: list[int] = []


class RoleUpdate(BaseModel):
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None
    permission_ids: list[int] | None = None


class AuditLogInfo(BaseModel):
    id: int
    user_id: int | None = None
    action: str
    entity_type: str | None = None
    entity_id: int | None = None
    old_value: str | None = None
    new_value: str | None = None
    timestamp: datetime
    user_name: str | None = None


class BusinessControlUpdate(BaseModel):
    invoice_prefix: str | None = Field(default=None, max_length=10)
    default_payment_mode: str | None = Field(default=None, max_length=100)
    currency: str | None = Field(default=None, max_length=10)
    selected_invoice_template: str | None = Field(default=None, max_length=100)
