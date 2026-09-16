#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${REGION:=asia-south1}"
: "${BACKEND_IMAGE:?Set BACKEND_IMAGE to the Artifact Registry backend image}"
: "${INSTANCE_CONNECTION_NAME:?Set INSTANCE_CONNECTION_NAME}"

JOB_NAME="medibill-migrate"
SERVICE_ACCOUNT="medibill-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud run jobs deploy "${JOB_NAME}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --image "${BACKEND_IMAGE}" \
  --service-account "${SERVICE_ACCOUNT}" \
  --add-cloudsql-instances "${INSTANCE_CONNECTION_NAME}" \
  --set-env-vars "APP_ENV=production,DEBUG=false" \
  --set-secrets "DATABASE_URL=medibill-database-url:latest,JWT_SECRET=medibill-jwt-secret:latest" \
  --command alembic \
  --args upgrade,head

gcloud run jobs execute "${JOB_NAME}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --wait
