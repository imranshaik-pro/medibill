# Independent Google login: staging integration

Google OAuth uses `/api/auth/google/start` and `/api/auth/google/callback`.
The login code is exchanged on the server using PKCE and a single-use,
ten-minute state record bound to an HTTP-only browser cookie. Identity comes
from Google's HTTPS UserInfo endpoint, not client headers or decoded JWT claims.
Only verified emails are accepted. Database sessions expire after eight hours;
only SHA-256 hashes of session tokens are stored. Logout revokes the session
and requires a same-origin POST after a confirmation page.

Local ignored `.dev.vars` requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and
AUTH_BASE_URL=http://127.0.0.1:5173. Existing Sites development login remains
available when Google configuration is absent. Google mode ignores Sites
identity headers and mock cookies.

Apply drizzle/0017_google_auth.sql to the local database using the built local
Wrangler configuration before testing. It creates authentication tables only.
Do not copy session records or OAuth flows into backups destined for production.

New Google users have a `google:<subject>` identity and use the existing firm
registration flow with pending approval. No role is inferred from an email,
including irshad4281@gmail.com. Existing users must be linked explicitly in
auth_identity_links (Google subject -> existing users.id) by the database
administrator AFTER successful verified sign-in. Keep original user IDs, roles
and tenant relationships. Check the intended user and agency before linking;
do not edit old invoice ownership or replace users wholesale.

After each production build use scripts/prepare-cloudflare.mjs with the actual
database ID, bucket and HTTPS origin. It strips inherited development variables
and explicitly sets AUTH_MODE=google. Store credentials as Cloudflare secrets;
never commit `.dev.vars` or secrets to the generated configuration.

This integration is for staging. End-to-end Google login must be tested using
the owner's credentials. Before public release complete admin identity mapping,
authentication/OCR rate limiting, Super Admin MFA/step-up controls, audit coverage,
session rotation, tenant isolation acceptance and fresh data/file migration.
An OAuth client or a successful build alone does not make deployment production-ready.
