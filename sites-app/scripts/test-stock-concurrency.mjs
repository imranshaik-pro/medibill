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
 // Isolate stock races from the separate, still-pending invoice-number allocator.
 let seq=0;globalThis.__stockNumber=async(_db,_tenant,_kind,prefix)=>prefix+String(++seq).padStart(4,'0');
 for(const src of ['db/schema.ts','lib/stock-concurrency.ts','lib/customer-update.ts','lib/restore-security.ts','lib/medibill.ts']) {
  let text=fs.readFileSync(root+src,'utf8');
  text=text.replace('import { env } from "cloudflare:workers";','const env=globalThis.__stockEnv;')
    .replace('import { getDb } from "@/db";','const getDb=globalThis.__stockGetDb;')
    .replace('import { deleteInvoiceRecord, nextDocumentNumber } from "./invoice-deletion";','const nextDocumentNumber=globalThis.__stockNumber; const deleteInvoiceRecord=()=>{throw new Error("unused")};')
    .replaceAll('"@/db/schema"','"./schema.mjs"').replaceAll('"../db/schema"','"./schema.mjs"')
    .replaceAll('"./stock-concurrency"','"./stock-concurrency.mjs"').replaceAll('"./customer-update"','"./customer-update.mjs"').replaceAll('"./restore-security"','"./restore-security.mjs"');
  fs.writeFileSync(temp+'/'+src.split('/').at(-1).replace('.ts','.mjs'),ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
 }
 const api=await import(pathToFileURL(temp+'/medibill.mjs'));
 const helper=await import(pathToFileURL(temp+'/stock-concurrency.mjs'));
 const schema=await import(pathToFileURL(temp+'/schema.mjs'));
 const sale=(qty,free=0,customerId='C')=>({customerId,items:[{productId:'P',quantity:qty,freeQuantity:free,unitRate:10,discountPercent:0,gstRate:0}],status:'Pending',paymentMode:'Credit'});
 const results=await Promise.allSettled([api.addInvoice('U',sale(3)),api.addInvoice('U',sale(3))]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.match(results.find(x=>x.status==='rejected').reason.message,/Stock changed|only .* available/);
 assert.equal((await DB.prepare("SELECT stock FROM products WHERE id='P'").first()).stock,2);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM invoices').first()).n,1);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM invoice_lines').first()).n,1);
 assert.equal((await DB.prepare("SELECT outstanding FROM customers WHERE id='C'").first()).outstanding,30);
 const saved=results.find(x=>x.status==='fulfilled').value;
 // Same-invoice concurrent edits: one succeeds and one is rejected as stale.
 const edits=await Promise.allSettled([api.updateSalesInvoice('U',saved.id,sale(2)),api.updateSalesInvoice('U',saved.id,sale(1))]);
 assert.equal(edits.filter(x=>x.status==='fulfilled').length,1);
 const line=await DB.prepare('SELECT quantity FROM invoice_lines').first();
 assert.equal((await DB.prepare("SELECT stock FROM products WHERE id='P'").first()).stock,5-line.quantity);
 assert.equal((await DB.prepare("SELECT outstanding FROM customers WHERE id='C'").first()).outstanding,line.quantity*10);
 await api.updateSalesInvoice('U',saved.id,sale(line.quantity,0,'C2'));
 assert.equal((await DB.prepare("SELECT outstanding FROM customers WHERE id='C'").first()).outstanding,0);
 assert.equal((await DB.prepare("SELECT outstanding FROM customers WHERE id='C2'").first()).outstanding,line.quantity*10);
 // Multiple rows for one batch cannot exceed its aggregate availability.
 await assert.rejects(api.addInvoice('U',{...sale(3),items:[...sale(3).items,...sale(3).items]}),/only .* available/);
 // Stale manual adjustment must not overwrite a committed sale.
 const observed=await db.select().from(schema.products).where(eq(schema.products.id,'P')).get();
 await api.addInvoice('U',sale(1));
 await assert.rejects(helper.commitStockBatch(db,{id:'U',tenantId:'A'},[db.update(schema.products).set({stock:50}).where(eq(schema.products.id,'P'))],[helper.snapshotUnchanged(schema.products,and(eq(schema.products.id,'P'),eq(schema.products.tenantId,'A')),[observed])]),/record changed/);

 const purchaseItem={serialNo:1,productName:'Medicine',pack:'1',manufacturer:'MFR',hsn:'3004',batch:'B1',expiry:'12/28',billedQuantity:3,freeQuantity:2,mrp:100,netRate:10,gstRate:0,gstAmount:0,lineTotal:30};
 const purchase={supplier:{name:'Supplier'},items:[purchaseItem],charges:[],summary:{subtotal:30,igst:0,cgst:0,sgst:0,roundOff:0,grandTotal:30},status:'Pending'};
 const beforePurchase=(await DB.prepare("SELECT stock FROM products WHERE id='P'").first()).stock;
 const inward=await Promise.all([api.addPurchaseInward('U',purchase),api.addPurchaseInward('U',purchase)]);
 assert.equal((await DB.prepare("SELECT stock FROM products WHERE id='P'").first()).stock,beforePurchase+10);
 assert.equal((await DB.prepare("SELECT outstanding FROM suppliers WHERE id='S'").first()).outstanding,60);
 const purchaseEdits=await Promise.allSettled([
  api.replacePurchaseInward('U',inward[0].id,{header:{},items:[{...purchaseItem,billedQuantity:4}],charges:[]}),
  api.replacePurchaseInward('U',inward[0].id,{header:{},items:[{...purchaseItem,billedQuantity:5}],charges:[]}),
 ]);
 assert.equal(purchaseEdits.filter(x=>x.status==='fulfilled').length,1);
 const purchased=(await DB.prepare('SELECT billed_quantity FROM purchase_inward_items WHERE inward_id=?').bind(inward[0].id).first()).billed_quantity;
 assert.equal((await DB.prepare("SELECT stock FROM products WHERE id='P'").first()).stock,beforePurchase+10+purchased-3);
 assert.equal((await DB.prepare("SELECT outstanding FROM suppliers WHERE id='S'").first()).outstanding,30+purchased*10);
 // A failed cloud snapshot after commit must not cause duplicate retry instructions.
 globalThis.__stockEnv.BUCKET={put:async()=>{throw new Error('synthetic unavailable storage')}};
 const logError=console.error;console.error=()=>{};
 try {await api.addInvoice('U',sale(1));} finally {console.error=logError;delete globalThis.__stockEnv.BUCKET;}
 assert.equal((await DB.prepare("SELECT stock FROM products WHERE id='F'").first()).stock,99);
 assert.throws(()=>helper.stockDelta(schema.products.stock,1.5),/whole units/);
 console.log('Actual sales/purchase create-edit races, oversell rollback, balances, customer swaps, duplicate rows, stale adjustment, backup failure and tenant isolation passed.');
}finally{await mf.dispose();fs.rmSync(temp,{recursive:true,force:true});}
