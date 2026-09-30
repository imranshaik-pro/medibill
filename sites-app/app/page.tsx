import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { MediBillApp } from "@/app/medibill-app";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) return <main className="auth-page"><section className="auth-story"><div className="brand"><span>M+</span>MediBill <b>Pro</b></div><div><p className="eyebrow">MEDICAL DISTRIBUTION, UNDER CONTROL</p><h1>Billing, stock and collections in one secure workspace.</h1><p>Access the same agency records from any machine. Your identity is verified by the sign-in provider, and MediBill keeps every agency’s data isolated.</p></div><ul><li>GST-ready billing</li><li>Batch and expiry traceability</li><li>Cloud database and backups</li></ul></section><section className="signin-card"><div className="brand mobile"><span>M+</span>MediBill <b>Pro</b></div><div className="signin-inner"><p className="eyebrow dark">SECURE ACCOUNT ACCESS</p><h2>Sign in to MediBill</h2><p>Use your verified ChatGPT account. New users can create an account during sign-in; forgotten-password recovery is handled securely by the identity provider.</p><a className="signin-button" href={chatGPTSignInPath("/")} target="_top">Continue securely <strong>→</strong></a><small>MediBill never receives or stores your password.</small></div></section></main>;
  return <MediBillApp user={{ name: user.displayName, email: user.email }} />;
}
