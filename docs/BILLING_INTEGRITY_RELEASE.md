# Billing integrity release

## Scope and deployment identity

This release targets the root React/Vite + FastAPI + SQLAlchemy/PostgreSQL application based on main c402dfc. It does not modify the separate Sites/Cloudflare application or replace persistence with Prisma. Confirm the actual production image/revision and database before rollout. No live migration is performed by this PR.

Implemented:
- `create_invoice` for sales, `collect_payment` for customer collections, `pay_supplier` for supplier payments; explicit capabilities/reasons for credit and minimum-rate overrides. Expired-stock override is rejected.
- Optional `Idempotency-Key` on POST `/api/v1/sales/invoices`. Scope: authenticated company, actor and operation. Canonical validated request hash, transaction-scoped PostgreSQL advisory lock, persisted original response, unique receipt constraint. A changed payload returns 409. Old clients without the header remain supported, but do not gain replay support.
- Original request/key saved in browser storage under tenant/user scope before sending. Failed or uncertain submissions survive reload; retry sends the stored payload. Storage failure blocks sending. Revoked permissions may require administrator reconciliation; never clear browser storage blindly to resolve an uncertain sale.
- Customer -> invoice -> ordered stock locking for sales/payment/return paths. Supplier locking for purchase posting, supplier payments and purchase returns. Original invoice is locked before aggregate return-cap checks. These guards require all writers to use the new protocol; do not claim mixed old/new replicas enforce them.
- JSON issued-document snapshots on NEW invoices only, populated inside posting transaction. Reprint uses the full original document, including payment state at issuance. Current payment/due state remains available from the sales/receivables APIs. Historic invoices with NULL snapshots continue existing live-master rendering; they are not silently reconstructed as original evidence.
- Audit rows for sale posting, customer payments, sales returns and purchase returns commit with their mutations. This is not a complete read/export/security audit system or a HIPAA compliance claim.

Not included: shared offline posting, OCR providers, WebSockets, clearinghouse integrations, full payment-allocation/advance accounting, old-data reconstruction, multi-region failover.

## Migration

Revision `20261024_0003` adds nullable `sales_invoices.document_snapshot` and the new `command_receipts` table. It contains no invoice/stock rewrites or destructive DDL. PostgreSQL lock timeout is three seconds: a long transaction may cause the release job to fail safely; inspect blockers before retrying.

The previous baseline imported current application models. It is frozen to explicit original-schema operations so fresh installations do not create new columns before the incremental revision. Already-versioned databases do not rerun it. Never stamp a database to head without checking its real schema.

New permission catalog entries are granted to existing default role names:

| Permission | Default roles |
|---|---|
| collect_payment | Admin, Manager, Billing Operator, Accounts |
| pay_supplier | Admin, Manager, Accounts |
| override_credit_limit | Admin, Manager |
| override_minimum_sale_rate | Admin, Manager |

Custom roles are not automatically granted new capabilities. Existing inventory-only users lose unintended billing/payment privileges. Review this policy on a restored copy and assign custom roles deliberately before switching application traffic. New-tenant role seeds use the same defaults. Future role seeding does not overwrite customized nonempty roles.

## Staging gates

1. Restore a recent production backup plus required document objects to an isolated environment; record database version, deployed commit and `alembic current`.
2. Run migrations from the actual previous revision, not only on an empty database. Preserve row counts/checksums for business tables and check old API reads/writes after expansion.
3. Run `alembic check`, backend tests on PostgreSQL, frontend retry tests and production build. Concurrency tests must not be skipped in CI.
4. Reconcile stock, invoices, return caps, receipts, outstanding and payment totals. Verify old browser clients and long/physical prints.
5. Test backup restoration and document recovery. Record achievable RPO/RTO; backups alone do not guarantee zero loss of acknowledged commits.

Commands (use the pinned requirements and production secrets provided by the hosting environment):

```bash
# Backend release job, once per environment; never once per replica.
cd backend
pip install -r requirements.txt
alembic current
alembic upgrade head
alembic check
pytest -q tests

# Build/test jobs use isolated databases, never the production database.
cd ../frontend
npm install
npm test
npm run build
```

`pytest` creates test tenants and transactions: do NOT run it against production. The migration job runs only `alembic` commands, after tests have passed elsewhere. See CI for PostgreSQL 16 service configuration.

## Production rollout

- Maintain a single PostgreSQL database. Do not copy the database between blue and green for an application release.
- Confirm recoverable backups/WAL and object backups, then apply the additive migration once. Abort promotion if it fails.
- Start green, preserving signing keys, session compatibility, API v1 contracts and existing assets. Check `/api/v1/health` and authentication against green.
- Exercise only a dedicated synthetic tenant through the authenticated API; do not mutate real customer invoices for smoke tests.
- Gradually route a stable tenant cohort. Keep all writers for a given tenant on the new release once enabling the locking protocol; drain in-flight old requests. Independent load-balanced mixed writers do not provide the new concurrency guarantee.
- Promote frontend after backend compatibility is established. Vercel frontend deployment does not deploy this FastAPI backend or its database migration.
- Monitor HTTP 5xx/409s, lock waits, stock reconciliation, duplicate command attempts, receipt creation and audit write failures. On application errors, route back and halt promotion.
- Retain receipts indefinitely in this release. Design a documented retry horizon before adding retention; early deletion removes replay protection. Include receipts and snapshots in backups/recovery/exports.

## Rollback

Route application traffic to the prior compatible image; retain the expanded schema. Do not downgrade revision 0003: deleting command receipts or snapshots would destroy evidence and retry protection. The migration deliberately rejects downgrade. Do not restore a stale database over active production to undo code. Compensate committed business errors with traceable corrections and reconcile subsequent valid transactions. Old code does not consume snapshots/receipts, so ensure new UI submissions are paused or rolled back with the API during incident response.

No automated deployment/traffic switch is included because actual hosting, deployed revision and recovery setup have not been verified.
