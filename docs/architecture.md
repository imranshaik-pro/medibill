# MediBill Architecture

## Overview

MediBill is built as a modern three-tier web application:

1. **Frontend**: React + TypeScript + Vite
2. **Backend**: FastAPI + Python
3. **Database**: PostgreSQL

## Core Design Principles

### Multi-Tenancy

Every entity (customer, product, invoice, etc.) is scoped to a company. Company isolation is enforced at:
- Service layer
- Repository layer
- Database queries

Frontend filtering is NOT sufficient; backend isolation is mandatory.

### Authentication & Authorization

- JWT-based stateless authentication
- Role-based access control (RBAC)
- Backend authorization checks on all protected endpoints
- Password hashing with industry-standard algorithms

### Business Logic Separation

- Route handlers: Request/response handling only
- Services: Business logic, calculations, validations
- Repositories: Data access layer
- Models: Database entities
- Schemas: Request/response contracts

### Financial Accuracy

- PostgreSQL NUMERIC type for all monetary values (not float)
- Centralized calculation functions for GST, discounts, totals
- Transaction-safe invoice creation (all-or-nothing)
- Immutable historical data

## Component Architecture

### Backend Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── auth.py
│   │   │   ├── users.py
│   │   │   ├── companies.py
│   │   │   ├── customers.py
│   │   │   ├── suppliers.py
│   │   │   ├── products.py
│   │   │   ├── batches.py
│   │   │   ├── inventory.py
│   │   │   ├── purchases.py
│   │   │   ├── sales.py
│   │   │   ├── payments.py
│   │   │   ├── returns.py
│   │   │   ├── reports.py
│   │   │   └── settings.py
│   │   └── dependencies.py
│   ├── core/
│   │   ├── config.py
│   │   ├── security.py
│   │   └── constants.py
│   ├── db/
│   │   ├── base.py
│   │   ├── session.py
│   │   └── init_db.py
│   ├── models/
│   │   ├── company.py
│   │   ├── user.py
│   │   ├── customer.py
│   │   ├── product.py
│   │   └── ... (other models)
│   ├── schemas/
│   │   └── (Pydantic request/response schemas)
│   ├── services/
│   │   ├── auth.py
│   │   ├── billing.py
│   │   ├── inventory.py
│   │   └── ... (other services)
│   ├── repositories/
│   │   └── (Data access layer)
│   └── main.py
├── alembic/
│   └── versions/ (migration files)
├── tests/
├── requirements.txt
└── Dockerfile
```

### Frontend Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Layout/
│   │   ├── Dashboard/
│   │   ├── Sales/
│   │   ├── Purchases/
│   │   ├── Customers/
│   │   ├── Products/
│   │   ├── Inventory/
│   │   ├── Reports/
│   │   └── Common/
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── Onboarding/
│   │   ├── Dashboard.tsx
│   │   └── ... (other pages)
│   ├── services/
│   │   └── api.ts (Centralized API client)
│   ├── hooks/
│   ├── context/
│   ├── types/
│   ├── utils/
│   ├── routes/
│   ├── App.tsx
│   └── main.tsx
├── public/
├── Dockerfile
└── package.json
```

## Key Workflows

### Registration & Onboarding

1. User registers with email, password, name, company name
2. User logs in
3. Multi-step onboarding wizard:
   - Company details
   - Logo upload
   - GST/business info
   - Payment modes selection
   - Invoice numbering config
   - Invoice template selection
   - Review and confirm
4. Redirect to dashboard

### Billing Workflow

1. User selects customer
2. System displays customer pricing history
3. User adds products with batch selection
4. System shows:
   - Last sold price (if exists)
   - Product MRP
   - Available stock
   - Batch expiry
5. User enters quantity and can override price
6. System calculates:
   - Discount amount
   - Taxable amount
   - GST (CGST/SGST/IGST)
   - Net total
7. Backend validates:
   - Stock availability
   - Company billing readiness
   - Expired stock rejection
8. Invoice generated transactionally:
   - Sales invoice created
   - Invoice items created
   - Stock decremented
   - Inventory transaction logged
   - Customer product price updated
   - Price history recorded
   - Payment recorded
   - Audit log created
9. PDF generated and returned
10. User views/downloads/prints invoice

## Data Consistency

### Transactional Integrity

Invoice creation is atomic - either all succeeds or all rolls back:
- Invoice header creation
- Invoice items creation
- Stock reduction
- Inventory ledger update
- Customer price update
- Price history creation
- Payment record
- Audit log

### Invoice Number Generation

Invoice numbering is thread-safe and happens in the database:

```python
format: {prefix}/{year}/{counter:06d}
example: MED/2026/000001
```

The counter is incremented atomically in PostgreSQL, never in application code.

## Security Considerations

1. **Authentication**: JWT with configurable expiry
2. **Authorization**: Backend enforces role-based access
3. **Encryption**: Passwords hashed with bcrypt
4. **Isolation**: Company data strictly isolated
5. **Validation**: Input validation on all endpoints
6. **SQL Injection**: SQLAlchemy ORM prevents injection
7. **Secrets**: Never committed, loaded from environment
8. **CORS**: Configured for development and production
9. **File Uploads**: Size limits and type validation
10. **Audit**: All important changes logged

## Deployment Considerations

The architecture supports:
- Local Docker Compose development
- Containerized deployment to any platform
- Environment-based configuration
- Database migrations via Alembic
- Horizontal scaling of backend instances
- CDN for static frontend assets

For production deployment, consider:
- Environment-specific configuration
- Secrets management (HashiCorp Vault, AWS Secrets Manager, etc.)
- Load balancing
- Database backups and replication
- Monitoring and logging
- SSL/TLS termination
