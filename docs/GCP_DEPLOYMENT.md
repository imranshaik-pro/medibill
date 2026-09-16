# MediBill Google Cloud Deployment

This guide prepares MediBill for a production Google Cloud deployment. Do not commit passwords, API keys, JWT secrets, database URLs, service-account keys, or billing information to Git or chat.

## Target architecture

- Artifact Registry: private backend/frontend container images.
- Cloud Run: backend API and frontend web service.
- Cloud SQL for PostgreSQL: managed production database with automated backups/PITR configured in Google Cloud.
- Secret Manager: database URL, JWT secret, GST provider key, and future email credentials.
- Dedicated `medibill-runtime` service account with Cloud SQL Client and Secret Manager Secret Accessor only for required secrets.
- Cloud Run Job: executes `alembic upgrade head` before an application release is promoted.
- HTTPS: Cloud Run provides HTTPS on its service URL; a custom domain/load balancer can be added later.

Default deployment region in repository scripts is `asia-south1`. Confirm the agency's required region, compliance needs, availability requirements, and pricing before creating production resources.

## Required APIs

Enable Cloud Run, Cloud SQL Admin, Artifact Registry, Cloud Build, Secret Manager, and IAM APIs in the agency-owned Google Cloud project.

## Resource bootstrap outline

Run these commands from authenticated Google Cloud Shell or a workstation with the Google Cloud CLI. Replace placeholders locally; never commit their values.

```bash
export PROJECT_ID="YOUR_AGENCY_PROJECT_ID"
export REGION="asia-south1"
gcloud config set project "$PROJECT_ID"

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com

gcloud artifacts repositories create medibill \
  --repository-format=docker \
  --location="$REGION" \
  --description="MediBill production images"

gcloud iam service-accounts create medibill-runtime \
  --display-name="MediBill Cloud Run runtime"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:medibill-runtime@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"
```

Create the Cloud SQL PostgreSQL instance/database/user in the Google Cloud console or CLI using a strong password that is never committed. Enable automated backups and point-in-time recovery before importing production data.

## Secrets

Create these Secret Manager secrets from local/Cloud Shell input, not from repository files:

- `medibill-database-url`
- `medibill-jwt-secret`
- `medibill-gstinapi-key` when GST lookup is enabled
- future email-provider credentials for production password-reset delivery

Grant the runtime service account Secret Accessor only on the individual secrets it needs.

For Cloud SQL through a Cloud Run Unix socket, the SQLAlchemy URL can use the Cloud SQL socket as the PostgreSQL host/query configuration. Validate the exact connection string against the selected SQLAlchemy/psycopg2 driver before production deployment.

## Build

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_REPOSITORY=medibill
```

Use an immutable image tag/digest for production releases. Do not rely on a mutable `latest` tag for rollback-sensitive deployments.

## Database migration

Database migrations are a release step, not a Cloud Run web-service startup side effect. Set the required environment variables locally, then run:

```bash
bash scripts/GCP_MIGRATE_DB.sh
```

The helper deploys/executes the `medibill-migrate` Cloud Run Job with the same backend image and runs `alembic upgrade head`. Do not deploy a backend revision that expects a newer schema until this job succeeds.

## Data migration from local MediBill

1. Stop write activity or schedule a maintenance window.
2. Run the Phase 18 local backup script and keep that backup unchanged.
3. Create a second export for import testing.
4. Import into Cloud SQL using supported PostgreSQL tooling/Cloud SQL import workflow.
5. Verify Alembic revision, row counts for critical tables, tenant/company/user records, invoice totals, stock totals, receivables/payables, and login.
6. Run cloud smoke tests before switching users to the cloud URL.
7. Keep the local database read-only/unchanged until cloud acceptance is complete.

Never delete the local Docker volume as part of cloud migration.

## Production gates

Before go-live verify: HTTPS, production `APP_ENV=production`, `DEBUG=false`, strong Secret Manager JWT secret, Cloud SQL backups/PITR, least-privilege IAM, GST secret access, CORS/domain configuration, migration job success, tenant-isolation regression, invoice/print test, backup restore drill, and actual email delivery for password reset.

Phase 19 repository work prepares deployment; creating billable Google Cloud resources and importing the agency database must be performed in the agency-owned project with explicit operator control.
