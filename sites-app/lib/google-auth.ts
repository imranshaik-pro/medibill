import { env } from "cloudflare:workers";

type Bindings = typeof env & { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; AUTH_BASE_URL?: string; AUTH_MODE?: string };
export const authEnv = () => env as Bindings;
export const googleEnabled = () => authEnv().AUTH_MODE === "google" || Boolean(authEnv().GOOGLE_CLIENT_ID);
export function baseUrl() {
  const u = new URL(authEnv().AUTH_BASE_URL || "");
  if (u.pathname !== "/" || u.search || u.hash || u.username || u.password) throw new Error("Invalid authentication origin");
  if (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) throw new Error("Authentication requires HTTPS");
  return u.origin;
}
export function safeReturn(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  const u = new URL(value, "https://app.invalid");
  return u.origin === "https://app.invalid" && !u.pathname.startsWith("/api/auth/") ? u.pathname + u.search : "/";
}
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, "0")).join("");
}
export async function hash(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), x => x.toString(16).padStart(2, "0")).join("");
}
export async function challenge(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function cookie(name: string, value: string, age: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${baseUrl().startsWith("https:") ? "; Secure" : ""}`;
}
export function readCookie(raw: string | null, name: string) {
  const values = (raw || "").split(";").map(x => x.trim()).filter(x => x.startsWith(name + "="));
  return values.length === 1 ? values[0].slice(name.length + 1) : "";
}
export async function sessionUser(raw: string | null) {
  const token = readCookie(raw, "medibill_session");
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const row = await env.DB.prepare("SELECT s.user_id, s.email, s.display_name, l.user_id AS linked_user_id FROM auth_sessions s LEFT JOIN auth_identity_links l ON l.google_subject=s.google_subject WHERE s.token_hash=? AND s.expires_at>?").bind(await hash(token), Date.now()).first<{user_id:string;email:string;display_name:string;linked_user_id:string|null}>();
  return row ? { userId: row.linked_user_id || row.user_id, email: row.email, displayName: row.display_name, fullName: row.display_name } : null;
}
export class GoogleProviderError extends Error {
  constructor(public status: number, public reason: string) { super("Google provider request failed"); }
}
export async function providerJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as {error?: unknown} | null;
    const allowed = ["invalid_client", "invalid_grant", "unauthorized_client", "access_denied", "invalid_request", "invalid_token", "insufficient_scope"];
    const reason = typeof body?.error === "string" && allowed.includes(body.error) ? body.error : "provider_rejected";
    throw new GoogleProviderError(response.status, reason);
  }
  return response.json() as Promise<Record<string, unknown>>;
}
