from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_permission
from app.db.session import get_db
from app.models.category import Category
from app.models.customer import Customer
from app.models.manufacturer import Manufacturer
from app.models.product import Product
from app.models.user import User
from app.schemas import (
    CategoryCreate, CategoryResponse, CategoryUpdate,
    CustomerCreate, CustomerResponse, CustomerUpdate,
    ManufacturerCreate, ManufacturerResponse, ManufacturerUpdate,
    ProductCreate, ProductResponse, ProductUpdate,
)

router = APIRouter()


def _conflict(detail: str):
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


@router.get("/customers", response_model=list[CustomerResponse])
def list_customers(
    search: str | None = Query(default=None, max_length=100),
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Customer).filter(Customer.company_id == current_user.company_id)
    if active_only:
        query = query.filter(Customer.is_active.is_(True))
    if search:
        pattern = f"%{search}%"
        query = query.filter((Customer.customer_name.ilike(pattern)) | (Customer.customer_code.ilike(pattern)))
    return query.order_by(Customer.customer_name).all()


@router.post("/customers", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
def create_customer(
    data: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_customers")),
):
    customer = Customer(company_id=current_user.company_id, **data.model_dump())
    db.add(customer)
    try:
        db.commit()
        db.refresh(customer)
    except IntegrityError:
        db.rollback()
        raise _conflict("Customer code already exists for this company")
    return customer


@router.get("/customers/{customer_id}", response_model=CustomerResponse)
def get_customer(customer_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customer = db.query(Customer).filter(Customer.id == customer_id, Customer.company_id == current_user.company_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.patch("/customers/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: int, data: CustomerUpdate, db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("manage_customers")),
):
    customer = db.query(Customer).filter(Customer.id == customer_id, Customer.company_id == current_user.company_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(customer, key, value)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/categories", response_model=list[CategoryResponse])
def list_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Category).filter(Category.company_id == current_user.company_id).order_by(Category.name).all()


@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryCreate, db: Session = Depends(get_db), current_user: User = Depends(require_permission("manage_products"))):
    category = Category(company_id=current_user.company_id, **data.model_dump())
    db.add(category)
    try:
        db.commit(); db.refresh(category)
    except IntegrityError:
        db.rollback(); raise _conflict("Category name already exists for this company")
    return category


@router.patch("/categories/{category_id}", response_model=CategoryResponse)
def update_category(category_id: int, data: CategoryUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_permission("manage_products"))):
    category = db.query(Category).filter(Category.id == category_id, Category.company_id == current_user.company_id).first()
    if not category: raise HTTPException(status_code=404, detail="Category not found")
    for key, value in data.model_dump(exclude_unset=True).items(): setattr(category, key, value)
    try: db.commit(); db.refresh(category)
    except IntegrityError: db.rollback(); raise _conflict("Category name already exists for this company")
    return category


@router.get("/manufacturers", response_model=list[ManufacturerResponse])
def list_manufacturers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Manufacturer).filter(Manufacturer.company_id == current_user.company_id).order_by(Manufacturer.name).all()


@router.post("/manufacturers", response_model=ManufacturerResponse, status_code=status.HTTP_201_CREATED)
def create_manufacturer(data: ManufacturerCreate, db: Session = Depends(get_db), current_user: User = Depends(require_permission("manage_products"))):
    manufacturer = Manufacturer(company_id=current_user.company_id, **data.model_dump())
    db.add(manufacturer)
    try: db.commit(); db.refresh(manufacturer)
    except IntegrityError: db.rollback(); raise _conflict("Manufacturer name already exists for this company")
    return manufacturer


@router.patch("/manufacturers/{manufacturer_id}", response_model=ManufacturerResponse)
def update_manufacturer(manufacturer_id: int, data: ManufacturerUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_permission("manage_products"))):
    manufacturer = db.query(Manufacturer).filter(Manufacturer.id == manufacturer_id, Manufacturer.company_id == current_user.company_id).first()
    if not manufacturer: raise HTTPException(status_code=404, detail="Manufacturer not found")
    for key, value in data.model_dump(exclude_unset=True).items(): setattr(manufacturer, key, value)
    try: db.commit(); db.refresh(manufacturer)
    except IntegrityError: db.rollback(); raise _conflict("Manufacturer name already exists for this company")
    return manufacturer


@router.get("/products", response_model=list[ProductResponse])
def list_products(
    search: str | None = Query(default=None, max_length=100), active_only: bool = True,
    category_id: int | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    query = db.query(Product).filter(Product.company_id == current_user.company_id)
    if active_only: query = query.filter(Product.is_active.is_(True))
    if category_id is not None: query = query.filter(Product.category_id == category_id)
    if search:
        pattern = f"%{search}%"
        query = query.filter((Product.product_name.ilike(pattern)) | (Product.product_code.ilike(pattern)) | (Product.generic_name.ilike(pattern)))
    return query.order_by(Product.product_name).all()


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(data: ProductCreate, db: Session = Depends(get_db), current_user: User = Depends(require_permission("manage_products"))):
    category = db.query(Category).filter(Category.id == data.category_id, Category.company_id == current_user.company_id).first()
    if not category: raise HTTPException(status_code=400, detail="Category does not belong to this company")
    if data.manufacturer_id is not None:
        manufacturer = db.query(Manufacturer).filter(Manufacturer.id == data.manufacturer_id, Manufacturer.company_id == current_user.company_id).first()
        if not manufacturer: raise HTTPException(status_code=400, detail="Manufacturer does not belong to this company")
    product = Product(company_id=current_user.company_id, **data.model_dump())
    db.add(product)
    try: db.commit(); db.refresh(product)
    except IntegrityError: db.rollback(); raise _conflict("Product code already exists for this company")
    return product


@router.get("/products/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    product = db.query(Product).filter(Product.id == product_id, Product.company_id == current_user.company_id).first()
    if not product: raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.patch("/products/{product_id}", response_model=ProductResponse)
def update_product(product_id: int, data: ProductUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_permission("manage_products"))):
    product = db.query(Product).filter(Product.id == product_id, Product.company_id == current_user.company_id).first()
    if not product: raise HTTPException(status_code=404, detail="Product not found")
    changes = data.model_dump(exclude_unset=True)
    if "category_id" in changes:
        category = db.query(Category).filter(Category.id == changes["category_id"], Category.company_id == current_user.company_id).first()
        if not category: raise HTTPException(status_code=400, detail="Category does not belong to this company")
    if "manufacturer_id" in changes and changes["manufacturer_id"] is not None:
        manufacturer = db.query(Manufacturer).filter(Manufacturer.id == changes["manufacturer_id"], Manufacturer.company_id == current_user.company_id).first()
        if not manufacturer: raise HTTPException(status_code=400, detail="Manufacturer does not belong to this company")
    for key, value in changes.items(): setattr(product, key, value)
    db.commit(); db.refresh(product)
    return product
