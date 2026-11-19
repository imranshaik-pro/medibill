import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { Miniflare } from 'miniflare';
import { productMasters } from '../db/schema.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(root + '.product-integration-test-');
const mf = new Miniflare({ modules:true, script:'export default {fetch(){return new Response("ok")}}',
  d1Databases:['DB'], compatibilityDate:'2026-05-22' });
const originalError = console.error;
try {
 const DB = await mf.getD1Database('DB');
 for (const name of fs.readdirSync(root+'drizzle').filter(x=>x.endsWith('.sql')).sort())
  for (const text of fs.readFileSync(root+'drizzle/'+name,'utf8').split(';').filter(x=>x.trim())) await DB.prepare(text).run();
 for (const sql of [
  "INSERT INTO tenants VALUES('A','Agency',0),('B','Other',0)",
  "INSERT INTO users(id,tenant_id,email,display_name,role,created_at,status) VALUES('U','A','u@test.invalid','Admin','super_admin',0,'active'),('V','A','v@test.invalid','Staff','staff',0,'active'),('F','B','f@test.invalid','Other','staff',0,'active')",
  "INSERT INTO product_masters(id,tenant_id,name,hsn,manufacturer,created_at) VALUES('M','A','Medicine','3004','Maker',0),('D','A','Duplicate','3004','Maker',0),('F','B','Medicine','3004','Other',0),('EMPTY','A','Unused','3004','Maker',0)",
  "INSERT INTO products(id,tenant_id,product_master_id,name,batch,stock,physical_stock,expiry,pack,purchase_rate,mrp,sale_rate,created_at) VALUES('P','A','M','Medicine','B1',10,100,'2028-12','10 tablets',20,30,25,0),('P2','A','M','Medicine','B2',12,120,'2029-12','10 tablets',22,32,27,0),('UNLINKED','A',NULL,'Medicine','U1',8,8,'2029-12','1',10,20,15,0),('FOREIGN','B','F','Medicine','B1',99,99,'2029-12','1',10,20,15,0)",
  "INSERT INTO customers(id,tenant_id,name,phone,created_at) VALUES('C','A','Buyer','',0)",
  "INSERT INTO invoices(id,tenant_id,invoice_no,customer_id,customer_name,amount,invoice_date,created_at) VALUES('I','A','INV1','C','Buyer',25,'2026-01-01',0)",
  "INSERT INTO invoice_lines(id,tenant_id,invoice_id,customer_id,product_id,product_name,batch,manufacturer,hsn,quantity,unit_rate,taxable_amount,gst_amount,line_total,created_at) VALUES('IL','A','I','C','P','Medicine','B1','Historical Maker','3004',1,25,25,0,25,0)",
 ]) await DB.prepare(sql).run();
 const orm = drizzle(DB);
 globalThis.__productEnv = {DB}; globalThis.__productOrm = orm; globalThis.__productUser = {userId:'U'};
 const context = {name:'isolated-product-context',setup(b){
  b.onResolve({filter:/^(cloudflare:workers|@\/db|@\/app\/chatgpt-auth|next\/server)$/},args=>({path:args.path,namespace:'context'}));
  b.onLoad({filter:/.*/,namespace:'context'},args=>({contents:({
   'cloudflare:workers':'export const env=globalThis.__productEnv;',
   '@/db':'export const getDb=()=>globalThis.__productOrm;',
   '@/app/chatgpt-auth':'export const getChatGPTUser=async()=>globalThis.__productUser;',
   'next/server':'export const NextResponse=Response;',
  })[args.path],loader:'js'}));
 }};
 async function bundle(entry,out){await build({entryPoints:[root+entry],outfile:temp+'/'+out,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[context]});return import(pathToFileURL(temp+'/'+out));}
 const api = await bundle('lib/medibill.ts','medibill.mjs');
 const {PATCH,DELETE} = await bundle('app/api/products/[id]/route.ts','route.mjs');
 const {productMasterSnapshot} = await bundle('lib/product-master-values.ts','values.mjs');
 const all = async table=>(await DB.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results;
 const master = async(id='M')=>(await orm.select().from(productMasters).where(eq(productMasters.id,id)).limit(1))[0];
 const input = async(changes={},id='M')=>{const original=productMasterSnapshot(await master(id));return {...original,...changes,original};};
 const state = async()=>({master:await master(),products:await all('products'),audit:await all('audit_logs')});
 const history = {invoices:await all('invoices'),lines:await all('invoice_lines')};
 const before = await all('products');
 const saved = await api.updateProductMaster('U','M',await input({name:'Renamed',manufacturer:'New Maker',defaultPack:'20 tablets',hsn:'300490',defaultGstRate:12}));
 assert.equal(saved.name,'Renamed'); assert.equal(saved.defaultGstRate,12);
 const after = await all('products');
 for(const old of before){const row=after.find(x=>x.id===old.id);assert.deepEqual(row,old.product_master_id==='M'?{...old,name:'Renamed',manufacturer:'New Maker',hsn:'300490'}:old);}
 assert.equal((await all('audit_logs')).filter(x=>x.action==='product_master.updated').length,1);
 console.log('PASS: integrated update synchronizes linked metadata only, preserving quantities, pack, expiry, rates, unlinked rows, tenant data and audit');

 await assert.rejects(api.updateProductMaster('F','M',await input()),e=>e.status===404);
 await assert.rejects(api.updateProductMaster('missing','M',await input()),e=>e.status===403);
 const valid = await input();
 for(const value of [-1,101,NaN,Infinity,'5',null,'']) await assert.rejects(api.updateProductMaster('U','M',{...valid,defaultGstRate:value}),e=>e.status===400);
 for(const patch of [{name:''},{manufacturer:''},{name:5},{composition:[]},{isScheduleH1:'false'},{isHighCaution:true,cautionNotes:''},{isScheduleH1:true,cautionNotes:'x'.repeat(281)}])
  await assert.rejects(api.updateProductMaster('U','M',{...valid,...patch}),e=>e.status===400);
 await assert.rejects(api.updateProductMaster('U','M',{...valid,original:undefined}),e=>e.status===409);
 await assert.rejects(api.updateProductMaster('U','M',{...valid,original:{name:'Renamed'}}),e=>e.status===400);
 await assert.rejects(api.updateProductMaster('U','M',{...valid,name:'Duplicate'}),e=>e.status===409 && e.code==='PRODUCT_NAME_CONFLICT');
 await DB.prepare("INSERT INTO products(id,tenant_id,name,batch,stock,expiry,purchase_rate,mrp,created_at) VALUES('COLLISION','A','Conflict','B1',1,'2029-12',10,20,0)").run();
 await assert.rejects(api.updateProductMaster('U','M',{...valid,name:'Conflict'}),e=>e.status===409 && e.code==='PRODUCT_BATCH_CONFLICT');
 const flagged=await api.updateProductMaster('V','M',await input({isScheduleH1:true,isPrescriptionRequired:false,cautionNotes:'Dispense against prescription.'}));
 assert.equal(flagged.isPrescriptionRequired,true); assert.equal(flagged.isScheduleH1,true);
 console.log('PASS: membership, tenant, required-field, GST, original-snapshot, duplicate and medicine caution validation; Schedule H1 forces prescription');

 const shared = await input(); const priorAudits=(await all('audit_logs')).length;
 const concurrent=await Promise.allSettled([api.updateProductMaster('U','M',{...shared,composition:'User one'}),api.updateProductMaster('V','M',{...shared,composition:'User two'})]);
 assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(concurrent.find(x=>x.status==='rejected').reason.status,409);
 assert.equal((await all('audit_logs')).length,priorAudits+1);
 await assert.rejects(api.updateProductMaster('V','M',{...shared,composition:'Old form'}),e=>e.status===409);
 async function duringCommit(change,operation){
  let fired=false;
  globalThis.__productOrm=new Proxy(orm,{get(target,key){if(key==='batch')return async statements=>{if(!fired){fired=true;await change();}return target.batch(statements);};return Reflect.get(target,key);}});
  try{return await operation();}finally{globalThis.__productOrm=orm;}
 }
 for(const change of ["UPDATE users SET status='revoked' WHERE id='U'","UPDATE users SET tenant_id='B' WHERE id='U'"]){
  const original=await input({composition:'Blocked'}),prior=await state();
  await assert.rejects(duringCommit(()=>DB.prepare(change).run(),()=>api.updateProductMaster('U','M',original)),e=>e.status===403);
  assert.deepEqual(await state(),prior);
  await DB.prepare("UPDATE users SET tenant_id='A',status='active' WHERE id='U'").run();
 }
 const old=await input({composition:'Stale at commit'});
 await assert.rejects(duringCommit(()=>DB.prepare("UPDATE product_masters SET composition='Other committed edit' WHERE id='M'").run(),()=>api.updateProductMaster('U','M',old)),e=>e.status===409);
 assert.equal((await master()).composition,'Other committed edit');
 const stockInput=await input({hsn:'NEW-HSN'});
 await duringCommit(()=>DB.prepare("UPDATE products SET stock=stock-1,physical_stock=physical_stock-10 WHERE id='P'").run(),()=>api.updateProductMaster('U','M',stockInput));
 assert.equal((await DB.prepare("SELECT stock FROM products WHERE id='P'").first()).stock,9);
 assert.equal((await DB.prepare("SELECT physical_stock FROM products WHERE id='P'").first()).physical_stock,90);
 console.log('PASS: two simultaneous editors, stale browser snapshots, commit-time membership revocation/tenant move and concurrent stock preservation');

 // An actual audit trigger aborts every write in the D1 batch.
 await DB.prepare("CREATE TRIGGER fail_master_audit BEFORE INSERT ON audit_logs WHEN NEW.action='product_master.updated' BEGIN SELECT RAISE(ABORT,'simulated audit failure'); END").run();
 const rollbackBefore=await state();
 await assert.rejects(api.updateProductMaster('U','M',await input({name:'Must roll back'})));
 assert.deepEqual(await state(),rollbackBefore);
 await DB.prepare('DROP TRIGGER fail_master_audit').run();
 // Real uniqueness conflicts created after preflight must be decoded from nested D1 causes.
 const conflictInput=await input({name:'Concurrent duplicate'}),conflictState=await state();
 await assert.rejects(duringCommit(()=>DB.prepare("INSERT INTO product_masters(id,tenant_id,name,hsn,manufacturer,created_at) VALUES('RACE','A','Concurrent duplicate','3004','Maker',0)").run(),()=>api.updateProductMaster('U','M',conflictInput)),e=>e.status===409 && e.code==='PRODUCT_NAME_CONFLICT');
 assert.deepEqual(await state(),conflictState);
 const batchInput=await input({name:'Concurrent batch'}),batchState=await state();
 await assert.rejects(duringCommit(()=>DB.prepare("INSERT INTO products(id,tenant_id,name,batch,stock,expiry,purchase_rate,mrp,created_at) VALUES('RACEB','A','Concurrent batch','B1',1,'2029-12',10,20,0)").run(),()=>api.updateProductMaster('U','M',batchInput)),e=>e.status===409 && e.code==='PRODUCT_BATCH_CONFLICT');
 assert.deepEqual(await master(),batchState.master);
 assert.deepEqual(await all('audit_logs'),batchState.audit);
 console.log('PASS: audit-failure atomic rollback and nested D1 uniqueness errors from concurrent master/batch creation');

 const invoke=async(body,id='M',method=PATCH)=>method(new Request('https://example.invalid/api/products/'+id,{method:method===DELETE?'DELETE':'PATCH',headers:{'content-type':'application/json'},...(method===DELETE?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}),{params:Promise.resolve({id})});
 globalThis.__productUser=null;assert.equal((await invoke(await input())).status,401);
 globalThis.__productUser={userId:'missing'};assert.equal((await invoke(await input())).status,403);
 globalThis.__productUser={userId:'U'};
 assert.equal((await invoke(await input(),'F')).status,404);
 assert.equal((await invoke('invalid json')).status,400);
 assert.equal((await invoke([])).status,400);
 assert.equal((await invoke({...await input(),defaultGstRate:101})).status,400);
 assert.equal((await invoke({...await input(),name:'Duplicate'})).status,409);
 assert.equal((await invoke({...shared,name:'Stale'})).status,409);
 console.error=()=>{};
 const httpBefore=await state();
 await DB.prepare("CREATE TRIGGER fail_http_audit BEFORE INSERT ON audit_logs WHEN NEW.action='product_master.updated' BEGIN SELECT RAISE(ABORT,'private diagnostic'); END").run();
 const errorResponse=await invoke(await input({name:'Fail HTTP'}));assert.equal(errorResponse.status,500);assert(!(await errorResponse.text()).includes('private diagnostic'));assert.deepEqual(await state(),httpBefore);
 await DB.prepare('DROP TRIGGER fail_http_audit').run();
 globalThis.__productEnv.BUCKET={put:async()=>{throw Error('synthetic backup unavailable');}};
 const backupResponse=await invoke(await input({marketedBy:'Persist despite backup failure'}));
 assert.equal(backupResponse.status,200);const result=await backupResponse.json();assert(result.backupWarning);assert.equal((await master()).marketedBy,'Persist despite backup failure');
 assert.equal(result.tenantId,'A'); assert.equal(result.id,'M');assert.equal(result.stock,undefined);
 let snapshotBody;
 globalThis.__productEnv.BUCKET={put:async(key,body)=>{assert.equal(key,'backups/A/latest.json');snapshotBody=JSON.parse(body);}};
 const success=await invoke(await input({composition:'Final composition'}));assert.equal(success.status,200);assert.equal((await success.json()).backupWarning,undefined);
 assert(snapshotBody.productMasters.some(row=>row.id==='M' && row.composition==='Final composition'));
 delete globalThis.__productEnv.BUCKET;
 assert.deepEqual(await all('invoices'),history.invoices);assert.deepEqual(await all('invoice_lines'),history.lines);
 // DELETE keeps its existing authentication, role, linked-history and success behavior.
 globalThis.__productUser=null;assert.equal((await invoke({},'EMPTY',DELETE)).status,401);
 globalThis.__productUser={userId:'V'};assert.equal((await invoke({},'EMPTY',DELETE)).status,403);
 globalThis.__productUser={userId:'U'};assert.equal((await invoke({},'M',DELETE)).status,409);
 assert.equal((await invoke({},'EMPTY',DELETE)).status,200);
 assert.equal((await DB.prepare('PRAGMA quick_check').first()).quick_check,'ok');
 assert.equal((await DB.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 console.log('PASS: actual PATCH statuses 200/400/401/403/404/409/500, safe backup failure response, successful backup, historical invoices and DELETE regression checks');
}finally{
 console.error=originalError;
 await mf.dispose();fs.rmSync(temp,{recursive:true,force:true});
}
