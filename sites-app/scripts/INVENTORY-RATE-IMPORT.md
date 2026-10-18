# Import Inventory Rate from a product rate list

This updates `products.purchase_rate`, the Inventory & Stock **Rate** field. It does not change selling rates, stock quantities, packaging, MRP, invoice values or physical units. Existing Stock Value calculations use the new rate automatically after refreshing the app. There is no schema migration.

## JSON format

An object with `sourceFile` (the original filename) and `rows` (1–1000 objects). Each row has a unique positive integer `sourceRow`, `product`, `pack`, `rate`, and `mrp`. Product and pack are strings. Rate and MRP can be numeric strings or numbers. Optional conversion metadata: `originalRate`, `rateDivisor`, `unit` (`strip`, `original`, or `review`), and `adjustmentNote`. `strip` rows must reconcile the adjusted Rate with the original box rate and divisor. Preserve malformed OCR text: it will be reported rather than silently converted. Row numbers refer to the source document, not the filtered list.

## Local Windows usage

Keep the local MediBill development server running on `http://127.0.0.1:5173`. Run commands in another PowerShell window from `sites-app`. The script uses the application's existing local development authentication cookie. It is restricted to loopback HTTP and must never be used as production authentication.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\import-inventory-rates.ps1 -File "$env:USERPROFILE\Downloads\medibill-rate-import\distribution-rates.json"
```

Review the JSON and CSV reports under `MediBill-Local-Backups` in your Windows user folder. To apply the safe matches:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\import-inventory-rates.ps1 -File "$env:USERPROFILE\Downloads\medibill-rate-import\distribution-rates.json" -Apply
```

Type `UPDATE` at the prompt. The script downloads a full safety backup before applying. The API additionally requires its own full backup to succeed. If backup creation or download fails, no rates are updated. Refresh Inventory & Stock after success. The script generates separate `_unmatched.csv`, `_review.csv`, `_changes.csv`, and full JSON reports against the actual current database, including products beyond the dashboard pagination limit.

## Box-to-strip conversion

The prepared Distribution Data payload uses adjusted per-strip rates for clear tablet/capsule packs. For `10*10` or `10*15`, divide by 10 strips; for `10*1*10`, divide by 10; for `20*10`, divide by 20. Syrups, drops, creams, liquids and other non-tablet items retain their original listed rates. MRP is unchanged. Bottle/bulk packs (such as `1 120`), concatenated packs (`1010`), corrupted or unclear layouts require manual review. Do not automatically convert them to tablet unit prices.

The exported `adjustBoxRates` helper only prepares unadjusted rows once: existing `unit` metadata prevents repeated conversion. The API consumes the prepared rates exactly; it never divides them again. Conversion keeps up to six decimals to preserve fractional rates; the UI may display currency rounded to two decimals.

## Matching and safeguards

- Match product names case-insensitively after Unicode, whitespace and dash normalization. Preserve strengths, punctuation, dosage form, and suffixes. Never fuzzy-match a different medicine. The batch name or its linked Product Master name may match.
- Pack and MRP must both match. Equivalent spaced or `x`/`*`-separated pack dimensions are recognized; manufacturer/pack suffixes are compared when both are supplied. No `1010` to `10*10` guesses, unit conversions, missing-pack guesses, or automatic MRP edits.
- Multiple rates for the same name, compatible pack and MRP are blocked, never arbitrarily resolved using spreadsheet row order. Identical rate duplicates are collapsed per batch.
- Charges are excluded. Invalid Rate/MRP, missing products, unmatched variants, missing inventory batches and Rate > MRP are separately reported.
- Product Master-only entries have no batch-level Rate to update. They are reported; the import does not create artificial stock batches.
- Only active admin/super_admin members may preview or apply. Tenant identity comes from the authenticated session. POST `/api/inventory/rates/import` supports `action: "preview"` and `action: "apply"`. Apply requires `confirm_update: true` and the returned preview `planHash`.
- Backup first, then one atomic D1 batch commits the audit and rate updates. Stale previews, concurrent inventory/catalog changes or permission changes abort the operation. Audit records retain original/new rates and source rows.

## Verification

```powershell
node --experimental-strip-types .\scripts\test-inventory-rate-import-d1.mjs
```

Tests use synthetic data in an isolated Miniflare D1 database. They never touch your local application database. Ensure project dependencies are installed before testing.
