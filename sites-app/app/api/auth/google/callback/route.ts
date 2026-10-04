import { env } from "cloudflare:workers";
import { GoogleProviderError, authEnv, baseUrl, cookie, hash, providerJson, randomToken, readCookie } from "@/lib/google-auth";
export async function GET(request: Request) {
  let stage = "callback_parameters";
  const diagnosticId = crypto.randomUUID();
  try {
    const u = new URL(request.url), state = u.searchParams.get("state") || "", code = u.searchParams.get("code");
    if (!/^[a-f0-9]{64}$/.test(state) || !code || code.length>4096) throw new Error("Invalid callback");
    stage = "state_cookie";
    const storedState = readCookie(request.headers.get("cookie"), "medibill_oauth");
    if (!storedState || state !== storedState) throw new Error("Invalid callback");
    stage = "flow_database";
    const flow = await env.DB.prepare("DELETE FROM auth_oauth_flows WHERE state_hash=? AND expires_at>? RETURNING verifier,return_to").bind(await hash(state),Date.now()).first<{verifier:string;return_to:string}>();
    stage = "flow_expired_or_reused";
    if (!flow) throw new Error("Expired callback");
    stage = "credentials";
    const e = authEnv();
    if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) throw new Error("Missing credentials");
    stage = "token_exchange";
    const tokens = await providerJson("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:e.GOOGLE_CLIENT_ID,client_secret:e.GOOGLE_CLIENT_SECRET,code,code_verifier:flow.verifier,grant_type:"authorization_code",redirect_uri:baseUrl()+"/api/auth/google/callback"})});
    stage = "token_response";
    if (typeof tokens.access_token !== "string" || String(tokens.token_type).toLowerCase() !== "bearer") throw new Error("Invalid token");
    // Read identity directly from Google's HTTPS UserInfo endpoint with the exchanged token.
    // Never trust client-supplied email, headers, or an unverified JWT payload.
    stage = "google_userinfo";
    const user = await providerJson("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:`Bearer ${tokens.access_token}`}});
    stage = "verified_identity";
    if (typeof user.sub !== "string" || !/^[0-9]{1,255}$/.test(user.sub) || user.email_verified !== true || typeof user.email !== "string" || user.email.length>254) throw new Error("Unverified identity");
    const token = randomToken(), email = user.email.toLowerCase(), name = typeof user.name === "string" ? user.name.slice(0,200) : email;
    stage = "session_database";
    await env.DB.prepare("INSERT INTO auth_sessions(token_hash,google_subject,user_id,email,display_name,expires_at) VALUES(?,?,?,?,?,?)").bind(await hash(token),user.sub,"google:"+user.sub,email,name,Date.now()+8*3600000).run();
    stage = "redirect_cookie";
    const headers = new Headers({Location:baseUrl()+flow.return_to,"Cache-Control":"no-store"});
    headers.append("Set-Cookie",cookie("medibill_session",token,8*3600));
    headers.append("Set-Cookie",cookie("medibill_oauth","",0));
    return new Response(null,{status:302,headers});
  } catch (error) {
    // Log only fixed stage labels and allowlisted provider codes. Never log the
    // request URL, cookies, authorization code, tokens, credentials, or raw errors.
    const provider = error instanceof GoogleProviderError ? {status: error.status, reason: error.reason} : undefined;
    const errorNames = ["TypeError", "ReferenceError", "SyntaxError", "TimeoutError", "AbortError", "Error"];
    const errorType = error instanceof Error && errorNames.includes(error.name) ? error.name : "UnknownError";
    const message = error instanceof Error ? error.message : "";
    // Convert runtime messages to fixed labels; never output the raw message.
    const runtimeReason = /AbortSignal.*timeout|timeout.*not a function/i.test(message) ? "timeout_api_unavailable"
      : /different request|outside.*request|I\/O.*context/i.test(message) ? "request_context"
      : /certificate|TLS|SSL/i.test(message) ? "tls_failure"
      : /fetch failed|network|connection/i.test(message) ? "network_failure"
      : /JSON|Unexpected token/i.test(message) ? "invalid_json_response"
      : errorType === "TimeoutError" || errorType === "AbortError" ? "request_timeout"
      : "runtime_failure";
    console.error("[MediBill Google auth]", JSON.stringify({diagnosticId, stage, provider, errorType, runtimeReason}));
    return Response.json({error:"Sign-in could not be verified. Restart Google sign-in.", diagnostic_id:diagnosticId, failure_stage:stage, error_type:errorType, failure_reason:provider?.reason || runtimeReason},
      {status:401,headers:{"Cache-Control":"no-store"}});
  }
}
