import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {drizzle} from 'drizzle-orm/d1';
import {eq,and} from 'drizzle-orm';
import {Miniflare} from 'miniflare';
const root=fileURLToPath(new URL('../',import.meta.url));const temp=fs.mkdtempSync(root+'.stock-test-');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],compatibilityDate:'2026-05-22'});
try {
 const DB=await mf.getD1Database('DB');
 for(const f of fs.readdirSync(root+'drizzle').filter(x=>x.endsWith('.sql')).sort())for(const sql of fs.readFileSync(root+'drizzle/'+f,'utf8').split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 for(const sql of ["INSERT INTO tenants VALUES('A','Agency',0),('B','Other',0)","INSERT INTO users(id,tenant_id,email,display_name,role,created_at,status) VALUES('U','A','u@test.invalid','Admin','super_admin',0,'active')", "INSERT INTO customers(id,tenant_id,name,phone,created_at) VALUES('C','A','Customer','9000000000',0),('C2','A','Second','9000000001',0)","INSERT INTO suppliers(id,tenant_id,name,phone,created_at) VALUES('S','A','Supplier','9000000000',0)","INSERT INTO product_masters(id,tenant_id,name,hsn,manufacturer,created_at) VALUES('M','A','Medicine','3004','MFR',0)","INSERT INTO products(id,tenant_id,product_master_id,name,batch,expiry,stock,physical_stock,purchase_rate,mrp,pack,created_at) VALUES('P','A','M','Medicine','B1','2028-12',5,5,10,100,'1',0),('F','B',NULL,'Foreign','B2','2028-12',99,99,10,100,'1',0)"])await DB.prepare(sql).run();
 const db=drizzle(DB);
 globalThis.__stockEnv={DB};globalThis.__stockGetDb=()=>db;

 for(const src of ['db/schema.ts','lib/stock-concurrency.ts','lib/customer-update.ts','lib/restore-security.ts','lib/medibill.ts','lib/invoice-deletion.ts','lib/document-safety.ts']) {
  let text=fs.readFileSync(root+src,'utf8');
  text=text.replace('import { env } from "cloudflare:workers";','const env=globalThis.__stockEnv;')
    .replace('import { getDb } from "@/db";','const getDb=globalThis.__stockGetDb;')
    .replaceAll('"./invoice-deletion"','"./invoice-deletion.mjs"')
    .replaceAll('"@/db/schema"','"./schema.mjs"').replaceAll('"../db/schema"','"./schema.mjs"')
    .replaceAll('"./stock-concurrency"','"./stock-concurrency.mjs"').replaceAll('"./customer-update"','"./customer-update.mjs"').replaceAll('"./restore-security"','"./restore-security.mjs"');
  fs.writeFileSync(temp+'/'+src.split('/').at(-1).replace('.ts','.mjs'),ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
 }
 const api=await import(pathToFileURL(temp+'/medibill.mjs'));
 const helper=await import(pathToFileURL(temp+'/stock-concurrency.mjs'));
 const schema=await import(pathToFileURL(temp+'/schema.mjs'));


 await DB.prepare("UPDATE products SET stock=100,physical_stock=100 WHERE id='P'").run();
 const sale=(quantity=10,freeQuantity=2,extra={})=>({customerId:'C',items:[{productId:'P',quantity,freeQuantity,unitRate:10,discountPercent:0,gstRate:0}],status:'Pending',paymentMode:'Credit',...extra});
 const saved=await api.addInvoice('U',sale());
 const stock=async()=>await DB.prepare("SELECT stock,physical_stock FROM products WHERE id='P'").first();
 assert.deepEqual(await stock(),{stock:88,physical_stock:88});
 let detail=await api.getSalesInvoice('U',saved.id);
 assert.equal(detail.editProducts[0].stock,88);assert.equal(detail.revision.length,64);
 const originalRevision=detail.revision;
 // Header-only edit, then identical/repeated edit, must not issue stock again.
 detail=await api.updateSalesInvoice('U',saved.id,sale(10,2,{transportName:'Updated transport',expectedRevision:detail.revision}));
 assert.deepEqual(await stock(),{stock:88,physical_stock:88});
 await assert.rejects(api.updateSalesInvoice('U',saved.id,sale(10,2,{expectedRevision:originalRevision})),api.InvoiceEditConflict);
 assert.deepEqual(await stock(),{stock:88,physical_stock:88});
 detail=await api.updateSalesInvoice('U',saved.id,sale(10,2,{expectedRevision:detail.revision}));
 assert.deepEqual(await stock(),{stock:88,physical_stock:88});
 detail=await api.updateSalesInvoice('U',saved.id,sale(14,2,{expectedRevision:detail.revision}));
 assert.deepEqual(await stock(),{stock:84,physical_stock:84});
 detail=await api.updateSalesInvoice('U',saved.id,sale(8,1,{expectedRevision:detail.revision}));
 assert.deepEqual(await stock(),{stock:91,physical_stock:91});
 // Rate-only changes affect accounts, not quantities.
 const changed=sale(8,1,{expectedRevision:detail.revision});changed.items[0].unitRate=15;
 detail=await api.updateSalesInvoice('U',saved.id,changed);
 assert.deepEqual(await stock(),{stock:91,physical_stock:91});
 // Two lines sharing a batch reconcile their combined billed + free units.
 const duplicate=sale(4,1,{expectedRevision:detail.revision});duplicate.items.push({...duplicate.items[0],quantity:3,freeQuantity:1});
 detail=await api.updateSalesInvoice('U',saved.id,duplicate);
 assert.deepEqual(await stock(),{stock:91,physical_stock:91});
 await DB.prepare("INSERT INTO products(id,tenant_id,product_master_id,name,batch,expiry,stock,physical_stock,purchase_rate,mrp,pack,created_at) VALUES('Q','A','M','Medicine','B2','2028-12',50,50,10,100,'1',0)").run();
 const swap=sale(5,1,{expectedRevision:detail.revision});swap.items[0].productId='Q';
 detail=await api.updateSalesInvoice('U',saved.id,swap);
 assert.deepEqual(await stock(),{stock:100,physical_stock:100});
 assert.deepEqual(await DB.prepare("SELECT stock,physical_stock FROM products WHERE id='Q'").first(),{stock:44,physical_stock:44});
 const before=detail.revision;
 await assert.rejects(api.updateSalesInvoice('U',saved.id,{...swap,expectedRevision:before,items:[{...swap.items[0],quantity:60}]}),/cannot bill/);
 assert.equal((await api.getSalesInvoice('U',saved.id)).revision,before);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM invoices').first()).n,1);
 assert.equal((await DB.prepare("SELECT stock FROM products WHERE id='F'").first()).stock,99);
 // Exercise the real HTTP route adapter with authenticated identity/response shims.
 fs.writeFileSync(temp+'/response.mjs','export const NextResponse={json:(body,init)=>Response.json(body,init)};');
 fs.writeFileSync(temp+'/auth.mjs','export async function getChatGPTUser(){return {userId:"U"}}');
 let route=fs.readFileSync(root+'app/api/invoices/[id]/route.ts','utf8')
   .replaceAll('"@/lib/medibill"','"./medibill.mjs"').replaceAll('"@/lib/invoice-deletion"','"./invoice-deletion.mjs"')
   .replaceAll('"@/app/chatgpt-auth"','"./auth.mjs"').replaceAll('"next/server"','"./response.mjs"');
 fs.writeFileSync(temp+'/route.mjs',ts.transpileModule(route,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
 const http=await import(pathToFileURL(temp+'/route.mjs'));
 const ctx={params:Promise.resolve({id:saved.id})};
 const patch=body=>http.PATCH(new Request('http://localhost/api/invoices/'+saved.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),ctx);
 assert.equal((await patch(swap)).status,409,'old edit revision is rejected by HTTP');
 const {expectedRevision,...withoutVersion}=swap;
 assert.equal((await patch(withoutVersion)).status,409,'missing revision requires refresh');
 const latest=await (await http.GET(new Request('http://localhost'),ctx)).json();
 const request={...swap,expectedRevision:latest.revision};
 assert.equal((await patch(request)).status,200);
 assert.equal((await patch(request)).status,409,'same PATCH retry cannot issue stock twice');
 assert.deepEqual(await DB.prepare("SELECT stock,physical_stock FROM products WHERE id='Q'").first(),{stock:44,physical_stock:44});
 console.log('PASS: actual HTTP GET/PATCH version propagation, missing/stale rejection and repeated-request stock invariance');
 console.log('PASS: actual D1 edit delta math: unchanged/repeat/header/rate=0; quantity/free changes=difference; duplicate batches, batch swaps, stale-version rejection, shortage rollback, one invoice and tenant isolation');
}finally{await mf.dispose();fs.rmSync(temp,{recursive:true,force:true});}
