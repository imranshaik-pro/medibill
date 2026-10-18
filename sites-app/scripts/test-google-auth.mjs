import fs from 'node:fs';
import ts from 'typescript';
import {Miniflare} from 'miniflare';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const temporary=fs.mkdtempSync(os.tmpdir()+'/medibill-auth-');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],compatibilityDate:'2026-05-22'});
try {
const DB=await mf.getD1Database('DB');
await DB.prepare('CREATE TABLE users(id TEXT PRIMARY KEY)').run();
for(const sql of fs.readFileSync(root+'drizzle/0017_google_auth.sql','utf8').split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
globalThis.__authEnv={DB,GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'private-test-secret',AUTH_BASE_URL:'http://127.0.0.1:5173'};

function build(src,out){let s=fs.readFileSync(root+src,'utf8').replace('import { env } from "cloudflare:workers";','const env=globalThis.__authEnv;').replace('"@/lib/google-auth"','"./auth.mjs"');fs.writeFileSync(temporary+'/'+out,ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);}
build('lib/google-auth.ts','auth.mjs');build('app/api/auth/google/start/route.ts','start.mjs');build('app/api/auth/google/callback/route.ts','callback.mjs');build('app/api/auth/logout/route.ts','logout.mjs');
const auth=await import(pathToFileURL(temporary+'/auth.mjs').href),start=await import(pathToFileURL(temporary+'/start.mjs').href),callback=await import(pathToFileURL(temporary+'/callback.mjs').href),logout=await import(pathToFileURL(temporary+'/logout.mjs').href);
assert.equal(auth.safeReturn('//evil.test'),'/');assert.equal(auth.safeReturn('/\\evil.test'),'/');assert.equal(auth.safeReturn('/api/auth/logout'),'/');
let r=await start.GET(new Request('http://127.0.0.1:5173/api/auth/google/start?return_to=%2F'));
assert.equal(r.status,302);const url=new URL(r.headers.get('location')),state=url.searchParams.get('state');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
let fetchCalls=0;globalThis.fetch=async(url)=>{fetchCalls++;return Response.json(url.includes('/token')?{access_token:'test-access-token',token_type:'Bearer'}:{sub:'123456',email:'irshad4281@gmail.com',email_verified:true,name:'Irshad'});};
const req=()=>new Request('http://127.0.0.1:5173/api/auth/google/callback?state='+state+'&code=test',{headers:{cookie:'medibill_oauth='+state}});
r=await callback.GET(new Request(req().url));assert.equal(r.status,401);assert.equal(fetchCalls,0);
r=await callback.GET(req());assert.equal(r.status,302);assert.equal(fetchCalls,2);const cookies=r.headers.get('set-cookie'),session=/medibill_session=([a-f0-9]+)/.exec(cookies)[1];assert(cookies.includes('HttpOnly'));assert(cookies.includes('SameSite=Lax'));
assert.equal((await auth.sessionUser('medibill_session='+session)).userId,'google:123456');assert.equal(await auth.sessionUser('medibill_session=invalid'),null);
r=await callback.GET(req());assert.equal(r.status,401);assert.equal(fetchCalls,2);
await DB.prepare("INSERT INTO users VALUES('existing-admin')").run();await DB.prepare('INSERT INTO auth_identity_links VALUES(?,?,?)').bind('123456','existing-admin',Date.now()).run();assert.equal((await auth.sessionUser('medibill_session='+session)).userId,'existing-admin');
r=await logout.POST(new Request('http://127.0.0.1:5173/api/auth/logout',{method:'POST',headers:{origin:'https://evil.test',cookie:'medibill_session='+session}}));assert.equal(r.status,403);
r=await logout.POST(new Request('http://127.0.0.1:5173/api/auth/logout',{method:'POST',headers:{origin:'http://127.0.0.1:5173',cookie:'medibill_session='+session}}));assert.equal(r.status,303);assert.equal(await auth.sessionUser('medibill_session='+session),null);

// Exercise the actual Workers fetch implementation, not only Node mocks.
// This guards against runtime-specific RequestInit incompatibilities.
const workerAuth = ts.transpileModule(fs.readFileSync(root+'lib/google-auth.ts','utf8').replace('import { env } from "cloudflare:workers";','const env = {};'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
let outboundCalls = 0;
const runtime = new Miniflare({modules:true,compatibilityDate:'2026-05-22',
  outboundService:async request => {
    outboundCalls++;
    const path = new URL(request.url).pathname;
    if(path === '/redirect') return new Response(null,{status:302,headers:{location:'https://untrusted.invalid/target'}});
    if(path === '/reject') return Response.json({error:'invalid_client',error_description:'DO_NOT_LOG_SECRET'},{status:401});
    return Response.json({ok:true});
  },
  script: workerAuth + `\nexport default {async fetch(request) {
    try {
      const result = await providerJson('https://oauth2.googleapis.com'+new URL(request.url).pathname,
        {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({test:'dummy'})});
      return Response.json(result);
    } catch(error) {
      return Response.json({reason:error.reason,status:error.status});
    }
  }}`
});
try {
  assert.deepEqual(await (await runtime.dispatchFetch('http://localhost/success')).json(),{ok:true});
  assert.deepEqual(await (await runtime.dispatchFetch('http://localhost/redirect')).json(),{reason:'unexpected_redirect',status:302});
  assert.equal(outboundCalls,2,'A redirect must never forward the token request');
  const rejected = await (await runtime.dispatchFetch('http://localhost/reject')).text();
  assert.equal(rejected.includes('DO_NOT_LOG_SECRET'),false);
  assert.deepEqual(JSON.parse(rejected),{reason:'invalid_client',status:401});
} finally {await runtime.dispose();}
console.log('PASS: actual Workers provider fetch, redirect rejection, and redacted provider errors');

console.log('PASS: Google OAuth state/cookie, PKCE, replay prevention, provider identity, explicit existing-user mapping, session cookies, revocation and logout CSRF on actual D1');
} finally {await mf.dispose();fs.rmSync(temporary,{recursive:true,force:true});delete globalThis.__authEnv;}
