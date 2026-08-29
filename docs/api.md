# MediBill API Reference

## Base URL

```
http://localhost:8000/api/v1
```

## Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <access_token>
```

Obtain a token by logging in:

```
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

Response:
{
  "access_token": "...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

## Endpoints

### Authentication

#### Register

```
POST /auth/register
```

Request:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secure_password",
  "company_name": "ABC Pharma"
}
```

#### Login

```
POST /auth/login
```

#### Logout

```
POST /auth/logout
```

### Users

#### Get Current User

```
GET /users/me
```

#### List Users

```
GET /users
```

#### Create User

```
POST /users
```

### Customers

#### List Customers

```
GET /customers?skip=0&limit=100&search=query
```

#### Get Customer

```
GET /customers/{id}
```

#### Create Customer

```
POST /customers
```

Request:
```json
{
  "customer_code": "CUST001",
  "customer_name": "ABC Medical",
  "contact_person": "John Doe",
  "phone": "9876543210",
  "email": "abc@medical.com",
  "billing_address": "123 Main St",
  "gstin": "27AABCT1234H1Z0",
  "state": "Maharashtra",
  "pincode": "400001"
}
```

#### Update Customer

```
PUT /customers/{id}
```

### Products

#### List Products

```
GET /products?skip=0&limit=100&search=query&category=id
```

#### Get Product

```
GET /products/{id}
```

#### Create Product

```
POST /products
```

Request:
```json
{
  "product_code": "PROD001",
  "product_name": "Paracetamol 500mg",
  "generic_name": "Paracetamol",
  "manufacturer_id": 1,
  "category_id": 1,
  "hsn_code": "3004",
  "gst_rate": 12,
  "default_mrp": 100,
  "default_selling_price": 85
}
```

### Batches

#### List Batches

```
GET /batches?product_id=1
```

#### Create Batch

```
POST /batches
```

Request:
```json
{
  "product_id": 1,
  "batch_number": "BATCH001",
  "manufacturing_date": "2026-01-15",
  "expiry_date": "2028-01-15",
  "mrp": 100,
  "purchase_rate": 60
}
```

### Inventory

#### Get Stock Position

```
GET /inventory/stock?product_id=1
```

#### Record Stock Movement

```
POST /inventory/transactions
```

Request:
```json
{
  "product_id": 1,
  "batch_id": 1,
  "transaction_type": "PURCHASE",
  "quantity": 100,
  "unit_cost": 60,
  "transaction_date": "2026-08-29"
}
```

### Sales

#### Create Sales Invoice

```
POST /sales/invoices
```

Request:
```json
{
  "customer_id": 1,
  "invoice_date": "2026-08-29",
  "payment_mode": "Cash",
  "items": [
    {
      "product_id": 1,
      "batch_id": 1,
      "quantity": 10,
      "selling_price": 85,
      "discount_percent": 5
    }
  ]
}
```

Response:
```json
{
  "id": 1,
  "invoice_number": "MED/2026/000001",
  "grand_total": 800,
  "payment_status": "Paid"
}
```

#### Get Sales Invoice

```
GET /sales/invoices/{id}
```

#### List Sales Invoices

```
GET /sales/invoices?customer_id=1&start_date=2026-01-01&end_date=2026-12-31
```

#### Download Invoice PDF

```
GET /sales/invoices/{id}/pdf
```

### Payments

#### Record Payment

```
POST /payments
```

Request:
```json
{
  "sales_invoice_id": 1,
  "amount": 800,
  "payment_date": "2026-08-29",
  "payment_mode": "Cash",
  "reference_number": "TXN123"
}
```

#### List Payments

```
GET /payments?customer_id=1
```

### Reports

#### Daily Sales

```
GET /reports/daily-sales?date=2026-08-29
```

#### Customer Statement

```
GET /reports/customer-statement/{customer_id}?start_date=2026-01-01&end_date=2026-12-31
```

#### Stock Report

```
GET /reports/stock
```

#### Near Expiry

```
GET /reports/near-expiry?days=30
```

### Settings

#### Get Company Settings

```
GET /settings/company
```

#### Update Company Settings

```
PUT /settings/company
```

Request:
```json
{
  "invoice_prefix": "MED",
  "invoice_terms": "Net 30",
  "default_payment_mode": "Cash",
  "selected_invoice_template": "Professional Classic"
}
```

## Error Handling

API errors follow a consistent format:

```json
{
  "detail": "Error message",
  "error_code": "ERROR_CODE",
  "status_code": 400
}
```

Common status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 409: Conflict
- 500: Internal Server Error

## Pagination

List endpoints support pagination:

```
GET /customers?skip=0&limit=50
```

Response:
```json
{
  "items": [...],
  "total": 100,
  "skip": 0,
  "limit": 50
}
```
