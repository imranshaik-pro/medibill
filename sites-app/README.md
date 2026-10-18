# MediBill Pro — Complete Migration Export

This archive is a self-contained export of the MediBill Pro application for migration away from ChatGPT Sites. It contains the complete application source at the exported production baseline, database schema and migrations, a full row-level database snapshot, all application-owned object-storage files, restore utilities, assets, dependency lockfile, configuration templates, and deployment guidance.

## Export contents

- `app/` — Next.js/Vinext pages, API routes, layouts, styles, and UI components.
- `components/`, `lib/`, `hooks/`, `types/` — shared UI and business logic.
- `db/` and `drizzle/` — Drizzle schema and SQL migrations.
- `data/d1-full-export.json` — complete database export: 20 tables and 558 rows.
- `data/d1-full-import.sql` — generated transactional restore script.
- `data/r2-object-manifest.json` — object-storage inventory with metadata.
- `object-storage/` — 24 exported objects totaling 3,681,153 bytes.
- `public/` and `product-images/` — logos, icons, and product imagery.
- `scripts/` — database and object-storage restore utilities.
- `API_REFERENCE.md` — API route inventory and payload guide.
- `DATA_EXPORT.md` — database and object-storage export report.
- `MIGRATION_SECURITY.md` — mandatory security work for an independent deployment.
- `.env.example` and `wrangler.example.toml` — configuration templates without secrets.
- `package.json` and `package-lock.json` — exact JavaScript dependencies.
- `README.SITES.md` — original Sites-generated project documentation.
- `FILE_MANIFEST.json` and `SHA256SUMS` — archive inventory and integrity verification.

## Requirements

- Node.js 22.13 or later
- npm 10 or later
- Current backend: Cloudflare Workers runtime with D1 and R2 bindings
- A replacement identity provider before exposing the migrated application publicly

## Verify the archive

From the export directory:

```bash
sha256sum -c SHA256SUMS
npm ci
npm run build
```

## Run locally

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The development-only loopback identity behavior is for local testing; it is not a production authentication system. Read `MIGRATION_SECURITY.md` before deployment.

## Restore the database

Create a D1 database, apply the migrations in `drizzle/`, then generate and execute the data import:

```bash
node scripts/generate-sqlite-import.mjs
npx wrangler d1 execute medibill-production --remote --file data/d1-full-import.sql
```

The generated SQL performs deletes in child-first order and inserts in parent-first order inside a transaction. Test restoration in a staging database before replacing production data.

## Restore object storage

Create an R2 bucket, configure Wrangler authentication, then run:

```bash
node scripts/restore-r2-objects.mjs medibill-production-files --remote
```

The script validates every relative key and restores the exported objects with their original application keys.

## Recommended deployment: independent Cloudflare account

The least disruptive migration target is Cloudflare Workers + D1 + R2 because the current application already uses those runtime APIs.

1. Create a D1 database and R2 bucket.
2. Copy `wrangler.example.toml` to `wrangler.toml` and fill in the destination IDs.
3. Configure the variables in `.env.example` as encrypted platform secrets.
4. Apply the schema migrations and restore the exported data and objects.
5. Replace the Sites-only identity adapter as described in `MIGRATION_SECURITY.md`.
6. Build, deploy to staging, execute the acceptance checklist below, then switch DNS.

## Vercel or Netlify

The frontend can be hosted on Vercel or Netlify, but the application is not a static-only site. A faithful deployment requires replacing or adapting:

- Cloudflare D1 access
- Cloudflare R2 access
- request-context bindings
- the Sites identity headers
- Vinext/Workers deployment configuration

Use a supported SQL database and object store, then implement compatible repository adapters. Do not deploy the current authenticated API routes unchanged.

## GitHub Pages

GitHub Pages can host only a static frontend. It cannot run this application's authenticated API routes, database operations, uploads, OCR services, backup/restore features, or billing workflows. It is therefore not a complete deployment target for MediBill Pro.

## Security and data handling

This export contains real application records and uploaded business documents. Store it encrypted, restrict access, and do not commit `data/` or `object-storage/` to a public repository. API credentials and platform secrets are deliberately excluded; configure fresh values from `.env.example` in the destination secret manager.

## Migration acceptance checklist

- Authentication uses a server-validated provider and tenant isolation is enforced.
- All 20 tables restore with the counts in `DATA_EXPORT.md`.
- All 24 object-storage files are present and downloadable by authorized users only.
- Products, batches, purchases, sales, customers, suppliers, and audit records load correctly.
- Purchase uploads, OCR, invoice editing, stock reconciliation, backup, and restore are tested.
- Invoice print/PDF output is checked on A4 and the configured receipt format.
- A backup is created and a full restore drill succeeds before DNS cutover.
- HTTPS, secure cookies, rate limiting, monitoring, and alerting are enabled.

## Important source locations

- Database schema: `db/schema.ts`
- SQL migrations: `drizzle/`
- API routes: `app/api/`
- Authentication adapter: `app/chatgpt-auth.ts`
- Main business interface: `app/`
- Global styles: `app/globals.css`
- OCR and extraction services: `app/api/` and `lib/`
- Static assets: `public/` and `product-images/`

The original Sites-specific operating notes are retained in `README.SITES.md` for reference.
