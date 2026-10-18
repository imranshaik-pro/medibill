import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { adjustBoxRates, buildRatePlan, importInventoryRates } from '../lib/inventory-rate-import.ts';
const { Miniflare } = createRequire(import.meta.url)('miniflare');
const mf = new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],compatibilityDate:'2026-05-15'});
try {
 const db=await mf.getD1Database('DB');
 const migrations=new URL('../drizzle/',import.meta.url);
 for(const f of readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) for(const sql of readFileSync(new URL(f,migrations),'utf8').split(';').map(s=>s.trim()).filter(Boolean)) await db.prepare(sql).run();
 await db.batch([
  "INSERT INTO tenants(id,company_name,created_at) VALUES('agency','Test',0),('other','Other',0)",
  "INSERT INTO users(id,tenant_id,email,display_name,role,created_at,status) VALUES('admin','agency','a@test.invalid','Admin','super_admin',0,'active')",
  "INSERT INTO product_masters(id,tenant_id,name,hsn,manufacturer,created_at) VALUES('master','agency','Medicine-10 TAB','3004','MFR',0),('only','agency','Catalog Only','3004','MFR',0)",
  "INSERT INTO products(id,tenant_id,product_master_id,name,batch,stock,physical_stock,expiry,pack,purchase_rate,mrp,created_at) VALUES('batch','agency','master','Medicine-10 TAB','B1',5,500,'12/28','10*10/A',10,100,0),('foreign','other',NULL,'Medicine-10 TAB','B2',5,500,'12/28','10*10/A',99,100,0)",
 ].map(s=>db.prepare(s)));
 const converted=adjustBoxRates([{sourceRow:1,product:'Example TAB',pack:'10*15/A',rate:'220',mrp:'1180'},{sourceRow:2,product:'Example CAP',pack:'10*1*10',rate:'125',mrp:'1380'},{sourceRow:3,product:'Syrup 100ML',pack:'100ML',rate:'35',mrp:'99'},{sourceRow:4,product:'Bottle TAB',pack:'1 120',rate:'35',mrp:'170'},{sourceRow:5,product:'Corrupt TAB',pack:'1010/A',rate:'100',mrp:'1000'}]);
 assert.equal(converted[0].rate,'22');assert.equal(converted[1].rate,'12.5');assert.equal(converted[2].rate,'35');assert.equal(converted[3].unit,'review');assert.equal(converted[4].unit,'review');assert.deepEqual(adjustBoxRates(converted),converted);
 const member={id:'admin',tenantId:'agency',role:'super_admin',status:'active'};
 const rows=[{sourceRow:2,product:'medicine-10 tab',pack:'10 10/A',rate:'20.05',mrp:'100'}, {sourceRow:3,product:'Missing Brand',pack:'Single',rate:'2',mrp:'10'}, {sourceRow:4,product:'Add INSURANCE CHARGES',pack:'',rate:'1',mrp:'0'}, {sourceRow:5,product:'Catalog Only',pack:'Single',rate:'2',mrp:'10'}, {sourceRow:6,product:'Bad OCR',pack:'Single',rate:'153 30',mrp:'98'}];
 const input={action:'preview',rows,sourceFile:'Synthetic.xlsx'};
 let backups=0;
 const before=async()=>{backups++;return {id:'synthetic-backup'};};
 const preview=await importInventoryRates(db,member,input,before);
 assert.equal(preview.updates.length,1);assert.equal(backups,0);assert.equal(preview.summary.unmatchedProducts,2);
 assert.ok(preview.issues.some(r=>r.status==='invalid_source'));assert.ok(preview.issues.some(r=>r.status==='no_batch'));assert.ok(preview.issues.some(r=>r.status==='excluded_charge'));
 const original=await db.prepare("SELECT * FROM products WHERE id='batch'").first();
 const applied=await importInventoryRates(db,member,{...input,action:'apply',planHash:preview.planHash,confirm_update:true},before);
 const changed=await db.prepare("SELECT * FROM products WHERE id='batch'").first();
 assert.equal(applied.updated,1);assert.equal(backups,1);assert.equal(changed.purchase_rate,20.05);
 assert.deepEqual({...changed,purchase_rate:original.purchase_rate},original);
 assert.equal((await db.prepare("SELECT purchase_rate FROM products WHERE id='foreign'").first()).purchase_rate,99);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='inventory.rates_imported'").first()).n,1);
 const base={id:'b',name:'Medicine-10 TAB',batch:'B',pack:'10*10/A',mrp:100,purchase_rate:10};
 assert.equal(buildRatePlan([rows[0],{...rows[0],sourceRow:7,rate:'21'}],[base],[]).updates.length,0);
 assert.equal(buildRatePlan([{...rows[0],pack:'10 15/A'}],[base],[]).updates.length,0);
 assert.equal(buildRatePlan([{...rows[0],mrp:'101'}],[base],[]).updates.length,0);
 assert.equal(buildRatePlan([{...rows[0],product:'Medicine-100 TAB'}],[base],[]).updates.length,0);
 assert.equal(buildRatePlan([{...rows[0],rate:'101'}],[base],[]).updates.length,0);
 assert.equal(buildRatePlan([{...rows[0],rate:'20.05'}],[{...base,pack:''}],[]).updates.length,0);
 assert.equal(buildRatePlan([rows[0],{...rows[0],sourceRow:7}],[base],[]).updates.length,1);
 await assert.rejects(importInventoryRates(db,{...member,role:'staff'},input,before));
 await assert.rejects(importInventoryRates(db,member,{...input,rows:[rows[0],rows[0]]},before));
 await assert.rejects(importInventoryRates(db,member,{...input,action:'apply',confirm_update:false},before));
 const nextRows=[{...rows[0],rate:'22.5'}];
 const p=await importInventoryRates(db,member,{...input,rows:nextRows},before);
 const apply={...input,rows:nextRows,action:'apply',planHash:p.planHash,confirm_update:true};
 await assert.rejects(importInventoryRates(db,member,apply,async()=>{throw Error('backup failure');}));
 assert.equal((await db.prepare("SELECT purchase_rate FROM products WHERE id='batch'").first()).purchase_rate,20.05);
 await assert.rejects(importInventoryRates(db,member,apply,async()=>{await db.prepare("UPDATE products SET stock=6 WHERE id='batch'").run();}));
 assert.equal((await db.prepare("SELECT purchase_rate FROM products WHERE id='batch'").first()).purchase_rate,20.05);
 await assert.rejects(importInventoryRates(db,member,apply,before));
 const p2=await importInventoryRates(db,member,{...input,rows:nextRows},before);
 await assert.rejects(importInventoryRates(db,member,{...apply,planHash:p2.planHash},async()=>{await db.prepare("UPDATE users SET role='staff' WHERE id='admin'").run();}));
 assert.equal((await db.prepare("SELECT purchase_rate FROM products WHERE id='batch'").first()).purchase_rate,20.05);
 await db.prepare("UPDATE users SET role='super_admin' WHERE id='admin'").run();
 await db.prepare("CREATE TRIGGER fail_rate_update BEFORE UPDATE OF purchase_rate ON products BEGIN SELECT RAISE(ABORT,'test rollback'); END").run();
 await assert.rejects(importInventoryRates(db,member,{...apply,planHash:p2.planHash},before));
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='inventory.rates_imported'").first()).n,1);
 await db.prepare('DROP TRIGGER fail_rate_update').run();
 await db.batch(Array.from({length:125},(_,i)=>db.prepare("INSERT INTO products(id,tenant_id,name,batch,stock,expiry,pack,purchase_rate,mrp,created_at) VALUES(?,'agency','Bulk Medicine',?,3,'12/28','10*10',10,100,0)").bind('bulk'+i,'B'+i)));
 const bulk={...input,rows:[{sourceRow:2,product:'Bulk Medicine',pack:'10 10',rate:25.5,mrp:100}]};
 const bp=await importInventoryRates(db,member,bulk,before);
 assert.equal(bp.updates.length,125);
 const br=await importInventoryRates(db,member,{...bulk,action:'apply',confirm_update:true,planHash:bp.planHash},before);
 assert.equal(br.updated,125);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM products WHERE tenant_id='agency' AND name='Bulk Medicine' AND purchase_rate=25.5 AND stock=3").first()).n,125);
 console.log('PASS: actual D1 rate import, rate-only updates, tenant isolation, audit, duplicates, pack/MRP/units safeguards, missing data, permissions, confirmation, backups, stale previews, concurrent edits and atomic rollback.');
} finally { await mf.dispose(); }
