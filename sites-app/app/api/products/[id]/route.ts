import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { deleteProductMaster, updateProductMaster } from "@/lib/medibill";

import { ProductMasterUpdateError } from "@/lib/product-master-sync";

type C = { params: Promise<{ id: string }> };

export async function PATCH(r: Request, { params }: C) {
  const u = await getChatGPTUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    let body: unknown;
    try { body = await r.json(); } catch { throw new ProductMasterUpdateError("Invalid JSON"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ProductMasterUpdateError("Invalid product details.");
    return NextResponse.json(await updateProductMaster(u.userId, (await params).id, body as Parameters<typeof updateProductMaster>[2]));
  } catch (error) {
    if (error instanceof ProductMasterUpdateError)
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Product master update failed", { productId: (await params).id, userId: u.userId });
    return NextResponse.json({ error: "Unable to update product. Please reload and try again." }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: C) {
  const u = await getChatGPTUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(
      await deleteProductMaster(u.userId, (await params).id),
    );
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Unable to delete product";
    const [code, ...parts] = raw.split(":");
    const known = code.startsWith("PRODUCT_");
    const status = code === "PRODUCT_IN_USE" ? 409 : code === "PRODUCT_DELETE_FORBIDDEN" ? 403 : code === "PRODUCT_NOT_FOUND" ? 404 : 400;
    console.error("Product master deletion rejected", {
      productId: (await params).id,
      userId: u.userId,
      code: known ? code : "PRODUCT_DELETE_FAILED",
      status,
    });
    return NextResponse.json(
      { error: known ? parts.join(":") : raw, code: known ? code : undefined },
      { status },
    );
  }
}
