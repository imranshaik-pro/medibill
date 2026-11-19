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
 for(const src of ['db/schema.ts','lib/stock-concurrency.ts','lib/product-master-sync.ts','lib/product-master-values.ts','lib/customer-update.ts','lib/restore-security.ts','lib/billing-catalog.ts','lib/billing-expiry.ts','lib/medibill.ts']) {
  let text=fs.readFileSync(root+src,'utf8');
  text=text.replace('import { env } from "cloudflare:workers";','const env=globalThis.__stockEnv;')
    .replace('import { getDb } from "@/db";','const getDb=()=>globalThis.__stockGetDb();')
    .replace('import { deleteInvoiceRecord, nextDocumentNumber } from "./invoice-deletion";','const nextDocumentNumber=globalThis.__stockNumber; const deleteInvoiceRecord=()=>{throw new Error("unused")};')
    .replaceAll('"@/db/schema"','"./schema.mjs"').replaceAll('"../db/schema"','"./schema.mjs"')
    .replaceAll('"./billing-catalog"','"./billing-catalog.mjs"')
    .replaceAll('"./billing-expiry"','"./billing-expiry.mjs"')
    .replaceAll('"./product-master-sync"','"./product-master-sync.mjs"').replaceAll('"./product-master-values"','"./product-master-values.mjs"')
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
 const withBatch=(id,qty)=>({...sale(qty),items:[{...sale(qty).items[0],productId:id}]});
 await DB.prepare("INSERT INTO products(id,tenant_id,product_master_id,name,batch,expiry,stock,physical_stock,purchase_rate,mrp,pack,created_at) VALUES('Z','A','M','Previous Label','BZ','2098-12',1,1,10,20,'1',0),('E','A','M','Medicine','BE','2020-01',4,4,10,20,'1',0),('L','A',NULL,'Medicine','BL','2098-12',3,3,10,20,'1',0)").run();
 const posted=await api.addInvoice('U',withBatch('Z',1));
 const postedLine=await DB.prepare("SELECT product_id,batch FROM invoice_lines WHERE invoice_id=?").bind(posted.id).first();
 assert.equal(postedLine.product_id,'Z');
 assert.equal(postedLine.batch,'BZ');
 assert.equal((await DB.prepare("SELECT stock FROM products WHERE id='Z'").first()).stock,0);
 await assert.rejects(api.addInvoice('U',withBatch('Z',1)),/only 0 available/);
 await assert.rejects(api.addInvoice('U',withBatch('E',1)),/expired/);
 await assert.rejects(api.addInvoice('U',withBatch('F',1)),/valid product and batch/);
 await api.updateSalesInvoice('U',posted.id,withBatch('Z',1));
 await DB.prepare("UPDATE products SET expiry='2020-01',stock=2,physical_stock=2 WHERE id='Z'").run();
 await api.updateSalesInvoice('U',posted.id,withBatch('Z',1));
 await assert.rejects(api.updateSalesInvoice('U',posted.id,withBatch('Z',2)),/expired/);
 assert.equal((await DB.prepare("SELECT stock FROM products WHERE id='Z'").first()).stock,2);
 assert.equal((await DB.prepare("SELECT quantity FROM invoice_lines WHERE invoice_id=?").bind(posted.id).first()).quantity,1);
 assert.equal((await DB.prepare("SELECT stock FROM products WHERE id='E'").first()).stock,4);
 await DB.prepare("UPDATE product_masters SET is_schedule_h1=1 WHERE id='M'").run();
 await assert.rejects(api.addInvoice('U',withBatch('L',1)),/Acknowledge/);
 await api.addInvoice('U',{
  ...withBatch('L',1),
  complianceAcknowledged:true,
  prescriptionDoctorName:'Fixture Doctor',
  prescriptionDoctorRegistration:'TEST-1',
 });
 assert.equal((await DB.prepare("SELECT stock FROM products WHERE id='L'").first()).stock,2);
 console.log('Billing catalog posting passed for explicit batch IDs, depleted and expired stock, historical edits and unlinked prescription warnings.');
 // Run pricing checks through both service entry points and compare persisted state.
 await DB.prepare("INSERT INTO product_masters(id,tenant_id,name,hsn,manufacturer,created_at) VALUES('RM','A','Fixture medicine','3004','Fixture maker',0),('FM','B','Fixture medicine','3004','Fixture maker',0)").run();
 await DB.prepare("INSERT INTO products(id,tenant_id,product_master_id,name,batch,expiry,stock,physical_stock,purchase_rate,mrp,pack,created_at) VALUES('RB','A','RM','Fixture medicine','R1','2098-12',20,20,10,100,'1',0),('RL','A',NULL,'Fixture medicine','R2','2098-12',20,20,10,100,'1',0)").run();
 const priced={
  ...withBatch('RB',2),
  items:[{productId:'RB',quantity:'2',freeQuantity:1,unitRate:'50.00',discountPercent:10,gstRate:18}],
  freightAmount:10,freightGstRate:5,insuranceAmount:5,insuranceGstRate:18,cashDiscount:5,cashDiscountType:'flat',
 };
 const savedPrice=await api.addInvoice('U',priced);
 const pricingState=async()=>({
  invoice:await DB.prepare("SELECT amount,igst,compliance_acknowledged FROM invoices WHERE id=?").bind(savedPrice.id).first(),
  line:await DB.prepare("SELECT id,unit_rate,discount_amount,taxable_amount,gst_amount,line_total FROM invoice_lines WHERE invoice_id=?").bind(savedPrice.id).first(),
  stock:await DB.prepare("SELECT id,stock,physical_stock FROM products WHERE id IN ('RB','RL') ORDER BY id").all(),
  invoiceCount:await DB.prepare("SELECT COUNT(*) AS total FROM invoices").first(),
  auditCount:await DB.prepare("SELECT COUNT(*) AS total FROM audit_logs").first(),
  balance:await DB.prepare("SELECT outstanding FROM customers WHERE id='C'").first(),
 });
 let state=await pricingState();
 assert.equal(state.invoice.amount,117);
 assert.equal(state.invoice.igst,16.76);
 for (const [key,value] of Object.entries({unit_rate:50,discount_amount:10,taxable_amount:90,gst_amount:16.2,line_total:106.2})) {
   assert.equal(state.line[key],value);
 }
 assert.equal(state.stock.results[0].stock,17);
 await api.updateSalesInvoice('U',savedPrice.id,priced);
 const editedPrice=await pricingState();
 assert.deepEqual(editedPrice.invoice,state.invoice);
 assert.deepEqual(editedPrice.stock.results,state.stock.results);
 assert.equal(editedPrice.line.line_total,state.line.line_total);
 state=editedPrice;
 const invalidLines=[
   ['unitRate',-1,/unit rate/],['unitRate',0,/unit rate/],['unitRate',Infinity,/unit rate/],
   ['unitRate',true,/unit rate/],['unitRate','0x50',/unit rate/],['unitRate','50foo',/unit rate/],
   ['discountPercent',-1,/discount percentage/],['discountPercent',100.1,/discount percentage/],
   ['discountPercent',' ',/discount percentage/],['gstRate',NaN,/GST rate/],
   ['gstRate',-1,/GST rate/],['gstRate',101,/GST rate/],['gstRate',null,/GST rate/],
   ['quantity',1.5,/billed quantity/],['quantity',0,/billed quantity/],
   ['quantity',Number.MAX_SAFE_INTEGER+1,/billed quantity/],['freeQuantity',-1,/free quantity/],
   ['freeQuantity',[],/free quantity/],['freeQuantity',0.5,/free quantity/],
 ];
 const invalidHeaders=[
  [{freightAmount:-1},/freight amount/],[{insuranceAmount:'bad'},/insurance amount/],
  [{freightGstRate:101},/freight GST rate/],[{insuranceGstRate:Infinity},/insurance GST rate/],
  [{cashDiscount:-1},/cash discount/],[{cashDiscount:101,cashDiscountType:'percent'},/cash discount/],
  [{cashDiscount:106},/subtotal/],[{cashDiscountType:'unsupported'},/cash discount type/],
 ];
 for (const [input,error] of [
   ...invalidLines.map(([field,value,error])=>[{...priced,items:[{...priced.items[0],[field]:value}]},error]),
   ...invalidHeaders.map(([values,error])=>[{...priced,...values},error]),
   [{...priced,items:[null]},/invoice item/],
 ]) {
   await assert.rejects(api.addInvoice('U',input),error);
   await assert.rejects(api.updateSalesInvoice('U',savedPrice.id,input),error);
 }
 const afterInvalid=await pricingState();
 assert.deepEqual({...afterInvalid,stock:afterInvalid.stock.results},{...state,stock:state.stock.results});
 console.log('PASS: create and edit validate pricing, discounts, GST, quantities and charges, with no side effects on rejection.');

 // Intercept only the atomic batch call so classification changes after preflight.
 function beforeCommit(action) {
   globalThis.__stockGetDb=()=>new Proxy(db,{get(target,key) {
     if (key==='batch') return async statements=>{await action();return db.batch(statements);};
     const value=Reflect.get(target,key,target);
     return typeof value==='function'?value.bind(target):value;
   }});
 }
 const stockChanged=/record changed while saving/;
 let waiting=0;
 let changeFlags;
 const gate=new Promise(resolve=>{changeFlags=resolve;});
 const gateTimeout=setTimeout(changeFlags,30_000);
 beforeCommit(async()=>{
   if (++waiting===2) {
     try {
       await DB.prepare("UPDATE product_masters SET is_schedule_h1=1 WHERE tenant_id='A' AND id='RM'").run();
     } finally { changeFlags(); }
   }
   await gate;
 });
 try {
   const races=await Promise.allSettled([api.addInvoice('U',priced),api.addInvoice('U',priced)]);
   assert.equal(waiting,2,JSON.stringify(races.map(result=>result.reason?.message ?? result.status)));
   for (const race of races) {
     assert.equal(race.status,'rejected');
     assert.match(race.reason.message,stockChanged);
   }
 } finally {clearTimeout(gateTimeout);globalThis.__stockGetDb=()=>db;}
 const afterRace=await pricingState();
 assert.deepEqual({...afterRace,stock:afterRace.stock.results},{...state,stock:state.stock.results});
 await assert.rejects(api.addInvoice('U',priced),/Acknowledge/);
 await assert.rejects(api.addInvoice('U',{...priced,complianceAcknowledged:'true'}),/Acknowledge/);
 await assert.rejects(api.addInvoice('U',{...priced,complianceAcknowledged:true}),/Doctor name/);
 const acknowledged={...priced,complianceAcknowledged:true,prescriptionDoctorName:'Fixture clinician',prescriptionDoctorRegistration:'FIXTURE-1'};
 await api.updateSalesInvoice('U',savedPrice.id,acknowledged);
 state=await pricingState();
 assert.equal(state.invoice.compliance_acknowledged,1);
 beforeCommit(()=>DB.prepare("UPDATE product_masters SET is_high_caution=1 WHERE tenant_id='A' AND id='RM'").run());
 try {
   await assert.rejects(api.updateSalesInvoice('U',savedPrice.id,acknowledged),stockChanged);
 } finally {globalThis.__stockGetDb=()=>db;}
 const afterEditRace=await pricingState();
 assert.deepEqual({...afterEditRace,stock:afterEditRace.stock.results},{...state,stock:state.stock.results});

 // A foreign flag cannot change a local legacy lookup. A local flag can.
 await DB.prepare("UPDATE product_masters SET is_schedule_h1=0,is_high_caution=0 WHERE id='RM'").run();
 const legacyPrice=withBatch('RL',1);
 beforeCommit(()=>DB.prepare("UPDATE product_masters SET is_prescription_required=1 WHERE tenant_id='B' AND id='FM'").run());
 try {
   const foreignChange=await api.addInvoice('U',legacyPrice);
   assert.equal(foreignChange.complianceAcknowledged,false);
 } finally {globalThis.__stockGetDb=()=>db;}
 beforeCommit(()=>DB.prepare("UPDATE product_masters SET is_prescription_required=1 WHERE tenant_id='A' AND id='RM'").run());
 try {
   await assert.rejects(api.addInvoice('U',legacyPrice),stockChanged);
 } finally {globalThis.__stockGetDb=()=>db;}
 await assert.rejects(api.addInvoice('U',legacyPrice),/Acknowledge/);
 console.log('PASS: commit rechecks prescription changes for concurrent sales, edits and legacy batches with tenant isolation.');

 console.log('Actual sales/purchase create-edit races, oversell rollback, balances, customer swaps, duplicate rows, stale adjustment, backup failure and tenant isolation passed.');
}finally{await mf.dispose();fs.rmSync(temp,{recursive:true,force:true});}
