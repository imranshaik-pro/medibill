import { InvoiceEditConflict } from "@/lib/medibill";
import { InvoiceDeletionError } from "@/lib/invoice-deletion";
import { deleteSalesInvoice } from "@/lib/medibill";
import{NextResponse}from"next/server";import{getChatGPTUser}from"@/app/chatgpt-auth";import{getSalesInvoice,updateSalesInvoice}from"@/lib/medibill";type C={params:Promise<{id:string}>};export async function GET(_:Request,{params}:C){const u=await getChatGPTUser();if(!u)return NextResponse.json({error:"Unauthorized"},{status:401});try{return NextResponse.json(await getSalesInvoice(u.userId,(await params).id))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Not found"},{status:404})}}export async function PATCH(r: Request, {params}: C) {
  const u = await getChatGPTUser();
  if (!u) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const input = await r.json() as {expectedRevision?:unknown};
    if (!input || typeof input.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedRevision))
      return NextResponse.json({error:"Refresh the application and reopen this invoice before editing. Your draft has been kept."},{status:409});
    return NextResponse.json(await updateSalesInvoice(u.userId,(await params).id,input as Parameters<typeof updateSalesInvoice>[2]));
  } catch(e) {
    return NextResponse.json({error:e instanceof Error?e.message:"Unable to update invoice"},
      {status:e instanceof InvoiceEditConflict || (e instanceof Error && /record changed/.test(e.message)) ? 409 : 400});
  }
}

export async function DELETE(request: Request, {params}: C) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    let input: {confirm_delete?: boolean; reason?: string};
    try { const raw: unknown = await request.json(); if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NextResponse.json({error:"Invalid deletion request."},{status:400}); input=raw as {confirm_delete?: boolean; reason?: string}; } catch { return NextResponse.json({error:"A JSON confirmation and reason are required."},{status:400}); }
    return NextResponse.json(await deleteSalesInvoice(user.userId,(await params).id,input));
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to delete invoice"}, {status:error instanceof InvoiceDeletionError?error.status:500});
  }
}
