# Pharma reports, product descriptions and draft deletion

## UI

Reports now contains the pharma reporting suite above the existing stock report. The suite offers sales item/batch and invoice registers, purchase item/batch and inward invoice registers, a separate legacy purchase register, receivables, payables, cash/bank payment activity, customer/supplier activity ledgers, GST working papers, returns, adjustments and schedule-controlled sales activity.

Each register has applicable document-date filters, search across returned fields, a 100-row preview page, complete CSV download and print/PDF output. Snapshot time and report limitations are displayed with the data. Current party balance reports explicitly ignore date filters. Changing report/date criteria clears the old snapshot; failed refreshes cannot export stale records. Input controls are disabled while generating a snapshot. Print output uses DOM text nodes, and CSV neutralizes spreadsheet formula text.

Product Description buttons on stock and item-based register rows open a dialog with recorded composition, manufacturer, marketer, pack, batch, manufacture/expiry dates, HSN, category and caution notes. These are current product-master specifications; invoice-line snapshots remain in the report. Financial summary rows without an individual product show 'Not an item row' in the description column. No product is arbitrarily selected to represent a financial total.

Stock filters now include low stock (10 or fewer), expiry within 90 days and expired batches. Select 'All stock records' to include zero stock in low-stock results. ISO year-month/date and month/year expiry formats use month-end expiry; unknown formats cannot be classified by expiry and need data review. The filters apply to preview, CSV and print together.

## API and database queries

- `GET /api/reports/pharma?kind=sales&from=YYYY-MM-DD&to=YYYY-MM-DD`: fixed allowlisted query selected by report kind, authenticated active membership, derived tenant ID, validated dates and bound parameters. Queries are implemented in `lib/pharma-report-data.ts`.
- `GET /api/reports/product?id=PRODUCT_ID`: returns only descriptive fields for the authenticated tenant's batch and linked master. The master join checks both ID and tenant.
- All report responses use `private, no-store`. Bank account numbers and source-document storage keys are not selected.
- Item registers join their header on document ID **and tenant ID**. Header-total registers query one header per row, preventing invoice amounts from being multiplied by item count.
- Party activity queries union invoice, payment and return records, then apply the tenant and document-date predicates. Internal tenant fields are removed before returning results.
- No migration or production data rewrite is required. Existing tenant/date and item-document indexes support the register queries. Exports are uncapped; preview pagination is a browser rendering limit only.

## Financial and compliance boundaries

These reports expose the records currently captured by MediBill. Party payments have no invoice-allocation model; reliable historical aging cannot be inferred from a current outstanding balance. There is no complete general journal, verified opening balance, expenses/transfer capture or bank reconciliation model. Consequently, activity ledgers do not invent running balances, cash/bank activity is not a complete cash-flow statement, and trial balances/balance sheets are not manufactured from sales totals.

Purchase GST is recorded tax, not verified eligible ITC. GST working papers do not incorporate unrecorded returns tax, GSTR-2B reconciliation or filing validations; they must be reconciled before filing. Legacy purchases stay separate from inward invoices to prevent silent double counting. Schedule-controlled activity uses current product-master flags and is not a certified historical H1 register.

Wholesale mode already bypasses patient/RMP prescription requirements in both the form and service. The billing-mode tests retain this behavior for scheduled products. Retail mode retains its separately configured prescription safeguards; product classifications and caution information are preserved.

## Draft and posted-invoice protection

Sales drafts are browser-local, scoped by tenant/user. The drafts list now offers Delete draft with a modal, Keep draft and an explicit permanent-delete action. Deletion uses the selected draft's generation so changes made in another tab are preserved and reported. Deleting a draft does not cancel any previously submitted invoice and does not mutate stock or accounts. Edit drafts can be removed without deleting their posted originals.

The server deletion helper rejects all posted sales invoice deletion requests with HTTP 409, including administrator requests, before database mutations or backup callbacks. Posted sales Delete controls are hidden. Existing purchase deletion behavior is unchanged. This change does not create a cancellation/credit-note workflow; posted corrections require the appropriate separate workflow.

## Validation

`npm run test:reports`, `npm run test:billing`, and `npm run build` pass. Report tests execute every allowlisted query on migrated local D1 and verify nonempty sales, invoices, cash receipts, GST rows, date filters, membership, tenant isolation and product lookup. They also verify the posted-sales deletion helper rejects before any query/mutation. Draft tests cover generation conflicts, scoped manual deletion and preserved drafts in other workspaces, in addition to existing recovery/retry behavior. The project type check retains 127 existing diagnostics with none in the new report/draft files. No live records are created or deleted by these tests.
