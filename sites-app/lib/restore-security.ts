import { getTableColumns } from "drizzle-orm";
import * as schema from "../db/schema";

export const restoreTables = {
  customers: schema.customers, suppliers: schema.suppliers,
  productMasters: schema.productMasters, products: schema.products,
  invoices: schema.invoices, invoiceLines: schema.invoiceLines,
  purchases: schema.purchases, purchaseInwards: schema.purchaseInwards,
  purchaseInwardItems: schema.purchaseInwardItems, purchaseCharges: schema.purchaseCharges,
  payments: schema.payments, returns: schema.returns, stockAdjustments: schema.stockAdjustments,
};
export function requireRestoreAdmin(member: { role: string; status: string } | null) {
  if (!member || member.status !== "active" || !["admin", "super_admin"].includes(member.role))
    throw new Error("RESTORE_FORBIDDEN: Only an active administrator can restore agency data");
}
export function validateRestoreSnapshot(raw: unknown, tenantId: string): Record<string, any> {
  const fail = (message: string): never => { throw new Error(`Invalid backup: ${message}`); };
  const plain = (v: any) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
  if (!plain(raw)) fail("expected a JSON object");
  const x = raw as Record<string, any>;
  if (![1, 2].includes(x.version) || (x.format !== undefined && x.format !== "medibill-pro-backup")) fail("unsupported format or version");
  if (x.tenantId !== tenantId) fail("backup belongs to another agency");
  if (typeof x.createdAt !== "string" || !Number.isFinite(Date.parse(x.createdAt))) fail("invalid backup timestamp");
  const ids: Record<string, Set<string>> = {};
  let total = 0;
  for (const [name, table] of Object.entries(restoreTables)) {
    if (!Array.isArray(x[name])) fail(`missing ${name}`);
    total += x[name].length;
    if (total > 20000) fail("too many records for an interactive restore");
    const columns = getTableColumns(table);
    ids[name] = new Set();
    for (const row of x[name]) {
      if (!plain(row) || row.tenantId !== tenantId) fail(`${name}: invalid row or agency`);
      if (typeof row.id !== "string" || !row.id.trim() || row.id.length > 128 || ids[name].has(row.id)) fail(`${name}: invalid or duplicate ID`);
      ids[name].add(row.id);
      for (const key of Object.keys(row)) if (!Object.hasOwn(columns, key)) fail(`${name}: unexpected field ${key}`);
      for (const [key, col] of Object.entries(columns)) {
        const value = row[key];
        if (value === undefined) { if (col.notNull && !col.hasDefault) fail(`${name}.${key}: required`); continue; }
        if (value === null) { if (col.notNull) fail(`${name}.${key}: cannot be null`); continue; }
        if (col.dataType === "string" && (typeof value !== "string" || value.length > 65536)) fail(`${name}.${key}: invalid text`);
        if (col.dataType === "number" && (typeof value !== "number" || !Number.isFinite(value) || (col.columnType === "SQLiteInteger" && !Number.isSafeInteger(value)))) fail(`${name}.${key}: invalid number`);
        if (col.dataType === "boolean" && typeof value !== "boolean") fail(`${name}.${key}: invalid boolean`);
        if (["stock", "quantity", "billedQuantity", "freeQuantity", "mrp", "rate", "netRate", "purchaseRate", "saleRate", "unitRate", "physicalStock", "physicalUnits"].includes(key) && typeof value === "number" && value < 0) fail(`${name}.${key}: cannot be negative`);
      }
      if (row.sourceDocumentKey && (!row.sourceDocumentKey.startsWith(`purchase-documents/${tenantId}/`) || row.sourceDocumentKey.split("/").some((s: string) => s === ".." || s === "."))) fail(`${name}: document belongs to another agency`);
    }
  }
  const references: Record<string, Record<string, string>> = {
    products: { productMasterId: "productMasters" }, invoices: { customerId: "customers" },
    invoiceLines: { invoiceId: "invoices", customerId: "customers", productId: "products" },
    purchases: { supplierId: "suppliers", productId: "products" }, purchaseInwards: { supplierId: "suppliers" },
    purchaseInwardItems: { inwardId: "purchaseInwards", productId: "products", productMasterId: "productMasters" },
    purchaseCharges: { inwardId: "purchaseInwards" }, stockAdjustments: { productId: "products" },
  };
  for (const [name, refs] of Object.entries(references)) for (const row of x[name]) for (const [key, target] of Object.entries(refs)) {
    if (row[key] != null && !ids[target].has(row[key])) fail(`${name}.${key}: missing referenced ${target}`);
  }
  for (const name of ["payments", "returns"]) for (const row of x[name]) {
    const types: Record<string, string> = name === "payments"
      ? { "Customer receipt": "customers", "Supplier payment": "suppliers" }
      : { "Sales return": "customers", "Purchase return": "suppliers" };
    const target = types[row.type];
    if (!target || !ids[target].has(row.partyId)) fail(`${name}: invalid party reference or transaction type`);
  }
  const invoiceCustomers = new Map(x.invoices.map((r: any) => [r.id, r.customerId]));
  for (const row of x.invoiceLines) if (row.customerId !== invoiceCustomers.get(row.invoiceId)) fail("invoice line customer does not match invoice");
  if (x.agency && x.agency.id !== tenantId) fail("agency identity mismatch");
  if (x.agencyProfiles && (!Array.isArray(x.agencyProfiles) || x.agencyProfiles.some((r: any) => !plain(r) || r.tenantId !== tenantId))) fail("agency profile mismatch");
  return x;
}
