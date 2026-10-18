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

 const {runDocumentRequest}=await import(pathToFileURL(temp+'/document-safety.mjs'));
 const {nextDocumentNumber}=await import(pathToFileURL(temp+'/invoice-deletion.mjs'));
 const member={id:'U',tenantId:'A',status:'active'};
 const key=()=>crypto.randomUUID();
 const sale={customerId:'C',items:[{productId:'P',quantity:1,freeQuantity:0,unitRate:10,discountPercent:0,gstRate:0}],status:'Pending',paymentMode:'Credit'};
 const submit=(k,input=sale)=>runDocumentRequest(DB,member,'sale',k,input,op=>api.addInvoice('U',input,op));
 const k=key();
 const simultaneous=await Promise.all([submit(k),submit(k)]);
 assert.equal(simultaneous[0].id,simultaneous[1].id);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM invoices').first()).n,1);
 assert.equal((await DB.prepare("SELECT stock FROM products WHERE id='P'").first()).stock,4);
 assert.equal((await DB.prepare("SELECT outstanding FROM customers WHERE id='C'").first()).outstanding,10);
 assert.equal((await submit(k)).id,simultaneous[0].id);
 await assert.rejects(submit(k,{...sale,status:'Paid'}),/different details/);
 await assert.rejects(submit('short'),/Idempotency-Key/);
 await assert.rejects(runDocumentRequest(DB,{...member,status:'inactive'},'sale',key(),sale,()=>null),/membership/);
 // Independent saves use the real number allocator and each deduct stock once.
 const distinct=await Promise.all([submit(key()),submit(key())]);
 assert.notEqual(distinct[0].invoiceNo,distinct[1].invoiceNo);
 assert.equal((await DB.prepare("SELECT stock FROM products WHERE id='P'").first()).stock,2);
 // Failed stock transaction does not leave a successful-save receipt.
 const failed=key();const excessive={...sale,items:[{...sale.items[0],quantity:3}]};
 await assert.rejects(submit(failed,excessive),/available|Stock changed/);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM document_requests WHERE request_key=?').bind(failed).first()).n,0);
 const prefix='INV-99-';
 await DB.prepare("INSERT INTO audit_logs(id,tenant_id,user_id,action,details,created_at) VALUES('old','A','U','sale.deleted',?,0)").bind(JSON.stringify({header:{invoice_no:prefix+'0041'}})).run();
 const numbers=await Promise.all(Array.from({length:20},()=>nextDocumentNumber(DB,'A','sale',prefix)));
 assert.equal(new Set(numbers).size,20);assert.equal(Math.min(...numbers.map(n=>Number(n.slice(prefix.length)))),42);
 assert.equal(await nextDocumentNumber(DB,'B','sale',prefix),prefix+'0001');
 await DB.prepare("UPDATE invoices SET invoice_no=? WHERE id=?").bind(prefix+'0200',simultaneous[0].id).run();
 assert.equal(await nextDocumentNumber(DB,'A','sale',prefix),prefix+'0201');

 const payment={type:'Customer receipt',partyId:'C',amount:1,method:'Cash'};
 const pay=(k)=>runDocumentRequest(DB,member,'payment',k,payment,op=>api.addPayment('U',payment,op));
 const payKey=key();const paid=await Promise.all([pay(payKey),pay(payKey)]);assert.equal(paid[0].id,paid[1].id);
 const payments=await Promise.all([pay(key()),pay(key())]);assert.notEqual(payments[0].paymentNo,payments[1].paymentNo);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM payments').first()).n,3);
 const item={serialNo:1,productName:'Medicine',pack:'1',manufacturer:'MFR',hsn:'3004',batch:'B1',expiry:'12/28',billedQuantity:2,freeQuantity:1,mrp:100,netRate:10,gstRate:0,gstAmount:0,lineTotal:20};
 const inward={supplier:{name:'Supplier'},items:[item],charges:[],status:'Pending'};
 const purchaseKey=key();const purchase=()=>runDocumentRequest(DB,member,'purchase',purchaseKey,inward,op=>api.addPurchaseInward('U',inward,op));
 const received=await Promise.all([purchase(),purchase()]);assert.equal(received[0].id,received[1].id);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM purchase_inwards').first()).n,1);
 assert.equal((await DB.prepare("SELECT stock FROM products WHERE id='P'").first()).stock,5);
 assert.equal((await DB.prepare("SELECT outstanding FROM suppliers WHERE id='S'").first()).outstanding,20);
 const legacy={supplierId:'S',productMasterId:'M',pack:'1',batch:'B1',expiry:'2028-12',quantity:1,unitCost:10,mrp:100,gstRate:0};
 const legacyKey=key();const legacySave=()=>runDocumentRequest(DB,member,'legacy_purchase',legacyKey,legacy,op=>api.addPurchase('U',legacy,op));
 const legacyResults=await Promise.all([legacySave(),legacySave()]);assert.equal(legacyResults[0].id,legacyResults[1].id);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM purchases').first()).n,1);
 assert.equal((await DB.prepare("SELECT stock FROM products WHERE id='P'").first()).stock,6);
 await DB.prepare('DELETE FROM payments WHERE id=?').bind(paid[0].id).run();
 await assert.rejects(pay(payKey),/deleted or removed/);
 console.log('Real atomic document numbers, archived-number floor, concurrent duplicate sales/purchases/payments, replay, mismatch, failed-save rollback and tenant isolation passed.');
}finally{await mf.dispose();fs.rmSync(temp,{recursive:true,force:true});}
