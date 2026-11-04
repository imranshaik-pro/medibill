# Stock concurrency hardening

Sales and purchase creation now mutate live stock with SQL deltas inside D1 batch transactions. Stock shortage aborts and rolls back the invoice, its lines, balance changes and transaction audit. Duplicate sale rows are checked cumulatively. Physical stock is adjusted alongside available stock; legacy inconsistencies are clamped to zero for outward movements rather than repaired automatically.

Sales and purchase edits apply net stock deltas. Complete header/line snapshots (including purchase charges) are checked at commit time using JSON comparisons with a bounded number of SQL parameters. Competing edits reject stale data. Manual batch adjustments compare the record read by the server before committing. This protects concurrent requests, but does not add edit-version tokens to forms held open by users.

Customer and supplier balances use database-side deltas. Swapping the customer on an edited invoice releases the previous receivable and applies the new one in the same transaction. Payment records and their balance updates are now batched together. Active membership is rechecked at commit.

A generic transaction audit is atomic with stock mutations. Secondary detailed audit/backup failures are logged without telling the client to retry an already committed invoice. Complete monitoring and retry jobs remain future work.

## Validation

`node scripts/test-stock-concurrency.mjs` exercises the actual application functions against Miniflare D1 with the full migration history. It covers competing sales with shortage rollback, competing sales/purchase edits, simultaneous purchases and supplier balances, customer swaps, duplicate product rows, stale adjustment guards, backup failure and tenant isolation. Invoice numbering is stubbed explicitly to isolate stock races from the separate allocator issue. Production build and restore-security regressions pass.

## Deployment

No database migration or reset is required. Build the updated local application, regenerate the Cloudflare deployment configuration, then deploy the Worker. GitHub branch updates alone do not update the manually deployed live Worker.

## Remaining limitations

Atomic sequential document allocation and request idempotency are still pending. Concurrent new documents can therefore collide on existing unique invoice/payment numbers and require a fresh attempt. Concurrent creation of the same new batch/master can also be rejected by unique constraints. Catalog/supplier creation in legacy purchase paths may precede the invoice transaction; this change does not claim full workflow atomicity for those preliminary rows. Complete backup recovery, security/monitoring CI, clean project type checking and pagination remain separate priorities.
