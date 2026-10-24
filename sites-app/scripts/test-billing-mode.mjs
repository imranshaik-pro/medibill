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


 await DB.prepare("UPDATE product_masters SET is_schedule_h1=1,is_prescription_required=1 WHERE id='M'").run();
 const sale={customerId:'C',items:[{productId:'P',quantity:1,freeQuantity:0,unitRate:10,discountPercent:0,gstRate:0}],status:'Pending',paymentMode:'Credit'};
 const wholesale=await api.addInvoice('U',sale);
 assert(wholesale.id);assert.equal(wholesale.complianceAcknowledged,false);
 globalThis.__stockEnv.BILLING_MODE='retail';
 await assert.rejects(api.addInvoice('U',sale),/Acknowledge/);
 await assert.rejects(api.updateSalesInvoice('U',wholesale.id,sale),/Acknowledge/);
 await assert.rejects(api.addInvoice('U',{...sale,complianceAcknowledged:true}),/Doctor name/);
 // A request-provided mode cannot disable trusted retail policy.
 await assert.rejects(api.addInvoice('U',{...sale,billingMode:'wholesale'}),/Acknowledge/);
 const retail=await api.addInvoice('U',{...sale,complianceAcknowledged:true,prescriptionDoctorName:'Doctor',prescriptionDoctorRegistration:'RMP123'});
 assert.equal(retail.complianceAcknowledged,true);
 globalThis.__stockEnv.BILLING_MODE='wholesale';
 assert((await api.updateSalesInvoice('U',wholesale.id,sale)).header.id);
 const historical=await api.updateSalesInvoice('U',retail.id,sale);
 assert.equal(historical.header.prescriptionDoctorName,'Doctor');
 assert.equal(historical.header.prescriptionDoctorRegistration,'RMP123');
 assert.equal((await api.dashboardData('U')).billingMode,'wholesale');
 globalThis.__stockEnv.BILLING_MODE='invalid';assert.throws(()=>api.billingMode(),/Invalid BILLING_MODE/);
 console.log('PASS: actual D1 wholesale create/edit without prescription, retail enforcement, request bypass rejection, configured mode in workspace, invalid configuration rejection');
}finally{await mf.dispose();fs.rmSync(temp,{recursive:true,force:true});}
