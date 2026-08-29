# MediBill

A modern medical-agency billing, inventory, customer, purchase, sales, payment, GST and reporting application.

## Features

- **User Management**: Registration, authentication, role-based access control
- **Company Management**: Multi-tenant company isolation
- **Customer Management**: Customer profiles with pricing history
- **Product Management**: Product catalog with batches and expiry tracking
- **Inventory Management**: Stock tracking with transaction ledger
- **Billing**: Sales invoices with customer-specific pricing
- **Purchases**: Purchase management with supplier tracking
- **Payments**: Payment tracking and reconciliation
- **GST Compliance**: CGST, SGST, IGST calculations
- **PDF Invoices**: Professional invoice generation
- **Audit Logging**: Complete audit trail for compliance

## Technology Stack

- **Backend**: Python, FastAPI, SQLAlchemy, PostgreSQL
- **Frontend**: React, TypeScript, Vite
- **Database**: PostgreSQL
- **Infrastructure**: Docker, Docker Compose
- **CI/CD**: GitHub Actions

## Quick Start

### Prerequisites

- Docker
- Docker Compose
- Git

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/imranshaik-pro/medibill.git
cd medibill
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Start the application:
```bash
docker-compose up -d
```

4. Run database migrations:
```bash
docker-compose exec backend alembic upgrade head
```

5. Access the application:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

## Project Structure

```
medibill/
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── api/          # API routes
│   │   ├── core/         # Core configuration
│   │   ├── db/           # Database
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Business logic
│   │   ├── repositories/ # Data access
│   │   └── main.py       # Application entry point
│   ├── alembic/          # Database migrations
│   ├── tests/            # Backend tests
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/             # React frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components
│   │   ├── services/     # API client
│   │   ├── types/        # TypeScript types
│   │   └── App.tsx       # Root component
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

## API Documentation

Once the backend is running, visit: http://localhost:8000/docs

## Database Migrations

Create a new migration:
```bash
docker-compose exec backend alembic revision --autogenerate -m "Add new feature"
```

Apply migrations:
```bash
docker-compose exec backend alembic upgrade head
```

## Testing

Run backend tests:
```bash
docker-compose exec backend pytest
```

Run frontend tests:
```bash
docker-compose exec frontend npm test
```

## Development

Backend logs:
```bash
docker-compose logs -f backend
```

Frontend logs:
```bash
docker-compose logs -f frontend
```

Database access:
```bash
docker-compose exec postgres psql -U medibill_user -d medibill_db
```

## Documentation

- [Architecture](docs/architecture.md)
- [Database Schema](docs/database.md)
- [API Reference](docs/api.md)
- [Deployment Guide](docs/deployment.md)

## License

MIT License

## Support

For issues and feature requests, please use the GitHub Issues page.
