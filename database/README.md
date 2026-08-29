# Database

This directory contains database-related documentation and scripts.

## Schema

The MediBill application uses PostgreSQL with the following core tables:

### Core Tables

- `companies` - Multi-tenant company data
- `users` - User accounts and authentication
- `roles` - User roles (Admin, Manager, etc.)
- `permissions` - Fine-grained permissions
- `user_roles` - User to role mapping

### Business Tables

- `customers` - Customer profiles
- `suppliers` - Supplier information
- `manufacturers` - Product manufacturers
- `categories` - Product categories
- `products` - Product master data
- `batches` - Product batches with expiry dates

### Transactions

- `inventory_transactions` - Stock movement ledger
- `current_stock` - Current inventory position
- `purchase_invoices` - Purchase order headers
- `purchase_invoice_items` - Purchase order line items
- `sales_invoices` - Sales invoice headers
- `sales_invoice_items` - Sales invoice line items
- `payments` - Payment records
- `purchase_returns` - Purchase return tracking
- `sales_returns` - Sales return tracking

### Customer Pricing

- `customer_product_prices` - Latest customer-specific prices
- `customer_product_price_history` - Historical pricing

### Settings

- `company_settings` - Company configuration
- `audit_logs` - Complete audit trail

## Migrations

Database migrations are managed with Alembic. See `../backend/alembic/` for migration files.

To apply migrations:
```bash
docker-compose exec backend alembic upgrade head
```
