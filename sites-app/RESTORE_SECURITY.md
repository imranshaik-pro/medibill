# Restore security hardening

Restore inspection and execution require an active admin or super_admin in the target agency. Rows are validated against the Drizzle schema before any recovery backup or destructive writes. Validation rejects cross-agency rows, duplicate IDs, unknown fields, invalid numeric/boolean values and broken references. Supplier external customer IDs remain external references.

The restore audit and data replacement share one D1 batch. A NOT NULL timestamp authorization guard rechecks user status, tenant and role inside that batch; revocation aborts and rolls back the batch. A pre-restore recovery snapshot must succeed first. Secondary snapshot failure is logged without misreporting an already committed restore as failed.

Users, authentication, role mappings and approved firm settings are preserved. This change does not add complete disaster recovery for authentication, settings or R2 objects.

## Validation

Run `node scripts/test-restore-security.mjs` and `npm run build` from sites-app. Both pass. Existing unrelated project TypeScript errors remain and must be resolved before enforcing a clean type-check CI gate.

## Limits

Interactive restores accept at most 16 MB JSON and 20,000 business records. Larger restores need a separate staged job. Validation verifies structural consistency, not authenticity: unsigned JSON remains editable by the administrator. Business-total reconciliation and complete snapshot encryption/scheduling remain separate work.

## Deployment

GitHub changes are on sites-v34-fullstack-sync (PR #18), not merged into main. GitHub push does not deploy the manually managed Cloudflare Worker. Build the intended local revision, regenerate dist/server/wrangler.cloudflare.json using scripts/prepare-cloudflare.mjs, and deploy that generated configuration with Wrangler. No database migration or reset is needed for this change.

Remaining priorities: concurrency-safe stock and balance updates; atomic document numbering and idempotent saves; complete scheduled backups and restore drills; security monitoring and CI; paginated histories.
