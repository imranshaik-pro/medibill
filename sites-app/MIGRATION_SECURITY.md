# Migration Security Requirements

## Identity boundary

The exported application currently obtains identity from ChatGPT Sites request headers in `app/chatgpt-auth.ts`. Those headers are trustworthy only inside the Sites-managed environment. An independent production deployment must replace this adapter with server-validated authentication before public access is enabled.

Preserve the application's internal identity contract where practical:

```ts
{
  userId: string;
  email: string;
  displayName: string;
  fullName: string;
}
```

Recommended choices include a mature OpenID Connect provider or an audited session-based authentication library. Validate tokens or sessions on the server, use secure HTTP-only cookies where applicable, and never accept identity or role claims directly from client-controlled headers.

## Existing user mapping

The database export preserves existing users, roles, tenant mappings, and approval states. During migration, map destination identity-provider subjects to the existing user records explicitly. Do not infer Super Admin access from an email address alone, and do not create a default global administrator in application code.

## Required production controls

- Require MFA for Super Admin accounts.
- Use short-lived sessions with rotation, revocation, and secure cookie attributes.
- Enforce tenant ownership in every database query and object-storage key operation.
- Rate-limit authentication, lookup, OCR, upload, backup, and destructive endpoints.
- Validate file type by content, impose size limits, and malware-scan retained uploads.
- Keep OCR temporary files outside public paths and delete them after processing.
- Use database transactions for purchase/sales edits and stock-ledger reconciliation.
- Require step-up authentication and an explicit confirmation phrase for restores or resets.
- Encrypt backups and object storage, and test restoration regularly.
- Store API keys only in a platform secret manager; rotate any previously shared key.
- Enable structured audit logs, error monitoring, uptime checks, and security alerts.
- Serve only over HTTPS and configure appropriate CSP, HSTS, and framing protections.

## Export privacy

`data/d1-full-export.json`, the generated SQL import, and `object-storage/` contain operational data. Treat the archive as confidential. Restrict access, encrypt it at rest and in transit, and remove working copies after migration is verified.
