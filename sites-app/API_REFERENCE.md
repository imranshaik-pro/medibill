# MediBill Pro API Reference

All business routes require an authenticated user and enforce the user's active tenant membership. JSON errors use `{ "error": "message" }`. Monetary values are numbers; IDs are UUID strings.

| Method | Route | Request | Successful response |
|---|---|---|---|
| GET | `/api/workspace` | None | Complete tenant dashboard payload: tenant, member, customers, product masters, batches, invoices, lines, suppliers, purchases, payments and returns |
| POST | `/api/workspace` | Multipart firm registration: `companyName`, `username`, `mobile`, `address`, `gstin`, `logo` | Created workspace/dashboard payload |
| POST | `/api/customers` | Customer identity, phone, GSTIN/DL and address fields | Created customer |
| POST | `/api/suppliers` | Supplier identity, phone, GSTIN/DL and address fields | Created supplier |
| GET | `/api/party-lookup?q=...&kind=customer|supplier` | Query string | Local/online registry matches |
| POST | `/api/products` | `{name, composition, hsn, manufacturer, marketedBy, pack, batch, mfgDate, expiry, mrp, compliance flags, cautionNotes}` | Created product master |
| PATCH | `/api/products/:id` | Editable master fields | Updated product master |
| DELETE | `/api/products/:id` | None | `{deleted, id, name}`; returns 409 when inventory/history exists |
| PATCH | `/api/inventory/:id` | `{batch, expiry, stock, mrp, purchaseRate, saleRate, reason}` | Updated batch and adjustment record |
| POST | `/api/product-scan` | Multipart `images` containing 2–3 JPG/PNG/WebP files | OCR data, warnings, confidence and evidence |
| POST | `/api/purchase-documents` | Multipart purchase invoice file | R2 object metadata/key |
| POST | `/api/purchases` | Single purchase/batch payload | Created purchase and inward stock |
| POST | `/api/purchase-inwards` | Full supplier/header/items/charges/tax summary payload | Created purchase inward and synchronized batches |
| GET | `/api/purchase-inwards/:id` | None | Complete purchase header, items and charges |
| PATCH | `/api/purchase-inwards/:id` | Complete revised purchase payload | Updated purchase with reversed/reapplied stock |
| GET | `/api/purchase-inwards/:id/document` | None | Original PDF/image/JSON object stream |
| POST | `/api/invoices` | Customer/header/items/charges/discount/tax payload | Created sales invoice with batch deductions |
| GET | `/api/invoices/:id` | None | Complete invoice/customer/lines/profile payload |
| PATCH | `/api/invoices/:id` | Complete revised sales payload | Updated invoice with stock reconciliation |
| POST | `/api/payments` | `{partyId, partyType, amount, method, paymentDate}` | Created receipt/payment and updated balance |
| POST | `/api/returns` | `{partyId, type, referenceNo, amount, reason, returnDate}` | Created return and updated balances |
| GET | `/api/agency-profile` | None | Firm identity, tax, contact, bank and print settings |
| PUT | `/api/agency-profile` | Multipart `profile` JSON plus optional `logo`/`signature` | Updated profile |
| GET | `/api/agency-profile/asset/:kind` | `kind=logo|signature` | Private image stream |
| GET | `/api/backups` | None | Backup settings and recent backup records |
| POST | `/api/backups` | `{action:"settings", ...}` or `{action:"backup"}` | Updated settings or new backup record |
| GET | `/api/backups/:id/download` | None | JSON backup download |
| POST | `/api/backups/restore` | `{inspect:true,snapshot}` or `{snapshot,confirmation:"RESTORE"}` | Inspection counts or restore result |
| GET | `/api/exports/:kind` | `kind=sales|purchases|stock|products` | UTF-8 CSV download |
| GET/POST | `/api/admin/registrations` | Review payload `{id,decision}` for POST | Registration list or approval result |
| POST | `/api/admin/reset-test-data` | `{confirm_wipe:true, confirmation:"RESET TEST DATA"}` | Protected transactional reset result |

The authoritative validation, calculations and response fields are in `app/api/**/route.ts` and `lib/medibill.ts`; both are included without truncation.
