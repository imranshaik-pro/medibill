import https from 'node:https';
import http from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const privateDir = new URL('../.medibill-mobile/', import.meta.url);
const credentialFile = new URL('credentials.json', privateDir);
const SESSION_MS = 8 * 60 * 60 * 1000;
const COOKIE = '__Host-medibill_mobile';
export function privateAddress(address = '') {
  const ip = address.replace(/^::ffff:/, '');
  return ip === '::1' || /^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}
export function passwordMatches(password, credential) {
  if (typeof password !== 'string' || password.length > 512) return false;
  const actual = scryptSync(password, credential.salt, 64);
  const expected = Buffer.from(credential.hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>MediBill mobile access</title><style>body{font:16px Arial;background:#f1f5f9;color:#0f172a;padding:24px}main{max-width:400px;margin:10vh auto;background:white;padding:28px;border-radius:16px}input,button{box-sizing:border-box;width:100%;padding:14px;margin-top:16px;border:1px solid #cbd5e1;border-radius:8px}button{background:#0f766e;color:white}p{line-height:1.5}</style></head><body><main><h1>MediBill Pro</h1><p>Enter the password configured on your PC. This provides access to the same agency as your local administrator.</p><form method="post" action="/mobile-login"><input type="password" name="password" autocomplete="current-password" required maxlength="512" aria-label="Mobile access password"><button>Sign in</button></form></main></body></html>`;
export function createGateway({ credential, tls, port = 5443, upstreamPort = 5173, hosts }) {
  const sessions = new Map();
  const attempts = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [token, expires] of sessions) if (expires <= now) sessions.delete(token);
    for (const [ip, value] of attempts) if (value.until <= now) attempts.delete(ip);
  }, 60_000);
  timer.unref();
  const server = https.createServer(tls, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    const fail = (code, text) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(text); };
    if (!privateAddress(req.socket.remoteAddress)) return fail(403, 'Only private LAN clients are allowed.');
    let url;
    try { url = new URL(req.url, `https://${req.headers.host}`); } catch { return fail(400, 'Invalid request.'); }
    if (!hosts.has(url.hostname) || url.port !== String(port)) return fail(403, 'Unrecognized gateway address.');
    const origin = `https://${req.headers.host}`;
    if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== origin)) return fail(403, 'Cross-site requests blocked.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin) return fail(403, 'Same-origin request required.');
    if (url.pathname === '/mobile-login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress;
      const recent = attempts.get(ip);
      if (recent && recent.until > Date.now() && recent.count >= 5) return fail(429, 'Too many attempts. Try again in 15 minutes.');
      if (!String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return fail(415, 'Invalid login format.');
      let body = '';
      try { for await (const chunk of req) { body += chunk; if (body.length > 2048) return fail(413, 'Login too large.'); } } catch { return fail(400, 'Could not read login.'); }
      const password = new URLSearchParams(body).get('password');
      if (!passwordMatches(password, credential)) {
        attempts.set(ip, { count: recent && recent.until > Date.now() ? recent.count + 1 : 1, until: recent && recent.until > Date.now() ? recent.until : Date.now() + 900_000 });
        return fail(401, 'Incorrect password. Go back to retry.');
      }
      attempts.delete(ip);
      if (sessions.size >= 100) return fail(503, 'Too many sessions. Restart the gateway.');
      const token = randomBytes(32).toString('hex');
      sessions.set(token, Date.now() + SESSION_MS);
      res.writeHead(303, { Location: '/', 'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800` });
      return res.end();
    }
    const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (!token || (sessions.get(token) || 0) <= Date.now()) {
      if (req.method !== 'GET') return fail(401, 'Sign in first.');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" });
      return res.end(html);
    }
    if (url.pathname === '/signout-with-chatgpt') {
      sessions.delete(token);
      res.writeHead(303, { Location: '/', 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
      return res.end();
    }
    if (url.pathname === '/signin-with-chatgpt' || url.pathname === '/callback') {
      res.writeHead(303, { Location: '/' }); return res.end();
    }
    // The upstream dev server stays on loopback. Never accept client identity headers.
    const headers = { ...req.headers, host: `localhost:${upstreamPort}`, cookie: '__sites_local_auth=1', 'accept-encoding': 'identity' };
    for (const key of Object.keys(headers)) if (key.startsWith('oai-authenticated-user-') || key.startsWith('x-forwarded-') || key === 'forwarded') delete headers[key];
    if (headers.origin) headers.origin = `http://localhost:${upstreamPort}`;
    // Keep Next server-action origin and host validation aligned with the upstream.
    if (headers.referer) headers.referer = `http://localhost:${upstreamPort}/`;
    const proxy = http.request({ hostname: '127.0.0.1', port: upstreamPort, path: url.pathname + url.search, method: req.method, headers }, incoming => {
      const outgoing = { ...incoming.headers, 'cache-control': 'no-store' };
      delete outgoing['set-cookie'];
      if (outgoing.location?.startsWith(`http://localhost:${upstreamPort}`)) outgoing.location = outgoing.location.replace(`http://localhost:${upstreamPort}`, origin);
      res.writeHead(incoming.statusCode || 502, outgoing);
      incoming.pipe(res);
      incoming.on('error', () => res.destroy());
    });
    proxy.setTimeout(180_000, () => proxy.destroy());
    proxy.on('error', () => { if (!res.headersSent) fail(502, 'MediBill is unavailable. Start npm.cmd run dev on the PC.'); else res.destroy(); });
    req.on('aborted', () => proxy.destroy());
    res.on('close', () => proxy.destroy());
    req.pipe(proxy);
  });
  server.on('upgrade', (_req, socket) => { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); });
  server.on('close', () => clearInterval(timer));
  return server;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--credentials')) {
    let password = '';
    for await (const chunk of process.stdin) password += chunk;
    password = Buffer.from(password.trim(), 'base64').toString('utf8');
    if (password.length < 12 || password.length > 512) throw new Error('Use a password of 12 to 512 characters.');
    const salt = randomBytes(32).toString('hex');
    writeFileSync(credentialFile, JSON.stringify({ salt, hash: scryptSync(password, salt, 64).toString('hex') }), { mode: 0o600, flag: 'wx' });
    password = '';
  } else {
    const ips = Object.values(networkInterfaces()).flat().filter(x => x.family === 'IPv4' && !x.internal && privateAddress(x.address)).map(x => x.address);
    const hosts = new Set(['localhost', '127.0.0.1', ...ips]);
    const server = createGateway({ credential: JSON.parse(readFileSync(credentialFile, 'utf8')), tls: { pfx: readFileSync(new URL('server.pfx', privateDir)), passphrase: readFileSync(new URL('tls-password.txt', privateDir), 'utf8') }, hosts });
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    server.listen(5443, '0.0.0.0', () => {
      console.log('MediBill private HTTPS gateway. Sessions expire after 8 hours or a restart.');
      for (const ip of ips) console.log(`Mobile URL: https://${ip}:5443`);
      console.log('Use trusted Wi-Fi only. No router port forwarding. Self-signed certificate warning expected.');
    });
  }
}
