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
type JsonRecord = Record<string, unknown>;
function plain(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}
function fail(message: string): never {
  throw new Error(`Invalid backup: ${message}`);
}
function rowsFor(snapshot: JsonRecord, name: string): JsonRecord[] {
  const value = snapshot[name];
  if (!Array.isArray(value)) fail(`missing ${name}`);
  return value as JsonRecord[];
}
export function requireRestoreAdmin(member: { role: string; status: string } | null) {
  if (!member || member.status !== "active" || !["admin", "super_admin"].includes(member.role))
    throw new Error("RESTORE_FORBIDDEN: Only an active administrator can restore agency data");
}
export function validateRestoreSnapshot(raw: unknown, tenantId: string): JsonRecord {
  if (!plain(raw)) fail("expected a JSON object");
  const x = raw;
  if (typeof x.version !== "number" || ![1, 2].includes(x.version) ||
      (x.format !== undefined && x.format !== "medibill-pro-backup")) fail("unsupported format or version");
  if (x.tenantId !== tenantId) fail("backup belongs to another agency");
  if (typeof x.createdAt !== "string" || !Number.isFinite(Date.parse(x.createdAt))) fail("invalid backup timestamp");
  const ids: Record<string, Set<string>> = {};
  let total = 0;
  for (const [name, table] of Object.entries(restoreTables)) {
    const tableRows = rowsFor(x, name);
    total += tableRows.length;
    if (total > 20000) fail("too many records for an interactive restore");
    const columns = getTableColumns(table);
    ids[name] = new Set<string>();
    for (const candidate of tableRows) {
      if (!plain(candidate) || candidate.tenantId !== tenantId) fail(`${name}: invalid row or agency`);
      const row = candidate;
      if (typeof row.id !== "string" || !row.id.trim() || row.id.length > 128 || ids[name].has(row.id))
        fail(`${name}: invalid or duplicate ID`);
      ids[name].add(row.id);
      for (const key of Object.keys(row)) if (!Object.hasOwn(columns, key)) fail(`${name}: unexpected field ${key}`);
      for (const [key, col] of Object.entries(columns)) {
        const value = row[key];
        if (value === undefined) { if (col.notNull && !col.hasDefault) fail(`${name}.${key}: required`); continue; }
        if (value === null) { if (col.notNull) fail(`${name}.${key}: cannot be null`); continue; }
        if (col.dataType === "string" && (typeof value !== "string" || value.length > 65536)) fail(`${name}.${key}: invalid text`);
        if (col.dataType === "number" && (typeof value !== "number" || !Number.isFinite(value) || (col.columnType === "SQLiteInteger" && !Number.isSafeInteger(value)))) fail(`${name}.${key}: invalid number`);
        if (col.dataType === "boolean" && typeof value !== "boolean") fail(`${name}.${key}: invalid boolean`);
        if (["stock", "quantity", "billedQuantity", "freeQuantity", "mrp", "rate", "netRate", "purchaseRate", "saleRate", "unitRate", "physicalStock", "physicalUnits"].includes(key) && typeof value === "number" && value < 0)
          fail(`${name}.${key}: cannot be negative`);
      }
      if (typeof row.sourceDocumentKey === "string" &&
          (!row.sourceDocumentKey.startsWith(`purchase-documents/${tenantId}/`) ||
          row.sourceDocumentKey.split("/").some((part) => part === ".." || part === ".")))
        fail(`${name}: document belongs to another agency`);
    }
  }
  const references: Record<string, Record<string, string>> = {
    products: { productMasterId: "productMasters" }, invoices: { customerId: "customers" },
    invoiceLines: { invoiceId: "invoices", customerId: "customers", productId: "products" },
    purchases: { supplierId: "suppliers", productId: "products" }, purchaseInwards: { supplierId: "suppliers" },
    purchaseInwardItems: { inwardId: "purchaseInwards", productId: "products", productMasterId: "productMasters" },
    purchaseCharges: { inwardId: "purchaseInwards" }, stockAdjustments: { productId: "products" },
  };
  for (const [name, refs] of Object.entries(references)) {
    for (const row of rowsFor(x, name)) for (const [key, target] of Object.entries(refs)) {
      const value = row[key];
      if (value != null && (typeof value !== "string" || !ids[target].has(value)))
        fail(`${name}.${key}: missing referenced ${target}`);
    }
  }
  for (const name of ["payments", "returns"]) for (const row of rowsFor(x, name)) {
    const types: Record<string, string> = name === "payments"
      ? { "Customer receipt": "customers", "Supplier payment": "suppliers" }
      : { "Sales return": "customers", "Purchase return": "suppliers" };
    const type = row.type;
    const target = typeof type === "string" ? types[type] : undefined;
    if (!target || typeof row.partyId !== "string" || !ids[target].has(row.partyId))
      fail(`${name}: invalid party reference or transaction type`);
  }
  const invoiceCustomers = new Map(rowsFor(x, "invoices").map((row) => [String(row.id), row.customerId]));
  for (const row of rowsFor(x, "invoiceLines"))
    if (row.customerId !== invoiceCustomers.get(String(row.invoiceId))) fail("invoice line customer does not match invoice");
  if (plain(x.agency) && x.agency.id !== tenantId) fail("agency identity mismatch");
  if (x.agencyProfiles !== undefined &&
      (!Array.isArray(x.agencyProfiles) || x.agencyProfiles.some((row: unknown) => !plain(row) || row.tenantId !== tenantId)))
    fail("agency profile mismatch");
  return x;
}
