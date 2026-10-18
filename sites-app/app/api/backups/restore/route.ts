import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { restoreFullBackup, validateBackupPayload, getMembership } from "@/lib/medibill";
import { requireRestoreAdmin } from "@/lib/restore-security";
export async function POST(r: Request) {
  const u = await getChatGPTUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const origin = r.headers.get("origin");
  if (origin && origin !== new URL(r.url).origin)
    return NextResponse.json({ error: "Untrusted request origin" }, { status: 403 });
  if (!r.headers.get("content-type")?.includes("application/json"))
    return NextResponse.json({ error: "JSON content type required" }, { status: 415 });
  try {
    const m = await getMembership(u.userId);
    requireRestoreAdmin(m);
    if (!m) throw new Error("Workspace required");
    const text = await r.text();
    if (text.length > 16 * 1024 * 1024) return NextResponse.json({ error: "Backup exceeds 16 MB limit" }, { status: 413 });
    const b = JSON.parse(text);
    if (b.inspect) {
      const x = validateBackupPayload(b.snapshot, m.tenantId);
      return NextResponse.json({ createdAt: x.createdAt, counts: {
        products: x.productMasters.length, purchases: x.purchaseInwards.length + x.purchases.length,
        sales: x.invoices.length, batches: x.products.length,
      } });
    }
    return NextResponse.json(await restoreFullBackup(u.userId, b.snapshot, String(b.confirmation || "")));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Restore failed";
    return NextResponse.json({ error: message }, { status: message.startsWith("RESTORE_FORBIDDEN") ? 403 : 400 });
  }
}
