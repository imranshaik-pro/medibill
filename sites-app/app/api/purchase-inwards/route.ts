import { env } from "cloudflare:workers";
import { runDocumentRequest, DocumentRequestError } from "@/lib/document-safety";
import { getMembership } from "@/lib/medibill";
import {NextResponse} from "next/server";import{getChatGPTUser}from"@/app/chatgpt-auth";import{addPurchaseInward}from"@/lib/medibill";
export async function POST(request:Request){const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});try{const input=await request.json();return NextResponse.json(await runDocumentRequest(env.DB,await getMembership(user.userId),"purchase",request.headers.get("Idempotency-Key"),input,op=>addPurchaseInward(user.userId,input,op)),{status:201})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to save purchase inward"},{status:error instanceof DocumentRequestError ? error.status : 400})}}
