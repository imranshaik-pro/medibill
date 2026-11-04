# Data Export Inventory

Export timestamp: 2026-09-30 UTC. Source application version: 37.

## Structured database

`data/d1-full-export.json` contains all 20 live D1 application tables and 558 rows:

| Table | Rows |
|---|---:|
| agency_profiles | 0 |
| audit_logs | 227 |
| backup_records | 4 |
| backup_settings | 1 |
| customers | 3 |
| firm_registrations | 0 |
| invoice_lines | 3 |
| invoices | 2 |
| payments | 0 |
| product_masters | 98 |
| products | 101 |
| purchase_charges | 2 |
| purchase_inward_items | 5 |
| purchase_inwards | 1 |
| purchases | 0 |
| returns | 0 |
| stock_adjustments | 105 |
| suppliers | 2 |
| tenants | 2 |
| users | 2 |

The complete schema is in `db/schema.ts`; all generated schema migrations and Drizzle metadata are in `drizzle/`.

## Object storage

`object-storage/` contains all 24 objects that existed under the application-owned R2 prefixes at export time. `data/r2-object-manifest.json` records each original key, size, upload timestamp and ETag. The downloaded objects total 3,681,153 bytes and include original purchase documents and backup snapshots. No agency or registration image object existed in the bucket at export time.

## Secrets

Provider credentials and API secrets are intentionally not exported. They are not application data and must be rotated/reconfigured on the destination. `.env.example` lists every supported integration key.

## No unrelated medical-code dataset

The application contains no embedded ICD-10, CPT, patient-record, or fixed medicine-rate dataset. Product, customer, supplier, invoice and stock information is tenant-created and is present in the D1 export.
