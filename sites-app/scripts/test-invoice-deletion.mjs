import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {deleteInvoiceRecord,nextDocumentNumber} from '../lib/invoice-deletion.ts';
const migrations=new URL('../drizzle/',import.meta.url);
const member={id:'admin',tenantId:'agency',role:'super_admin',status:'active'};
const confirmation={confirm_delete:true,reason:'Duplicate test invoice'};
function fixture(kind,stock=20) {
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(file,migrations),'utf8'));
 sqlite.exec(`INSERT INTO tenants(id,company_name,created_at) VALUES('agency','SAPharma',0),('other','Other firm',0);
 INSERT INTO users(id,tenant_id,email,display_name,role,created_at,status) VALUES('admin','agency','admin@test.invalid','Admin','super_admin',0,'active');
 INSERT INTO customers(id,tenant_id,name,phone,outstanding,created_at) VALUES('customer','agency','Buyer','',100,0);
 INSERT INTO suppliers(id,tenant_id,name,phone,outstanding,created_at) VALUES('supplier','agency','Supplier','',100,0);
 INSERT INTO products(id,tenant_id,name,batch,stock,expiry,purchase_rate,mrp,pack_multiplier,physical_stock,created_at) VALUES('batch','agency','Medicine','B01',${stock},'12/28',10,20,10,${stock*10},0);`);
 if(kind==='sale')sqlite.exec(`INSERT INTO invoices(id,tenant_id,invoice_no,customer_id,customer_name,amount,invoice_date,created_at) VALUES('bill','agency','INV-26-0003','customer','Buyer',100,'2026-10-01',0);
 INSERT INTO invoice_lines(id,tenant_id,invoice_id,customer_id,product_id,product_name,batch,quantity,free_quantity,unit_rate,taxable_amount,gst_amount,line_total,created_at) VALUES('line1','agency','bill','customer','batch','Medicine','B01',3,1,10,30,0,30,0),('line2','agency','bill','customer','batch','Medicine','B01',2,1,10,20,0,20,0);`);
 else sqlite.exec(`INSERT INTO purchase_inwards(id,tenant_id,inward_no,supplier_id,supplier_name,invoice_no,grand_total,created_at) VALUES('bill','agency','PIN-2026-0004','supplier','Supplier','EXT-001',100,0);
 INSERT INTO purchase_inward_items(id,tenant_id,inward_id,product_id,serial_no,product_name,pack,manufacturer,hsn,batch,expiry,billed_quantity,free_quantity,mrp,net_rate,line_total,created_at) VALUES('line1','agency','bill','batch',1,'Medicine','10x10','MFR','3004','B01','12/28',10,2,20,10,100,0),('line2','agency','bill','batch',2,'Medicine','10x10','MFR','3004','B01','12/28',5,1,20,10,50,0);
 INSERT INTO purchase_charges(id,tenant_id,inward_id,kind,amount,created_at) VALUES('charge','agency','bill','Freight',10,0);`);
 const db={prepare(sql){return {bind(...args){return {sql,args,async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(s=>sqlite.prepare(s.sql).run(...s.args));sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const scalar=sql=>Object.values(sqlite.prepare(sql).get())[0];
 return {sqlite,db,scalar};
}
for(const kind of ['sale','purchase']) {
 const f=fixture(kind);let backups=0;
 try {
  await deleteInvoiceRecord(f.db,member,kind,'bill',confirmation,async()=>{backups++;});
  assert.equal(backups,1);
  assert.equal(f.scalar('SELECT stock FROM products'),kind==='sale'?27:2);
  assert.equal(f.scalar('SELECT physical_stock FROM products'),kind==='sale'?270:20);
  assert.equal(f.scalar(`SELECT outstanding FROM ${kind==='sale'?'customers':'suppliers'}`),0);
  assert.equal(f.scalar(`SELECT COUNT(*) FROM ${kind==='sale'?'invoices':'purchase_inwards'}`),0);
  assert.equal(f.scalar('SELECT COUNT(*) FROM stock_adjustments'),1);
  assert.equal(f.scalar('SELECT COUNT(*) FROM audit_logs'),1);
  assert.equal(f.scalar('SELECT COUNT(*) FROM purchase_charges'),0);
  assert.equal(await nextDocumentNumber(f.db,'agency',kind,kind==='sale'?'INV-26-':'PIN-2026-'),kind==='sale'?'INV-26-0004':'PIN-2026-0005');
  await assert.rejects(deleteInvoiceRecord(f.db,member,kind,'bill',confirmation,async()=>{}),/not found/);
  assert.equal(f.scalar('SELECT stock FROM products'),kind==='sale'?27:2);
  assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 } finally {f.sqlite.close();}
}
for(const condition of ['permission','confirmation','tenant','payment','return','stock','backup','concurrent-lines','concurrent-stock','concurrent-payment','concurrent-role','transaction-failure']) {
 const f=fixture('purchase',condition==='stock'?17:20);
 let m=member,input=confirmation,before=async()=>{};
 if(condition==='permission')m={...member,role:'staff'};
 if(condition==='confirmation')input={...confirmation,confirm_delete:false};
 if(condition==='tenant')m={...member,tenantId:'other'};
 const payment=()=>f.sqlite.exec("INSERT INTO payments(id,tenant_id,payment_no,type,party_id,party_name,amount,payment_date,created_at) VALUES('pay','agency','P1','supplier','supplier','Supplier',10,'2026-10-01',0)");
 if(condition==='payment')payment();
 if(condition==='return')f.sqlite.exec("INSERT INTO returns(id,tenant_id,return_no,type,party_id,party_name,reference_no,amount,reason,return_date,created_at) VALUES('ret','agency','R1','purchase','supplier','Supplier','EXT-001',10,'Return','2026-10-01',0)");
 if(condition==='backup')before=async()=>{throw Error('Storage unavailable');};
 if(condition==='concurrent-lines')before=async()=>{f.sqlite.exec("UPDATE purchase_inward_items SET billed_quantity=11 WHERE id='line1'");};
 if(condition==='concurrent-stock')before=async()=>{f.sqlite.exec('UPDATE products SET stock=17');};
 if(condition==='concurrent-payment')before=async()=>payment();
 if(condition==='concurrent-role')before=async()=>f.sqlite.exec("UPDATE users SET role='staff' WHERE id='admin'");
 if(condition==='transaction-failure')f.sqlite.exec("CREATE TRIGGER simulate_failure BEFORE DELETE ON purchase_inwards BEGIN SELECT RAISE(ABORT,'Failure'); END;");
 try {
  await assert.rejects(deleteInvoiceRecord(f.db,m,'purchase','bill',input,before));
  assert.equal(f.scalar('SELECT COUNT(*) FROM purchase_inwards'),1,condition);
  assert.equal(f.scalar('SELECT COUNT(*) FROM purchase_inward_items'),2,condition);
  assert.equal(f.scalar('SELECT COUNT(*) FROM purchase_charges'),1,condition);
  assert.equal(f.scalar('SELECT COUNT(*) FROM audit_logs'),0,condition);
  assert.equal(f.scalar('SELECT COUNT(*) FROM stock_adjustments'),0,condition);
  assert.equal(f.scalar('SELECT outstanding FROM suppliers'),100,condition);
  assert.equal(f.scalar('SELECT stock FROM products'),condition==='stock'||condition==='concurrent-stock'?17:20,condition);
 } finally {f.sqlite.close();}
}
console.log('PASS: sales/purchase reversals, free units, repeated batches, balances, audit, numbering, permissions, confirmation, tenant isolation, payments, returns, stock guards, backup failure, concurrency and atomic rollback.');
