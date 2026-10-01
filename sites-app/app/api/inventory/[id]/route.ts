import {env} from "cloudflare:workers";
import {deleteInventoryBatch, InventoryDeletionError} from "@/lib/inventory-deletion";
import {getMembership, createFullBackup} from "@/lib/medibill";
import{NextResponse}from"next/server";import{getChatGPTUser}from"@/app/chatgpt-auth";import{updateBatchStock}from"@/lib/medibill";type C={params:Promise<{id:string}>};export async function PATCH(r:Request,{params}:C){const u=await getChatGPTUser();if(!u)return NextResponse.json({error:"Unauthorized"},{status:401});try{return NextResponse.json(await updateBatchStock(u.userId,(await params).id,await r.json()))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to update batch"},{status:400})}}

export async function DELETE(request:Request,{params}:C) {
 const user=await getChatGPTUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 try {
  const body:unknown=await request.json();
  if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({error:"Invalid deletion request"},{status:400});
  const result=await deleteInventoryBatch(env.DB,await getMembership(user.userId),(await params).id,body as {confirm_delete?:boolean;reason?:string},()=>createFullBackup(user.userId,"pre_delete_inventory"));
  return NextResponse.json(result);
 } catch(error) {
  return NextResponse.json({error:error instanceof Error?error.message:"Unable to delete batch"},{status:error instanceof InventoryDeletionError?error.status:500});
 }
}
