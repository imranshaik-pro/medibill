# Document save safety and GSTIN editing

## Behavior
- Sales, purchase inwards, legacy purchases and payments reserve numbers through one atomic D1 UPSERT RETURNING statement, scoped by tenant, document kind and prefix.
- The counter respects both live and archived deleted invoice numbers and never decreases. Restored live invoice numbers establish a new floor.
- A failed or losing request can reserve an unused number. Gaps are deliberate; numbers are unique and never recycled, rather than promised gapless.
- These four POST APIs require an Idempotency-Key containing 16–128 ASCII letters, digits, underscores or hyphens. The UI generates a cryptographically random key and reuses it for an unchanged retry.
- The key scope includes tenant, user and operation. A SHA-256 canonical-payload hash prevents reuse with different details (409).
- A successful-save receipt is inserted in the same atomic batch as invoice lines, stock and party balance changes. A competing request either replays the winning result or fails without a second transaction.
- Retried deleted or restored-away documents return a conflict instead of recreating them silently.
- Session storage contains only an input fingerprint and random key, never invoice contents. HTTPS supports retry-key recovery after a same-tab refresh. In insecure LAN development, in-memory retry protection is used.
- Customer edits send only changed fields; pasted GSTIN whitespace is removed and text uppercased. The confirmation explicitly shows old/new GSTIN, feedback scrolls into view, requests time out visibly, and the response is checked for the requested value. Invalid changed GSTINs display an explanation; clearing GSTIN marks the customer unregistered. Unchanged legacy values do not block unrelated edits.

## Deployment
Apply drizzle/0018_document_safety.sql to the same D1 database BEFORE deploying the new server:
```powershell
npm.cmd run build
node scripts/prepare-cloudflare.mjs c499a4bd-7862-4ad3-9e4f-99db568fc333 medibill-production-files https://medibill-pro.irshad4281.workers.dev
node .\node_modules\wrangler\bin\wrangler.js d1 execute medibill-production --remote --config dist/server/wrangler.cloudflare.json --file drizzle/0018_document_safety.sql
node .\node_modules\wrangler\bin\wrangler.js deploy --config dist/server/wrangler.cloudflare.json
```
Stop on any nonzero exit code. CREATE TABLE/INDEX IF NOT EXISTS is repeatable. No data wipe or destructive migration is performed. Existing older clients must refresh after deployment because these POST APIs now require a save key.

## Validation
- node scripts/test-document-safety.mjs uses actual service functions, the real allocator, Drizzle and Miniflare D1: duplicate/replayed sales, purchases and payments; different independent requests; archived and restored-number floors; failed-stock receipt rollback; key mismatch; inactive membership; deleted replay; tenant isolation.
- node scripts/test-customer-update.mjs covers valid pasted GSTIN persistence and clearing, partial edits, legacy/formatted phones, access and atomic rollback.
- Stock and restore regression suites and production build pass.

## Remaining boundaries
- Catalog/supplier/batch preparation in existing purchase code may precede the invoice transaction. Competing first-time creates can still return a retryable uniqueness error; successful invoice stock/balance changes remain atomic.
- Request receipts are internal control records retained in D1, not tenant-editable backup JSON. Full database disaster recovery must include these tables; complete application-backup scope is the next phase.
- Failed unused reservations can leave number gaps. Prefix/year policy and legal invoice cancellation handling remain business-policy concerns.
- Protection covers invoice/purchase/payment creation, not all other application POST operations.
- No live production UI acceptance is claimed by repository tests. Cloudflare deployment and real-user verification are required.
