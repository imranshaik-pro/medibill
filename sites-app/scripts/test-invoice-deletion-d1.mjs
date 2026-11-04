import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deleteInvoiceRecord } from '../lib/invoice-deletion.ts';

const { Miniflare } = createRequire(import.meta.url)('miniflare');
// Exercise D1's expression-depth limit; ordinary SQLite has a higher limit.
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}', d1Databases: ['DB'], compatibilityDate: '2026-05-15' });
try {
  const db = await mf.getD1Database('DB');
  const migrations = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(migrations).filter(x => x.endsWith('.sql')).sort()) {
    for (const sql of readFileSync(new URL(file, migrations), 'utf8').split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
  }
  const statements = [
    "INSERT INTO tenants(id,company_name,created_at) VALUES('agency','Test agency',0)",
    "INSERT INTO users(id,tenant_id,email,display_name,role,created_at,status) VALUES('admin','agency','admin@test.invalid','Admin','super_admin',0,'active')",
    "INSERT INTO customers(id,tenant_id,name,phone,outstanding,created_at) VALUES('customer','agency','Buyer','',100,0)",
    "INSERT INTO suppliers(id,tenant_id,name,phone,outstanding,created_at) VALUES('supplier','agency','Supplier','',100,0)",
    "INSERT INTO products(id,tenant_id,name,batch,stock,expiry,purchase_rate,mrp,pack_multiplier,physical_stock,created_at) VALUES('batch','agency','Medicine','B01',20,'12/28',10,20,10,200,0)",
    "INSERT INTO invoices(id,tenant_id,invoice_no,customer_id,customer_name,amount,invoice_date,created_at) VALUES('sale','agency','INV-26-0001','customer','Buyer',100,'2026-10-01',0)",
    "INSERT INTO invoice_lines(id,tenant_id,invoice_id,customer_id,product_id,product_name,batch,quantity,free_quantity,unit_rate,taxable_amount,gst_amount,line_total,created_at) VALUES('sale-line','agency','sale','customer','batch','Medicine','B01',3,1,10,30,0,30,0)",
    "INSERT INTO purchase_inwards(id,tenant_id,inward_no,supplier_id,supplier_name,invoice_no,grand_total,created_at) VALUES('purchase','agency','PIN-2026-0001','supplier','Supplier','EXT-001',100,0)",
    "INSERT INTO purchase_inward_items(id,tenant_id,inward_id,product_id,serial_no,product_name,pack,manufacturer,hsn,batch,expiry,billed_quantity,free_quantity,mrp,net_rate,line_total,created_at) VALUES('purchase-line','agency','purchase','batch',1,'Medicine','10x10','MFR','3004','B01','12/28',10,2,20,10,100,0)",
    "INSERT INTO purchase_charges(id,tenant_id,inward_id,kind,amount,created_at) VALUES('charge','agency','purchase','Freight',10,0)",
  ];
  await db.batch(statements.map(sql => db.prepare(sql)));
  const member = { id: 'admin', tenantId: 'agency', role: 'super_admin', status: 'active' };
  const input = { confirm_delete: true, reason: 'Synthetic regression test' };
  const stock = async () => (await db.prepare('SELECT stock FROM products').first()).stock;
  await deleteInvoiceRecord(db, member, 'sale', 'sale', input, async () => {});
  assert.equal(await stock(), 24);
  await assert.rejects(deleteInvoiceRecord(db, member, 'purchase', 'purchase', input, async () => {
    await db.prepare("UPDATE purchase_inward_items SET net_rate=11 WHERE id='purchase-line'").run();
  }), /Nothing was deleted/);
  assert.equal(await stock(), 24);
  await deleteInvoiceRecord(db, member, 'purchase', 'purchase', input, async () => {});
  assert.equal(await stock(), 12);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM invoices').first()).n, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM purchase_inwards').first()).n, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM audit_logs').first()).n, 2);
  console.log('PASS: actual D1 sales and purchase deletion, stock reversals, and concurrent-edit rollback.');
} finally { await mf.dispose(); }
