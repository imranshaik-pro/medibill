import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { addInvoice } from "@/lib/medibill";
export async function POST(request: Request) {
  const user = await getChatGPTUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { const input=await request.json(); if(!input.customerId||!Array.isArray(input.items)||!input.items.length)throw new Error("Select a customer and add at least one product row");for(const [i,row]of input.items.entries())if(!row.productId||Number(row.quantity)<=0||Number(row.freeQuantity)<0||Number(row.unitRate)<=0||Number(row.discountPercent)<0||Number(row.discountPercent)>100)throw new Error(`Complete the product and commercial terms in row ${i+1}`);return NextResponse.json(await addInvoice(user.userId,input),{status:201}); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to save invoice" }, { status: 400 }); }
}
