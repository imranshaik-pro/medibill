import { env } from "cloudflare:workers";
import { runDocumentRequest, DocumentRequestError } from "@/lib/document-safety";
import { getMembership } from "@/lib/medibill";
import {NextResponse} from "next/server";import{getChatGPTUser}from"@/app/chatgpt-auth";import{addPayment}from"@/lib/medibill";
export async function POST(r:Request){const u=await getChatGPTUser();if(!u)return NextResponse.json({error:"Unauthorized"},{status:401});try{const b=await r.json(),input={...b,amount:Number(b.amount)};if(!input.partyId||input.amount<=0)throw new Error("Select a party and enter an amount");return NextResponse.json(await runDocumentRequest(env.DB,await getMembership(u.userId),"payment",r.headers.get("Idempotency-Key"),input,op=>addPayment(u.userId,input,op)),{status:201})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to save payment"},{status:e instanceof DocumentRequestError ? e.status : 400})}}
