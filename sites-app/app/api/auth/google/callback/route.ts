import { env } from "cloudflare:workers";
import { authEnv, baseUrl, cookie, hash, providerJson, randomToken, readCookie } from "@/lib/google-auth";
export async function GET(request: Request) {
  try {
    const u = new URL(request.url), state = u.searchParams.get("state") || "", code = u.searchParams.get("code");
    if (!/^[a-f0-9]{64}$/.test(state) || state !== readCookie(request.headers.get("cookie"),"medibill_oauth") || !code || code.length>4096) throw new Error("Invalid callback");
    const flow = await env.DB.prepare("DELETE FROM auth_oauth_flows WHERE state_hash=? AND expires_at>? RETURNING verifier,return_to").bind(await hash(state),Date.now()).first<{verifier:string;return_to:string}>();
    if (!flow) throw new Error("Expired callback");
    const e = authEnv();
    if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) throw new Error("Missing credentials");
    const tokens = await providerJson("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:e.GOOGLE_CLIENT_ID,client_secret:e.GOOGLE_CLIENT_SECRET,code,code_verifier:flow.verifier,grant_type:"authorization_code",redirect_uri:baseUrl()+"/api/auth/google/callback"})});
    if (typeof tokens.access_token !== "string" || String(tokens.token_type).toLowerCase() !== "bearer") throw new Error("Invalid token");
    // Read identity directly from Google's HTTPS UserInfo endpoint with the exchanged token.
    // Never trust client-supplied email, headers, or an unverified JWT payload.
    const user = await providerJson("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:`Bearer ${tokens.access_token}`}});
    if (typeof user.sub !== "string" || !/^[0-9]{1,255}$/.test(user.sub) || user.email_verified !== true || typeof user.email !== "string" || user.email.length>254) throw new Error("Unverified identity");
    const token = randomToken(), email = user.email.toLowerCase(), name = typeof user.name === "string" ? user.name.slice(0,200) : email;
    await env.DB.prepare("INSERT INTO auth_sessions(token_hash,google_subject,user_id,email,display_name,expires_at) VALUES(?,?,?,?,?,?)").bind(await hash(token),user.sub,"google:"+user.sub,email,name,Date.now()+8*3600000).run();
    const headers = new Headers({Location:baseUrl()+flow.return_to,"Cache-Control":"no-store"});
    headers.append("Set-Cookie",cookie("medibill_session",token,8*3600));
    headers.append("Set-Cookie",cookie("medibill_oauth","",0));
    return new Response(null,{status:302,headers});
  } catch { return Response.json({error:"Sign-in could not be verified. Restart Google sign-in."},{status:401,headers:{"Cache-Control":"no-store"}}); }
}
