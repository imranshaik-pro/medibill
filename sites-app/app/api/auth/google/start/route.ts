import { env } from "cloudflare:workers";
import { authEnv, baseUrl, challenge, cookie, googleEnabled, hash, randomToken, safeReturn } from "@/lib/google-auth";
export async function GET(request: Request) {
  try {
    const e = authEnv();
    if (!googleEnabled() || !e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) throw new Error("Google login is not configured");
    const state = randomToken(), verifier = randomToken(), now = Date.now();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM auth_oauth_flows WHERE expires_at<=?").bind(now),
      env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at<=?").bind(now),
      env.DB.prepare("INSERT INTO auth_oauth_flows(state_hash,verifier,return_to,expires_at) VALUES(?,?,?,?)").bind(await hash(state), verifier, safeReturn(new URL(request.url).searchParams.get("return_to")), now + 600000),
    ]);
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({ client_id:e.GOOGLE_CLIENT_ID, redirect_uri:baseUrl()+"/api/auth/google/callback", response_type:"code", scope:"openid email profile", state, code_challenge:await challenge(verifier), code_challenge_method:"S256", prompt:"select_account" }).toString();
    return new Response(null, {status:302,headers:{Location:u.href,"Set-Cookie":cookie("medibill_oauth",state,600),"Cache-Control":"no-store"}});
  } catch { return Response.json({error:"Google login is not ready. Check credentials and authentication migrations."},{status:503,headers:{"Cache-Control":"no-store"}}); }
}
