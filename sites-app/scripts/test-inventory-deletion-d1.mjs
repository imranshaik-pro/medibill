import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deleteInventoryBatch } from '../lib/inventory-deletion.ts';
const { Miniflare } = createRequire(import.meta.url)('miniflare');
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}', d1Databases: ['DB'], compatibilityDate: '2026-05-15' });
try {
 const db=await mf.getD1Database('DB');
 const migrations=new URL('../drizzle/',import.meta.url);
 for(const file of readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort())for(const sql of readFileSync(new URL(file,migrations),'utf8').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 await db.batch([
  "INSERT INTO tenants(id,company_name,created_at) VALUES('agency','Test agency',0),('other','Other',0)",
  "INSERT INTO users(id,tenant_id,email,display_name,role,created_at,status) VALUES('admin','agency','admin@test.invalid','Admin','super_admin',0,'active')",
  "INSERT INTO product_masters(id,tenant_id,name,hsn,manufacturer,created_at) VALUES('master','agency','Medicine','3004','MFR',0)",
  "INSERT INTO customers(id,tenant_id,name,phone,outstanding,created_at) VALUES('customer','agency','Buyer','',0,0)",
  "INSERT INTO suppliers(id,tenant_id,name,phone,outstanding,created_at) VALUES('supplier','agency','Supplier','',0,0)",
 ].map(s=>db.prepare(s)));
 const member={id:'admin',tenantId:'agency',role:'super_admin',status:'active'};
 const input={confirm_delete:true,reason:'Synthetic batch cleanup'};
 let serial=0;
 async function seed(stock=0){const id='batch'+(++serial);await db.prepare("INSERT INTO products(id,tenant_id,product_master_id,name,batch,stock,expiry,purchase_rate,mrp,physical_stock,created_at) VALUES(?,'agency','master',?,'B01',?,'12/28',10,20,?,0)").bind(id,id,stock,stock).run();await db.prepare("INSERT INTO stock_adjustments(id,tenant_id,product_id,batch,previous_stock,new_stock,delta,reason,user_id,created_at) VALUES(?,'agency',?,'B01',10,0,-10,'Audit Correction','admin',0)").bind('adjust'+serial,id).run();return id;}
 const id=await seed();let backups=0;
 await deleteInventoryBatch(db,member,id,input,async()=>{backups++;});
 assert.equal(backups,1);
 assert.equal(await db.prepare('SELECT id FROM products WHERE id=?').bind(id).first(),null);
 assert.equal(await db.prepare('SELECT id FROM stock_adjustments WHERE product_id=?').bind(id).first(),null);
 assert.ok(await db.prepare("SELECT id FROM product_masters WHERE id='master'").first());
 const audit=JSON.parse((await db.prepare("SELECT details FROM audit_logs WHERE action='inventory.batch_deleted'").first()).details);
 assert.equal(audit.batch.id,id);assert.equal(audit.adjustments.length,1);assert.equal(audit.adjustments[0].delta,-10);
 for(const condition of ['stock','physical','role','tenant','confirmation','backup','sale','purchase','legacy-purchase','concurrent-stock','concurrent-metadata','concurrent-role','missing','failure']){
  const batch=await seed(condition==='stock'?1:0);let m=member,body=input,before=async()=>{};
  if(condition==='physical')await db.prepare('UPDATE products SET physical_stock=1 WHERE id=?').bind(batch).run();
  if(condition==='role')m={...member,role:'staff'};
  if(condition==='tenant')m={...member,tenantId:'other'};
  if(condition==='confirmation')body={...input,confirm_delete:false};
  if(condition==='backup')before=async()=>{throw Error('Backup failed');};
  if(condition==='concurrent-stock')before=async()=>{await db.prepare('UPDATE products SET stock=1 WHERE id=?').bind(batch).run();};
  if(condition==='concurrent-metadata')before=async()=>{await db.prepare("UPDATE products SET batch='B02' WHERE id=?").bind(batch).run();};
  if(condition==='concurrent-role')before=async()=>{await db.prepare("UPDATE users SET role='staff' WHERE id='admin'").run();};
  if(condition==='missing')before=async()=>{await db.prepare('DELETE FROM stock_adjustments WHERE product_id=?').bind(batch).run();await db.prepare('DELETE FROM products WHERE id=?').bind(batch).run();};
  if(condition==='sale')await db.batch([db.prepare("INSERT INTO invoices(id,tenant_id,invoice_no,customer_id,customer_name,amount,invoice_date,created_at) VALUES('sale','agency','INV-1','customer','Buyer',10,'2026-10-01',0)"),db.prepare("INSERT INTO invoice_lines(id,tenant_id,invoice_id,customer_id,product_id,product_name,batch,quantity,unit_rate,taxable_amount,gst_amount,line_total,created_at) VALUES('line','agency','sale','customer',?,'Medicine','B01',1,10,10,0,10,0)").bind(batch)]);
  if(condition==='purchase')await db.batch([db.prepare("INSERT INTO purchase_inwards(id,tenant_id,inward_no,supplier_name,grand_total,created_at) VALUES('purchase','agency','PIN-1','Supplier',10,0)"),db.prepare("INSERT INTO purchase_inward_items(id,tenant_id,inward_id,product_id,serial_no,product_name,pack,manufacturer,hsn,batch,expiry,billed_quantity,mrp,net_rate,line_total,created_at) VALUES('purchase-line','agency','purchase',?,1,'Medicine','Single','MFR','3004','B01','12/28',1,20,10,10,0)").bind(batch)]);
  if(condition==='legacy-purchase')await db.prepare("INSERT INTO purchases(id,tenant_id,purchase_no,supplier_id,supplier_name,product_id,product_name,quantity,unit_cost,amount,purchase_date,created_at) VALUES('legacy','agency','P1','supplier','Supplier',?,'Medicine',1,10,10,'2026-10-01',0)").bind(batch).run();
  if(condition==='failure')await db.prepare("CREATE TRIGGER fail_inventory_delete BEFORE DELETE ON products BEGIN SELECT RAISE(ABORT,'test rollback'); END").run();
  const auditCount=(await db.prepare('SELECT COUNT(*) AS n FROM audit_logs').first()).n;
  await assert.rejects(deleteInventoryBatch(db,m,batch,body,before),undefined,condition);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM audit_logs').first()).n,auditCount,condition);
  if(condition!=='missing'){assert.ok(await db.prepare('SELECT id FROM products WHERE id=?').bind(batch).first());assert.ok(await db.prepare('SELECT id FROM stock_adjustments WHERE product_id=?').bind(batch).first());}
  await db.prepare("UPDATE users SET role='super_admin' WHERE id='admin'").run();
 }
 console.log('PASS: actual D1 batch deletion, audit archive, master preservation, stock/history/role/tenant checks, backup failure, concurrency and atomic rollback.');
}finally{await mf.dispose();}
