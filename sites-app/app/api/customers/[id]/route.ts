import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { updateCustomer } from "@/lib/medibill";
export async function PATCH(request: Request, {params}: {params: Promise<{id:string}>}) {
 const user = await getChatGPTUser();
 if (!user) return NextResponse.json({error:"Unauthorized"},{status:401});
 try {
  const body = await request.json() as Record<string, string> & {name:string; phone:string};
  const fields = ["name","phone","legalName","tradeName","gstin","dlNo","address","city","state","stateCode","pinCode","registrationStatus"];
  if (!body || typeof body !== "object" || Array.isArray(body) || fields.some(key => body[key] != null && typeof body[key] !== "string")) throw new Error("Invalid customer fields");
  return NextResponse.json(await updateCustomer(user.userId,(await params).id,body));
 } catch(error) {const raw=error instanceof Error ? error.message : "Unable to update customer"; const message=raw.includes("UNIQUE constraint failed") ? "Another customer already uses this firm name" : raw.includes("constraint failed") ? "Customer update could not be saved; please refresh and retry" : raw; return NextResponse.json({error:message},{status:message==="Administrator access required"?403:message==="Customer not found"?404:400});}
}
