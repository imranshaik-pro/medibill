import { and, eq, ne, sql } from "drizzle-orm";
import { auditLogs, productMasters, products, users } from "../db/schema";
import { snapshotUnchanged } from "./stock-concurrency";
import { productMasterSnapshot, type ProductMasterSyncValues } from "./product-master-values";
export type { ProductMasterSyncValues } from "./product-master-values";

export class ProductMasterUpdateError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "PRODUCT_INVALID") {
    super(message); this.status = status; this.code = code;
  }
}

export function readOriginalProductMaster(original: unknown): ProductMasterSyncValues {
  if (!original || typeof original !== "object" || Array.isArray(original))
    throw new ProductMasterUpdateError("Reload the product before editing; the original values are required.", 409, "PRODUCT_STALE");
  const fields = productMasterSnapshot({});
  for (const key of Object.keys(fields) as (keyof ProductMasterSyncValues)[]) {
    if (!Object.prototype.hasOwnProperty.call(original, key) ||
        typeof (original as Record<string, unknown>)[key] !== typeof fields[key])
      throw new ProductMasterUpdateError("The original product values are incomplete or invalid. Reload the product.");
  }
  const values = productMasterSnapshot(original as ProductMasterSyncValues);
  if (!Number.isFinite(values.defaultGstRate)) throw new ProductMasterUpdateError("Invalid original GST rate.");
  return values;
}

function sameEditableValues(a: ProductMasterSyncValues, b: ProductMasterSyncValues) {
  return (Object.keys(a) as (keyof ProductMasterSyncValues)[]).every(key => a[key] === b[key]);
}
function errorDetails(error: unknown) {
  let message = "", current: any = error;
  const seen = new Set<unknown>();
  while (current && !seen.has(current) && seen.size < 12) {
    seen.add(current); message += " " + String(current.message || current); current = current.cause;
  }
  return message;
}

export async function syncProductMaster(
  db: any, member: { id: string; tenantId: string }, masterId: string,
  original: ProductMasterSyncValues, values: ProductMasterSyncValues,
) {
  const tenantId = member.tenantId;
  const accessScope = and(eq(users.id, member.id), eq(users.tenantId, tenantId), eq(users.status, "active"));
  const hasAccess = async () => (await db.select({ id: users.id }).from(users).where(accessScope).limit(1)).length > 0;
  if (!await hasAccess()) throw new ProductMasterUpdateError("Active agency membership required.", 403, "PRODUCT_FORBIDDEN");
  const scope = and(eq(productMasters.id, masterId), eq(productMasters.tenantId, tenantId))!;
  const [row] = await db.select().from(productMasters).where(scope).limit(1);
  if (!row) throw new ProductMasterUpdateError("Product master not found.", 404, "PRODUCT_NOT_FOUND");
  original = readOriginalProductMaster(original);
  if (!sameEditableValues(productMasterSnapshot(row), original))
    throw new ProductMasterUpdateError("This product was changed by another user. Reload it before saving; no changes were saved.", 409, "PRODUCT_STALE");
  if (!values.name.trim() || !values.manufacturer.trim())
    throw new ProductMasterUpdateError("Product name and manufacturer are required");
  if (!Number.isFinite(values.defaultGstRate) || values.defaultGstRate < 0 || values.defaultGstRate > 100)
    throw new ProductMasterUpdateError("GST rate must be between 0 and 100");
  if ((values.isScheduleH1 || values.isPrescriptionRequired || values.isHighCaution) &&
      (!values.cautionNotes.trim() || values.cautionNotes.length > 280))
    throw new ProductMasterUpdateError("Flagged medicines require a concise caution note of no more than 280 characters");

  const [duplicate] = await db.select({ id: productMasters.id }).from(productMasters).where(and(
    eq(productMasters.tenantId, tenantId), eq(productMasters.name, values.name), ne(productMasters.id, masterId),
  )).limit(1);
  if (duplicate) throw new ProductMasterUpdateError("Another Product Master already uses this name", 409, "PRODUCT_NAME_CONFLICT");
  const [conflict] = await db.select({ id: products.id }).from(products).where(and(
    eq(products.tenantId, tenantId), eq(products.name, values.name), sql`${products.productMasterId} IS NOT ${masterId}`,
    sql`EXISTS (SELECT 1 FROM products AS linked WHERE linked.tenant_id=${tenantId}
      AND linked.product_master_id=${masterId} AND linked.batch=${products.batch})`,
  )).limit(1);
  if (conflict) throw new ProductMasterUpdateError("Cannot rename this product: another inventory record uses the same name and batch", 409, "PRODUCT_BATCH_CONFLICT");

  const access = sql`EXISTS(SELECT 1 FROM users WHERE id=${member.id} AND tenant_id=${tenantId} AND status='active')`;
  // The audit's NOT NULL timestamp is a fail-closed guard inside the same D1
  // transaction. A preflight SELECT alone cannot prevent another writer winning.
  try {
    await db.batch([
      db.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId, userId: member.id,
        action: "product_master.updated", details: `${row.name} -> ${values.name}`,
        createdAt: sql`CASE WHEN ${access} AND ${snapshotUnchanged(productMasters, scope, [row])} THEN ${Date.now()} ELSE NULL END`,
      }),
      db.update(productMasters).set(values).where(scope),
      db.update(products).set({ name: values.name, hsn: values.hsn, manufacturer: values.manufacturer })
        .where(and(eq(products.productMasterId, masterId), eq(products.tenantId, tenantId))),
    ]);
  } catch (error) {
    const detail = errorDetails(error);
    if (/NOT NULL constraint failed: audit_logs.created_at/i.test(detail)) {
      if (!await hasAccess()) throw new ProductMasterUpdateError("Your agency access changed. No changes were saved.", 403, "PRODUCT_FORBIDDEN");
      if (!(await db.select({ id: productMasters.id }).from(productMasters).where(scope).limit(1)).length)
        throw new ProductMasterUpdateError("Product master not found. No changes were saved.", 404, "PRODUCT_NOT_FOUND");
      throw new ProductMasterUpdateError("This product changed while saving. Reload it before retrying; no changes were saved.", 409, "PRODUCT_STALE");
    }
    if (/UNIQUE constraint failed: product_masters/i.test(detail))
      throw new ProductMasterUpdateError("Another Product Master already uses this name. No changes were saved.", 409, "PRODUCT_NAME_CONFLICT");
    if (/UNIQUE constraint failed: products/i.test(detail))
      throw new ProductMasterUpdateError("Product name or batch conflicts with an existing record. No changes were saved.", 409, "PRODUCT_BATCH_CONFLICT");
    throw error;
  }
  return { ...row, ...values };
}
