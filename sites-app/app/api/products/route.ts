import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { addProduct } from "@/lib/medibill";
export async function POST(request: Request) {
  const user = await getChatGPTUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { const b = await request.json(); if (!b.name || !b.manufacturer) throw new Error("Enter product name and manufacturer"); return NextResponse.json(await addProduct(user.userId, b), { status: 201 }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to save product" }, { status: 400 }); }
}
