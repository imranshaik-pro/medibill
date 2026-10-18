import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {searchWorkspace} from '../lib/workspace-search.ts';
const {Miniflare}=createRequire(import.meta.url)('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],compatibilityDate:'2026-05-15'});
try{
 const db=await mf.getD1Database('DB'),migrations=new URL('../drizzle/',import.meta.url);
 for(const f of readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort())for(const sql of readFileSync(new URL(f,migrations),'utf8').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 await db.batch([
  "INSERT INTO tenants(id,company_name,created_at) VALUES('agency','Test agency',0),('other','Other agency',0)",
  "INSERT INTO product_masters(id,tenant_id,name,hsn,manufacturer,composition,created_at) VALUES('master','agency','Megacob-OD','3004','MFR','Methylcobalamin 1500 mcg',0)",
  "INSERT INTO products(id,tenant_id,name,batch,stock,expiry,purchase_rate,mrp,created_at) VALUES('mine','agency','Megacob-OD','26061803A',10,'05/28',20,30,0),('theirs','other','Megacob-OD','26061803A',99,'05/28',20,30,0),('literal','agency','Discount 50%_','B01',0,'05/28',20,30,0)",
  "INSERT INTO customers(id,tenant_id,name,phone,gstin,dl_no,outstanding,created_at) VALUES('customer','agency','VKT Pharma','9999999999','36ABCDE1234F1Z5','DL/2026/001',0,0)",
  "INSERT INTO suppliers(id,tenant_id,name,phone,outstanding,created_at) VALUES('supplier','agency','Elkos Healthcare','',0,0)",
  "INSERT INTO invoices(id,tenant_id,invoice_no,customer_id,customer_name,amount,invoice_date,created_at) VALUES('sale','agency','INV-26-0001','customer','VKT Pharma',100,'2026-10-01',0)",
  "INSERT INTO purchase_inwards(id,tenant_id,inward_no,supplier_name,invoice_no,order_no,grand_total,created_at) VALUES('purchase','agency','PIN-2026-0001','Elkos Healthcare','OS004171','ORDER-42',100,0)",
 ].map(s=>db.prepare(s)));
 const find=q=>searchWorkspace(db,'agency',q);
 assert.equal((await find('megacob')).results.length,2);
 assert.ok(!(await find('megacob')).results.some(r=>r.id==='theirs'));
 assert.equal((await find('  MEGACOB   26061803A ')).results[0].id,'mine');
 assert.equal((await find('Methylcobalamin')).results[0].id,'master');
 assert.equal((await find('36ABCDE1234F1Z5')).results[0].id,'customer');
 assert.equal((await find('DL/2026/001')).results[0].id,'customer');
 assert.equal((await find('INV-26-0001')).results[0].id,'sale');
 assert.equal((await find('ORDER-42')).results[0].id,'purchase');
 assert.equal((await find('Elkos')).results.length,2);
 assert.equal((await find('50%_')).results[0].id,'literal');
 assert.equal((await find("' OR 1=1 --")).results.length,0);
 assert.equal((await find('missing medicine')).results.length,0);
 assert.equal((await find('a')).results.length,0);
 await assert.rejects(find('x'.repeat(121)),/120 characters/);
 const items=[];
 for(let i=0;i<125;i++)items.push(db.prepare("INSERT INTO products(id,tenant_id,name,batch,stock,expiry,purchase_rate,mrp,created_at) VALUES(?,'agency',?, ?,0,'05/28',1,2,?)").bind('extra'+i,'Extra Medicine '+i,'EXTRA'+i,i));
 await db.batch(items);
 assert.equal((await find('Extra Medicine 124 EXTRA124')).results[0].id,'extra124');
 const many=await find('Extra Medicine');assert.equal(many.results.length,20);assert.equal(many.hasMore,true);
 console.log('PASS: D1 search, multi-field and multi-word queries, all core modules, tenant isolation, literal special characters, bounds and records beyond 100 rows.');
}finally{await mf.dispose();}
