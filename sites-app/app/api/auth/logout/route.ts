import { env } from "cloudflare:workers";
import { baseUrl, cookie, googleEnabled, hash, readCookie } from "@/lib/google-auth";
export async function GET() {
  if (!googleEnabled()) return new Response(null,{status:302,headers:{Location:"/signout-with-chatgpt?return_to=/"}});
  return new Response('<!doctype html><html><meta charset="utf-8"><title>Sign out</title><body><h1>Sign out of MediBill?</h1><form method="post" action="/api/auth/logout"><button type="submit">Sign out</button></form><a href="/">Cancel</a></body></html>',{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'; form-action 'self'; frame-ancestors 'none'"}});
}
export async function POST(request:Request) {
  if (request.headers.get("origin") !== baseUrl()) return new Response("Forbidden",{status:403});
  const token=readCookie(request.headers.get("cookie"),"medibill_session");
  if (/^[a-f0-9]{64}$/.test(token)) await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash=?").bind(await hash(token)).run();
  return new Response(null,{status:303,headers:{Location:baseUrl(),"Set-Cookie":cookie("medibill_session","",0),"Cache-Control":"no-store"}});
}
