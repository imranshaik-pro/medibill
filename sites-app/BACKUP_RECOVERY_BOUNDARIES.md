# Backup and disaster-recovery boundaries

## What an agency JSON backup contains

The portable backup is a tenant-scoped business-data snapshot: customers, suppliers, product masters and batches, sales and purchase documents and lines, charges, payments, returns, stock adjustments, and agency profile metadata. Restore validates the target tenant, row types, IDs, references and limits before creating a pre-restore backup and replacing business rows in an atomic D1 batch.

Downloads now verify the stored SHA-256 checksum before returning the JSON. A checksum mismatch is a hard failure: do not restore the file.

## What it does not replace

The portable snapshot is **not a full database disaster-recovery image**. It intentionally does not let an uploaded JSON file replace authentication or administrator records, approved firm-registration state, backup configuration/history, audit history, document-number sequence counters, or internal idempotency receipts. Those records are security/control-plane state and must not be accepted as tenant-editable restore input.

When the D1 database remains intact, restore leaves these control-plane tables in place. In particular, sequence counters are not reset and idempotency receipts are retained so an old request key cannot silently create a duplicate document. Replays whose referenced document no longer exists return a conflict and require ledger review.

If the **entire D1 database is lost or replaced**, the portable JSON alone is insufficient to reconstruct authentication, audit history, sequence counters, idempotency receipts, backup metadata, or all settings. Use a separately managed database-level recovery mechanism and verify that it covers these tables as well as the business tables. Do not describe a JSON export as a complete point-in-time database backup.

## Restore runbook

1. Create a fresh backup and confirm it appears in the agency's backup list.
2. Download the backup and keep an independent copy outside the same Cloudflare account.
3. Inspect the file in MediBill before restoring; the app validates tenant identity and business-row relationships without changing data.
4. Confirm the checksum-verified download is intact. Never restore a manually edited or checksum-mismatched stored backup.
5. Type `RESTORE` only after confirming the target agency and backup timestamp. Restore creates a pre-restore backup before any destructive write.
6. After restore, reconcile stock totals, customer/supplier outstanding balances, invoice counts, and recent payments/returns against independent accounting exports.
7. Perform a test restore in a non-production environment periodically. A successful backup creation alone does not prove recoverability.

## Operational limits

- Interactive JSON restore is capped at 16 MB and 20,000 business records; larger recoveries require a staged/offline process.
- The current UI's Google Drive and AWS S3 selections are configuration labels only unless their separate connectors are implemented and verified. The supported cloud backup path requires the configured Cloudflare R2 bucket.
- Automatic scheduling currently depends on application activity; it is not a guaranteed independent scheduler or 24×7 backup service.
- A successful CI build does not prove production recovery. Verify the actual deployed environment, R2 binding, access controls, backup integrity, and a test restore before relying on it.

No production database, live backup, or deployment is modified by this document or by the repository changes.
