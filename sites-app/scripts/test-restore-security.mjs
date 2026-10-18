import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { getTableColumns } from 'drizzle-orm';
import { Miniflare } from 'miniflare';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=fs.mkdtempSync(root+'.restore-test-');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],compatibilityDate:'2026-05-22'});
try {
 for(const [src,out] of [['db/schema.ts','schema.mjs'],['lib/restore-security.ts','security.mjs']]) {
  const text=fs.readFileSync(root+src,'utf8').replace('"../db/schema"','"./schema.mjs"');
  fs.writeFileSync(temp+'/'+out,ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
 }
 const {restoreTables,validateRestoreSnapshot:validate,requireRestoreAdmin}=await import(pathToFileURL(temp+'/security.mjs'));
 const fresh=()=>({version:2,format:'medibill-pro-backup',tenantId:'A',createdAt:'2026-10-03T00:00:00Z',...Object.fromEntries(Object.keys(restoreTables).map(k=>[k,[]]))});
 const row=(name,id)=>Object.fromEntries(Object.entries(getTableColumns(restoreTables[name])).filter(([k,c])=>c.notNull&&!c.hasDefault||k==='id').map(([k,c])=>[k,k==='id'?id:k==='tenantId'?'A':c.dataType==='number'?0:c.dataType==='boolean'?false:'example']));
 for(const role of ['admin','super_admin'])assert.doesNotThrow(()=>requireRestoreAdmin({role,status:'active'}));
 for(const m of [null,{role:'staff',status:'active'},{role:'admin',status:'pending_approval'}])assert.throws(()=>requireRestoreAdmin(m),/RESTORE_FORBIDDEN/);
 assert.equal(validate(fresh(),'A').tenantId,'A');
 const valid=fresh();valid.customers=[row('customers','C')];valid.productMasters=[row('productMasters','M')];valid.products=[{...row('products','P'),productMasterId:'M'}];assert.doesNotThrow(()=>validate(valid,'A'));
 for(const mutate of [x=>x.tenantId='B',x=>x.products[0].tenantId='B',x=>x.products[0].productMasterId='foreign',x=>x.products.push({...x.products[0]}),x=>x.products[0].unknown='oops',x=>x.products[0].stock=-1,x=>x.products[0].stock='5',x=>x.products[0].purchaseRate=Infinity,x=>x.products[0].name=null,x=>x.productMasters[0].isScheduleH1='false',x=>x.createdAt='bad',x=>x.version=3,x=>x.agencyProfiles=[{tenantId:'B'}],x=>x.products[0].stock=0.5]) {
  const x=structuredClone(valid);mutate(x);assert.throws(()=>validate(x,'A'));
 }
 const legacy=structuredClone(valid);legacy.version=1;delete legacy.format;assert.doesNotThrow(()=>validate(legacy,'A'));
 const DB=await mf.getD1Database('DB');
 await DB.prepare('CREATE TABLE users(id TEXT,tenant_id TEXT,status TEXT,role TEXT)').run();
 await DB.prepare('CREATE TABLE audit_logs(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL)').run();
 await DB.prepare('CREATE TABLE stock(tenant_id TEXT,quantity INTEGER)').run();
 await DB.prepare("INSERT INTO users VALUES('U','A','active','admin')").run();
 await DB.prepare("INSERT INTO stock VALUES('A',12),('B',99)").run();
 const guard=()=>DB.prepare("INSERT INTO audit_logs VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=? AND tenant_id=? AND status='active' AND role IN ('admin','super_admin')) THEN ? ELSE NULL END)").bind(crypto.randomUUID(),'U','A',Date.now());
 await DB.batch([guard(),DB.prepare("UPDATE stock SET quantity=7 WHERE tenant_id='A'")]);
 assert.equal((await DB.prepare("SELECT quantity FROM stock WHERE tenant_id='B'").first()).quantity,99);
 await DB.prepare("UPDATE users SET role='staff'").run();
 await assert.rejects(DB.batch([DB.prepare("UPDATE stock SET quantity=0 WHERE tenant_id='A'"),guard()]));
 assert.equal((await DB.prepare("SELECT quantity FROM stock WHERE tenant_id='A'").first()).quantity,7);
 console.log('Restore validation, role gates, tenant isolation and D1 atomic revocation rollback passed.');
} finally {await mf.dispose();fs.rmSync(temp,{recursive:true,force:true});}
