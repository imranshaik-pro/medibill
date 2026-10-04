import { getTableColumns, sql, type SQL } from "drizzle-orm";
import { auditLogs } from "../db/schema";

export function stockDelta(column: any, delta: number) {
  if (!Number.isSafeInteger(delta)) throw new Error("Stock quantities must be whole units");
  return sql`CASE WHEN ${column} + ${delta} >= 0 THEN ${column} + ${delta} ELSE NULL END`;
}
export function balanceDelta(column: any, delta: number) {
  if (!Number.isFinite(delta)) throw new Error("Invalid balance amount");
  return sql`ROUND(MAX(0, ${column} + ${delta}), 2)`;
}
function both(parts: SQL[]): SQL {
  if (!parts.length) return sql`1`;
  if (parts.length === 1) return parts[0];
  const mid = Math.floor(parts.length / 2);
  return sql`(${both(parts.slice(0,mid))} AND ${both(parts.slice(mid))})`;
}
// A single JSON bind per table avoids D1's parameter ceiling for long invoices.
export function snapshotUnchanged(table: any, scope: SQL, rows: Record<string, any>[]): SQL {
  const columns = getTableColumns(table);
  const matches = both(Object.entries(columns).map(([key,column]) =>
    sql`${column} IS json_extract(expected.value, ${`$.${key}`})`));
  return sql`((SELECT COUNT(*) FROM ${table} WHERE ${scope}) = ${rows.length}
    AND NOT EXISTS (SELECT 1 FROM ${table} WHERE ${scope}
      AND NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(rows)}) AS expected WHERE ${matches})))`;
}
export async function commitStockBatch(db: any, member: {id:string;tenantId:string}, statements: any[], guards: SQL[] = []) {
  const access = sql`EXISTS(SELECT 1 FROM users WHERE id=${member.id} AND tenant_id=${member.tenantId} AND status='active')`;
  const audit = db.insert(auditLogs).values({id:crypto.randomUUID(),tenantId:member.tenantId,userId:member.id,
    action:"stock.commit",details:"Atomic inventory operation",createdAt:sql`CASE WHEN ${both([access,...guards])} THEN ${Date.now()} ELSE NULL END`});
  try { await db.batch([audit,...statements]); }
  catch (error) {
    let detail = "", current:any = error;
    for (let i=0;i<5 && current;i++,current=current.cause) detail += " " + String(current.message || current);
    if (/NOT NULL constraint failed: products\.(stock|physical_stock)/i.test(detail))
      throw new Error("Stock changed while saving or insufficient stock remains. Refresh the batch and retry; nothing was saved.");
    if (/NOT NULL constraint failed: audit_logs.created_at/i.test(detail))
      throw new Error("This record changed while saving or your access changed. Reload the latest record and retry; nothing was saved.");
    throw error;
  }
}
