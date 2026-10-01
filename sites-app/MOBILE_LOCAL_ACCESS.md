# Mobile access on private Wi-Fi (Windows)

This gateway exposes the existing local MediBill development installation to a phone over HTTPS with a password. It does not replace production authentication. All authenticated gateway sessions act as the existing `local_seedy` administrator and its current tenant. Use only with trusted agency operators. No individual user roles or attribution are added.

The source, database, and stored invoices remain on the PC. The PC, app terminal, and gateway terminal must stay running. Do not port-forward 5443 or 5173 or publish this development installation to the internet.

## Setup once

Run from `C:\Users\pc\Projects\medibill\sites-app` in PowerShell:

```powershell
Add-Content .gitignore "`n/.medibill-mobile/`n.dev.vars`n.dev.vars.*`n/wrangler.local.jsonc"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\mobile-setup.ps1
```

Choose a unique password of at least 12 characters. Windows prompts hide it. Setup stores a salted scrypt password hash, private HTTPS certificate, and certificate passphrase inside `.medibill-mobile`, with permissions restricted to your Windows account. Keep this folder private. Setup refuses to overwrite existing credentials.

## Start each time

Terminal 1:

```powershell
npm.cmd run dev -- --hostname 127.0.0.1
```

Terminal 2, in the same project folder:

```powershell
node .\scripts\mobile-gateway.mjs
```

The gateway prints `https://YOUR-PC-IP:5443`. Connect your phone to the same trusted Wi-Fi and manually enter that exact URL. Use HTTPS, not HTTP or localhost. Sign in with your mobile password.

This local certificate is self-signed, so the browser will show a certificate warning. Verify the URL matches the PC's printed private IP before using its Advanced/Proceed option. This certificate is not publicly trusted; do not treat the gateway as a production server. Some phones/browsers disallow bypass, camera capture, or other secure-context features for untrusted certificates. File picker uploads are the fallback; do not enable global browser security exceptions. A trusted local certificate or production HTTPS deployment is needed for reliable camera APIs.

The session cookie is HttpOnly, Secure, and SameSite=Strict. Sessions expire after 8 hours or gateway restart. Logout invalidates the gateway session. Login attempts are limited per client IP. Cross-origin writes and incoming identity headers are blocked. Vite hot-reload websockets are deliberately not forwarded; refresh the mobile page after code changes.

## Windows Firewall (only if phone cannot connect)

Check PC and phone are on the same non-guest Wi-Fi, with client isolation disabled. Set the trusted Windows network profile to Private. In an Administrator PowerShell, allow only the gateway on the private local subnet:

```powershell
New-NetFirewallRule -DisplayName "MediBill Mobile HTTPS" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5443 -Profile Private -RemoteAddress LocalSubnet
```

Do not allow port 5173 to the network. If the PC IP changes, restart the gateway and use the new printed address.

Remove the firewall rule when no longer required:

```powershell
Remove-NetFirewallRule -DisplayName "MediBill Mobile HTTPS"
```

## Recovery

A 502 message means the main MediBill app is stopped or unavailable at port 5173. Start it first. Port 5443 already in use means another gateway is running; close that terminal. To change the password, stop the gateway, remove the private `.medibill-mobile` folder, and repeat setup. This only replaces gateway credentials and certificate, not the database. Existing gateway sessions are lost on restart.

Application backups do not include gateway credentials. Keep database backups separate and do not commit `.wrangler/state`, `.dev.vars`, or `.medibill-mobile` to Git.
