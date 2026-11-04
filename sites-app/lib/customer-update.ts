import { and, eq, sql } from "drizzle-orm";
import { customers, auditLogs } from "../db/schema";

export async function persistCustomerEdit(db: any, member: {id: string; tenantId: string; role: string; status: string}, id: string, input: Record<string, unknown>) {
  if (member.status !== "active" || !["owner", "admin", "super_admin"].includes(member.role)) throw new Error("Administrator access required");
  const existing = await db.select().from(customers).where(and(eq(customers.id,id),eq(customers.tenantId,member.tenantId))).get();
  if (!existing) throw new Error("Customer not found");
  const fields = ["name","phone","legalName","tradeName","gstin","dlNo","address","city","state","stateCode","pinCode","registrationStatus"];
  const updates: Record<string, any> = {};
  for (const field of fields) if (Object.hasOwn(input,field)) {
    if (typeof input[field] !== "string") throw new Error(`Invalid customer field: ${field}`);
    const value = (input[field] as string).trim();
    if (value.length > (field === "address" ? 2000 : 255)) throw new Error(`${field} is too long`);
    updates[field] = value || (field === "name" || field === "phone" ? "" : null);
  }
  if (!Object.keys(updates).length) throw new Error("No customer changes supplied");
  if ("name" in updates && !updates.name) throw new Error("Enter a firm name");
  if ("phone" in updates) {
    let phone = updates.phone.replace(/[\s()+-]/g, "");
    if (/^91\d{10}$/.test(phone)) phone = phone.slice(2);
    // Preserve unchanged legacy contact data while allowing other corrections.
    if (!/^\d{10}$/.test(phone) && updates.phone !== existing.phone) throw new Error("Enter a 10-digit mobile number (optional +91 prefix)");
    updates.phone = /^\d{10}$/.test(phone) ? phone : existing.phone;
  }
  for (const key of ["gstin","dlNo"]) if (updates[key]) updates[key] = updates[key].toUpperCase();
  if (updates.gstin) updates.gstin = updates.gstin.replace(/\s/g, "");
  if (updates.gstin && updates.gstin !== existing.gstin?.replace(/\s/g, "").toUpperCase() && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(updates.gstin)) throw new Error("GSTIN must contain 15 characters in the format 36ABCDE1234F1Z5. Leave it blank for an unregistered customer.");
  if (updates.pinCode && updates.pinCode !== existing.pinCode && !/^\d{6}$/.test(updates.pinCode)) throw new Error("Enter a 6-digit pincode");
  if (updates.stateCode && updates.stateCode !== existing.stateCode && !/^\d{2}$/.test(updates.stateCode)) throw new Error("Enter a 2-digit state code");
  if ("registrationStatus" in updates && !updates.registrationStatus) updates.registrationStatus = "Unverified";
  // Audit failure or revoked access rolls back the edit instead of returning an ambiguous success.
  await db.batch([
    db.update(customers).set(updates).where(and(eq(customers.id,id),eq(customers.tenantId,member.tenantId))),
    db.insert(auditLogs).values({id:crypto.randomUUID(),tenantId:member.tenantId,userId:member.id,action:"customer.updated",details:id,
      createdAt:sql`CASE WHEN EXISTS (SELECT 1 FROM users WHERE id=${member.id} AND tenant_id=${member.tenantId} AND status='active' AND role IN ('owner','admin','super_admin')) THEN ${Date.now()} ELSE NULL END`}),
  ]);
  return await db.select().from(customers).where(and(eq(customers.id,id),eq(customers.tenantId,member.tenantId))).get();
}
