# Stock reports and automatic invoice drafts

Target application: https://medibill-pro.irshad4281.workers.dev/

## Stock reports

The previous Reports page displayed summary cards without a report generator or export action. The workspace dashboard queries only the latest 100 stock records, so it cannot supply a complete inventory report.

Open **Reports**, select a format and stock filter, then choose **Generate stock report**:

| Format | Included details |
| --- | --- |
| Available products | Unique product names, packs and manufacturers across matching stock batches |
| Stock quantities | Product, pack, batch, expiry and quantity |
| Stock with MRP | Product, pack, batch, quantity and MRP |
| Stock with purchase rate | Product, pack, batch, quantity and recorded purchase rate |
| Full stock statement | All eight supported columns |
| Custom columns | Product plus any selection of pack, manufacturer, batch, expiry, quantity, MRP and purchase rate |

The default filter includes positive stock only. Choose all records or out-of-stock records when needed. Search matches product, batch, pack and manufacturer. Selecting individual columns switches to batch rows, so quantities and differing rates are never silently averaged or combined. The product list groups only identical name/pack/manufacturer combinations; other formats keep one row per batch.

The new authenticated `GET /api/reports/stock` query reads the full active member's tenant inventory without the dashboard limit, projects only report fields and returns a snapshot timestamp. Its responses use `Cache-Control: private, no-store`. No tenant ID is accepted from the caller.

**Download CSV** exports all matching rows using the selected columns. CSV uses UTF-8 with a BOM for spreadsheet compatibility, quotes embedded punctuation/newlines and neutralizes formula-like text. **Print / Save PDF** opens the same selection in a printable landscape table with the company, filters and snapshot timestamp. It requires pop-ups to be allowed for MediBill. Product text is escaped in the print document. The preview pages through 100 rows at a time; exports include every matching row.

Filters and columns operate on the displayed snapshot. Use **Refresh stock report** to include later stock changes. A failed refresh clears the snapshot and disables exports so stale stock is not presented as current.

Quantity, pack, MRP and purchase rate are the values stored on the inventory batch. Purchase rate is the current recorded batch purchase rate, which may change after another inward or an edit. This report does not reconstruct historical supplier invoice rates, calculate landed cost, or multiply pack-dependent rates into an unverified valuation.

## Sales invoice autosave

This branch includes the invoice draft implementation from PR #20 and the print fixes it depends on. Entries are saved automatically in local browser storage after each committed form change, before the updated form is painted. No debounce or server connection is required. Disconnect/reconnect, page hiding and unloading also trigger a flush. The form displays its saved status, an offline message and any storage failure.

After reopening MediBill in the same browser, sign into the same workspace and open **Sales & Billing → Unfinished invoice drafts → Resume draft**, or reopen the new invoice form. Customer, invoice fields and item rows are restored. Existing invoice edit drafts retain the original revision and cannot overwrite an invoice changed since the draft began.

Saving an invoice persists its retry key before the request. Failed or lost responses retain the draft; retrying the unchanged request uses the same key. Successful posting removes the draft. Drafts do not issue stock and are separated by tenant and user. Cross-tab changes and unavailable/full browser storage produce visible warnings.

Drafts are local to the browser/device. Clearing site data, private-mode cleanup, browser/OS storage loss or a power cut before the browser processes the newest input cannot be guaranteed against. Reopening the application may require connectivity; this change does not install an offline application shell or sync drafts to another device. Only the last successfully persisted entries are recoverable.

## Verification and release

Run in `sites-app`:

```sh
npm run test:reports
npm run test:billing
npm run build
```

The report suite uses actual migrated Miniflare D1 with 135 tenant stock rows and another tenant, then mounts the report component to verify presets, preview pagination, full CSV exports, print selection and error recovery. It checks authentication, inactive memberships, tenant isolation, filters, safe CSV/HTML and snapshot caching headers. Draft tests verify entries are persisted while offline before any close handler, then restore a serialized storage snapshot, retry after a failed response, prevent duplicate posting, and check storage failures and conflicting tabs. The remaining billing suites cover stock edits, concurrent writes, idempotency and rollback.

The production build passes. The repository-wide TypeScript check still reports the same 127 existing diagnostics as `fix/invoice-drafts-stock`, with no additional diagnostics from this change. The workflow runs the new report suite alongside the existing billing checks and build.

No schema migration is needed for this report or autosave change. Deploy the complete tested Worker source, including its draft/print dependencies, using the existing production Cloudflare bindings and secrets. Do not reset, replace or import production D1 to release these changes. Deployment to the live URL has not been performed by this change.
