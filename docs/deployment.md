# MediBill Deployment Guide

## Development Deployment

### Prerequisites

- Docker Desktop or Docker Engine
- Docker Compose
- Git

### Local Development Setup

1. Clone the repository:

```bash
git clone https://github.com/imranshaik-pro/medibill.git
cd medibill
```

2. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` with your development values.

3. Build and start services:

```bash
docker-compose up -d
```

4. Initialize database:

```bash
docker-compose exec backend alembic upgrade head
```

5. Access the application:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Database: localhost:5432

### Development Commands

View logs:

```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

Run backend tests:

```bash
docker-compose exec backend pytest
```

Access database:

```bash
docker-compose exec postgres psql -U medibill_user -d medibill_db
```

Create database migration:

```bash
docker-compose exec backend alembic revision --autogenerate -m "Migration description"
docker-compose exec backend alembic upgrade head
```

## Production Deployment

### Environment Configuration

Create a production `.env` file with:

```
APP_ENV=production
DEBUG=false
DATABASE_URL=postgresql://user:password@host:5432/medibill_prod
JWT_SECRET=your-production-secret-key-min-32-chars-very-secure
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
CORS_ORIGINS=["https://yourdomain.com"]
```

### Docker Image Building

Build production images:

```bash
docker build -t medibill-backend:latest ./backend
docker build -t medibill-frontend:latest ./frontend
```

### Database Preparation

For production PostgreSQL:

1. Create database and user
2. Set appropriate permissions
3. Enable SSL connections
4. Configure backups
5. Set up replication (optional)

Run migrations on production:

```bash
docker exec medibill_backend alembic upgrade head
```

### Deployment Options

#### Docker Compose (Single Server)

Deploy to a single server with Docker Compose:

```bash
git clone https://github.com/imranshaik-pro/medibill.git
cd medibill
cp .env.example .env
# Edit .env with production values
docker-compose -f docker-compose.yml up -d
```

#### Kubernetes

For Kubernetes deployment, create:

- `k8s/backend-deployment.yaml`
- `k8s/frontend-deployment.yaml`
- `k8s/postgres-statefulset.yaml`
- `k8s/services.yaml`
- `k8s/configmap.yaml`
- `k8s/secrets.yaml`

#### Cloud Platforms

**AWS:**
- ECS for containers
- RDS for PostgreSQL
- ALB for load balancing
- S3 for static assets

**GCP:**
- Cloud Run for backend
- Cloud SQL for PostgreSQL
- Cloud CDN for frontend

**Azure:**
- App Service for backend
- Database for PostgreSQL
- CDN for frontend

### SSL/TLS Configuration

For production, use SSL/TLS:

1. Obtain certificate (Let's Encrypt recommended)
2. Configure reverse proxy (Nginx/Traefik)
3. Enable HTTPS redirect
4. Set HSTS headers

### Monitoring & Logging

1. **Application Logs**: Centralize with ELK Stack, Splunk, or cloud provider
2. **Metrics**: Use Prometheus + Grafana
3. **Error Tracking**: Sentry for exception tracking
4. **Health Checks**: Configure Kubernetes probes or ALB health checks

### Backup & Recovery

1. **Database Backups**:
   ```bash
   # Daily automated backups
   pg_dump medibill_db | gzip > backup_$(date +%Y%m%d).sql.gz
   ```

2. **File Backups**: Backup upload directory to cloud storage

3. **Restoration Test**: Regularly test backup restoration

### Security Hardening

1. **Database**:
   - Use strong passwords
   - Enable SSL/TLS
   - Restrict network access
   - Enable audit logging

2. **Application**:
   - Set environment variables for secrets
   - Enable CORS for specific domains only
   - Use security headers
   - Enable rate limiting

3. **Infrastructure**:
   - Use firewall rules
   - Enable DDoS protection
   - Regular security patches
   - Network segmentation

### Performance Optimization

1. **Frontend**:
   - CDN for static assets
   - Compression (gzip/brotli)
   - Caching headers
   - Lazy loading

2. **Backend**:
   - Database connection pooling
   - Query optimization
   - Caching layer (Redis)
   - Load balancing

3. **Database**:
   - Indexing strategy
   - Query optimization
   - Connection pooling
   - Read replicas for reporting

### Scaling

1. **Horizontal Scaling**:
   - Multiple backend instances
   - Load balancer
   - Sticky sessions for state (if needed)

2. **Vertical Scaling**:
   - Increase server resources
   - Database instance sizing
   - Connection pool tuning

3. **Database Scaling**:
   - Read replicas
   - Partitioning by company (multi-tenant sharding)
   - Connection pooling (PgBouncer)

## Maintenance

### Regular Tasks

- Monitor disk space
- Monitor database growth
- Review logs for errors
- Update dependencies
- Test backup restoration
- Security patching

### Upgrades

1. Test in staging environment
2. Create database backup
3. Deploy with rolling update
4. Monitor for issues
5. Keep rollback plan ready

## Troubleshooting

Common issues and solutions:

**Backend won't start:**
- Check database connectivity
- Verify environment variables
- Review startup logs

**High memory usage:**
- Check for memory leaks
- Monitor active connections
- Review slow queries

**Database connection errors:**
- Check connection pool settings
- Verify database credentials
- Monitor connection count

**Slow performance:**
- Analyze slow queries
- Check database indexes
- Review cache hit rates
- Check resource utilization
