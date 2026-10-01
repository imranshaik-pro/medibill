import {env} from 'cloudflare:workers';
import {NextResponse} from 'next/server';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {getMembership} from '@/lib/medibill';
import {searchWorkspace} from '@/lib/workspace-search';
export async function GET(request:Request){
 const user=await getChatGPTUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const member=await getMembership(user.userId);
 if(!member)return NextResponse.json({error:'Active agency membership required.'},{status:403});
 const q=new URL(request.url).searchParams.get('q')||'';
 if(q.length>120)return NextResponse.json({error:'Search is limited to 120 characters.'},{status:400});
 try{return NextResponse.json(await searchWorkspace(env.DB,member.tenantId,q),{headers:{'Cache-Control':'no-store'}});}
 catch(error){console.error('Workspace search failed',error instanceof Error?error.message:'Unknown error');return NextResponse.json({error:'Unable to search. Please try again.'},{status:500});}
}
