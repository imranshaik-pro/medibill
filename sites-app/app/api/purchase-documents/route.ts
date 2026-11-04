import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getMembership } from "@/lib/medibill";

const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "application/json"]);

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const member = await getMembership(user.userId);
  if (!member) return NextResponse.json({ error: "Workspace required" }, { status: 400 });
  const form = await request.formData();
  const file = form.get("invoice");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an invoice file" }, { status: 400 });
  if (!allowed.has(file.type) || file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Use PDF, JPG, PNG, WebP or JSON up to 15 MB" }, { status: 400 });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
  const key = `purchase-documents/${member.tenantId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type }, customMetadata: { uploadedBy: user.userId, originalName: file.name } });
  return NextResponse.json({ key, name: file.name });
}
