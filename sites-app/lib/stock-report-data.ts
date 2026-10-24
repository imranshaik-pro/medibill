import { eq, asc } from "drizzle-orm";
import { getDb } from "@/db";
import { products } from "@/db/schema";
import { getMembership } from "./medibill";

export async function stockReportData(userId: string) {
  const member = await getMembership(userId);
  if (!member) throw new Error("REPORT_ACCESS_DENIED");
  // Reports must read the full tenant inventory, not the 100-row dashboard sample.
  const rows = await getDb().select({
    id: products.id, name: products.name, pack: products.pack,
    manufacturer: products.manufacturer, batch: products.batch, expiry: products.expiry,
    stock: products.stock, mrp: products.mrp, purchaseRate: products.purchaseRate,
  }).from(products).where(eq(products.tenantId, member.tenantId)).orderBy(asc(products.name), asc(products.id));
  return { products: rows, generatedAt: new Date().toISOString() };
}
