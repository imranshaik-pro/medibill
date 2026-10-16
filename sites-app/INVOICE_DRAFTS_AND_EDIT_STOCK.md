# Sales drafts, edit stock and OCR prerequisite diagnostics

## User request

Preserve an unfinished sales invoice when a modal, tab or browser closes so the user can continue later. Prevent another full stock deduction when an existing invoice is edited. The attached product-scan screenshot also reports provider HTTP 400 / FAILED_PRECONDITION.

## Findings

The repository's current edit service already uses stock deltas rather than posting another invoice, so the exact repeated deduction observed on the independently deployed Worker was not reproduced against this source. Source inspection did confirm that the edit form validated against already-reduced live stock, without adding back the original invoice's issued quantities. A sold-out original batch could therefore block an unchanged edit. The source also had no client snapshot revision check, so an old edit window could silently overwrite a newer invoice. Older concurrency fixes and the preceding print fix remain on unmerged branches; a repository change does not establish the deployed Worker revision.

## Changes

### Browser drafts

- Automatic localStorage persistence for invoice headers, product/batch rows, billed/free quantities, prices, discounts, transport, payment and applicable retail prescription inputs.
- One new-invoice slot and separate saved-invoice edit slots per agency and authenticated user. The Sales & Billing draft list offers Resume draft; create and edit forms recover their own entries.
- Recovery after modal close, refresh and browser restart on the same browser profile. These are browser drafts, not cloud-synced drafts; another device/private session does not share them. Clearing site storage removes them.
- Entries are saved as state changes and flushed on pagehide, visibility change and form unmount. The UI reports storage failures rather than claiming successful persistence. Detection of an intervening draft write protects against overwriting/removing another tab's newer draft; localStorage is not a cross-device or transactional database.
- Drafts have no invoice number and do not reserve or deduct stock. They are removed only after an acknowledged successful save or explicit Discard draft. Failed requests keep them.
- The create request's random idempotency key and exact payload are stored before posting. A close/reopen after an uncertain response retries the same payload/key through the existing server duplicate-save protection. A synchronous submit lock also prevents repeated clicks in one form.
- Completed saves cannot be re-created as a draft by unmount cleanup. A navigation/printing problem after save exposes an Open saved invoice link and does not invite another sale.
- New and edit drafts are separate. An edit draft retains the original server revision; if that invoice changes, the recovered stale draft remains inspectable but cannot post over the newer invoice. The user can copy entries, discard and reopen the current version.

### Stock edits

- The form merges current original-batch records returned by the invoice API, including selected batches outside the capped workspace list.
- Edit allowance = current live stock + original invoice billed/free quantities. Requested quantities are aggregated per batch, including duplicate rows.
- Server stock delta per affected batch = original billed/free total minus new billed/free total. Header-only, rate-only and unchanged edits update no stock rows. Increases deduct only extra units; decreases/removed batches release only the difference. Physical units follow pack multipliers.
- GET invoice returns a stable SHA-256 snapshot revision; PATCH requires `expectedRevision`. Stale/missing versions return 409. Existing commit-time header/line snapshot guards and stock shortage rollback still protect concurrent mutations.
- Repeated requests with an already-consumed revision are rejected rather than issuing stock again. Refresh/reopen before retrying a stale edit. Existing direct service tests may omit the optional revision, but every public PATCH request must provide it.

Example: stock 100, original sale 10 billed + 2 free leaves 88. Editing transport or price leaves 88. Changing to 14 + 2 leaves 84. Changing to 8 + 1 leaves 91. Replacing the batch releases the original quantity and issues only from the replacement batch, in one transaction.

### OCR

The screenshot's allowlisted FAILED_PRECONDITION code now maps to `VISION_PROVIDER_PREREQUISITE`, with guidance to check the Gemini API project's billing and region/account prerequisites. The same request is not retried, raw provider messages are not exposed and manual product entry stays available. Google documents the code as an unmet prerequisite and, in its Generate Content error guide, identifies country/free-tier billing conditions as one cause:

- https://ai.google.dev/gemini-api/docs/api-errors
- https://ai.google.dev/gemini-api/docs/generate-content/api-errors

The screenshot alone does not establish which prerequisite is missing. No live API request, key change, provider billing change or model substitution was performed. Provider account configuration requires separate administrator verification.

## Validation

Run `npm run test:billing` and `npm run build` inside `sites-app`. A dedicated Sites billing GitHub Actions workflow runs these checks on relevant PRs.

- Mounted React form tests: type entries, autosave, unmount/remount, scoped recovery, failed response retry key, successful cleanup, sold-out edit, stale draft, prior cross-tab write conflict and visible storage quota failure.
- D1 service tests: unchanged/repeated/header-only/rate-only edits; billed/free quantity increases and decreases; duplicate batch rows; replacement batch; stale revision rejection; rollback on shortage; one invoice retained; other tenant untouched.
- Existing billing-mode, stock-concurrency and document-number/idempotency suites remain regression checks.
- Vision request tests cover the specific HTTP 400 prerequisite classification, no retry, safe diagnostics and existing transient-error behavior.
- Production build passes. The pre-existing project type check has 127 diagnostics; this change does not establish a clean type-check gate.

Tests use local storage mocks/React lifecycle and isolated Miniflare D1, not production records or a real browser process kill. Device crash before a browser executes/persists the latest event cannot be guaranteed against. Actual Android/desktop reload/close/printing and independent Worker deployment still require acceptance.

## Release

Based on `fix/agency-billing-print` from PR #19, which is based on the Cloudflare application branch from PR #18. Keep that chain or cherry-pick the complete source fixes together. Do not deploy root FastAPI containers to update this Worker.

No schema migration is added. Existing base document-safety migrations are still required. Build and manually deploy the updated Cloudflare Worker, then refresh open clients; old edit clients receive 409 until reopened. Do not reset or import the live database to release these changes. Existing stock drift must be reconciled separately against the actual ledger and physical stock; this change does not invent or silently rewrite historical stock.
