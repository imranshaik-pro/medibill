import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {createElement} from 'react';
import {create, act} from 'react-test-renderer';

const root=fileURLToPath(new URL('../',import.meta.url));
const temp=fs.mkdtempSync(root+'.report-test-');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],compatibilityDate:'2026-05-22'});
let renderer;
const originalFetch=globalThis.fetch;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
try {
 const DB=await mf.getD1Database('DB');
 for(const f of fs.readdirSync(root+'drizzle').filter(f=>f.endsWith('.sql')).sort())
  for(const sql of fs.readFileSync(root+'drizzle/'+f,'utf8').split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 await DB.prepare("INSERT INTO tenants VALUES('A','Agency',0),('B','Other',0)").run();
 await DB.prepare("INSERT INTO users(id,tenant_id,email,display_name,role,created_at,status) VALUES('U','A','a@example.invalid','A','admin',0,'active'),('V','B','b@example.invalid','B','admin',0,'active'),('P','A','p@example.invalid','P','admin',0,'pending')").run();
 for(let i=0;i<135;i++) await DB.prepare("INSERT INTO products(id,tenant_id,name,pack,manufacturer,batch,expiry,stock,mrp,purchase_rate,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
  .bind('A'+i,'A','Medicine '+Math.floor(i/2),'10','Maker','B'+i,'2028-12',i===0?0:i===1?-1:5,100+i,40+i/10,i).run();
 await DB.prepare("INSERT INTO products(id,tenant_id,name,batch,expiry,stock,mrp,purchase_rate,created_at) VALUES('foreign','B','Foreign medicine','FB','2028-12',999,999,999,0)").run();
 globalThis.__reportDb=drizzle(DB);globalThis.__reportRawDb=DB;
 globalThis.__reportUser={userId:'U'};
 const shims={
  '@/db':'export const getDb=()=>globalThis.__reportDb;',
  'cloudflare:workers':'export const env={DB:globalThis.__reportRawDb};',
  '@/app/chatgpt-auth':'export const getChatGPTUser=async()=>globalThis.__reportUser;',
  'next/server':'export const NextResponse={json:(body,init)=>Response.json(body,init)};',
 };
 for(const [entry,name] of [['lib/stock-report.ts','report'],['lib/stock-report-data.ts','data'],['lib/pharma-report-data.ts','pharma-data'],['lib/pharma-reports.ts','pharma'],['lib/invoice-deletion.ts','deletion'],['app/api/reports/stock/route.ts','route'],['app/api/dashboard/route.ts','dashboard-route'],['app/stock-reports.tsx','ui'],['app/wholesale-dashboard.tsx','dashboard-ui']]) {
  await build({entryPoints:[root+entry],outfile:temp+'/'+name+'.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'runtime',setup(b){
   b.onResolve({filter:/^(cloudflare:workers|@\/db|@\/app\/chatgpt-auth|next\/server)$/},args=>({path:args.path,namespace:'test'}));
   b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:shims[args.path],loader:'js'}));
  }}]});
 }
 const report=await import(pathToFileURL(temp+'/report.mjs'));
 assert.equal(report.indiaBusinessDate(new Date('2026-10-24T20:00:00Z')),'2026-10-25','India midnight is consistent');
 assert.equal(report.stockExpiryTimestamp('2026-02'),Date.UTC(2026,1,28));
 assert.equal(report.stockExpiryTimestamp('02/28'),Date.UTC(2028,1,29));
 assert.equal(report.stockExpiryTimestamp('2026-10-01'),Date.UTC(2026,9,1),'explicit expiry day is retained');
 assert(Number.isNaN(report.stockExpiryTimestamp('2026-02-30')));
 assert(Number.isNaN(report.stockExpiryTimestamp('2026-13')));
 assert(Number.isNaN(report.stockExpiryTimestamp('unknown')));

 const {stockReportData}=await import(pathToFileURL(temp+'/data.mjs'));
 const {GET}=await import(pathToFileURL(temp+'/route.mjs'));
 const snapshot=await stockReportData('U');
 const {pharmaReportData,reportProduct}=await import(pathToFileURL(temp+'/pharma-data.mjs'));
 const {pharmaReports}=await import(pathToFileURL(temp+'/pharma.mjs'));
 const {deleteInvoiceRecord}=await import(pathToFileURL(temp+'/deletion.mjs'));
 await assert.rejects(deleteInvoiceRecord({prepare(){throw new Error('must not query or mutate')}},{id:'U',tenantId:'A',status:'active',role:'admin'},'sale','posted',{confirm_delete:true,reason:'Test'},async()=>{throw new Error('must not back up')}),/locked against deletion/);
 await DB.prepare("INSERT INTO customers(id,tenant_id,name,phone,outstanding,created_at) VALUES('C','A','Buyer','9000000000',200,0)").run();
 await DB.prepare("INSERT INTO suppliers(id,tenant_id,name,phone,outstanding,created_at) VALUES('S','A','Seller','9000000001',100,0)").run();
 await DB.prepare("INSERT INTO invoices(id,tenant_id,invoice_no,customer_id,customer_name,amount,invoice_date,cgst,sgst,created_at) VALUES('I','A','INV1','C','Buyer',210,'2026-10-25',5,5,0)").run();
 await DB.prepare("INSERT INTO invoice_lines(id,tenant_id,invoice_id,customer_id,product_id,product_name,batch,quantity,unit_rate,taxable_amount,gst_amount,line_total,created_at) VALUES('L','A','I','C','A2','Medicine','B2',2,100,200,10,210,0)").run();
 await DB.prepare("INSERT INTO purchase_inwards(id,tenant_id,inward_no,supplier_id,supplier_name,invoice_date,grand_total,cgst,sgst,created_at) VALUES('PI','A','PIN1','S','Seller','2026-10-25',105,2.5,2.5,0)").run();
 await DB.prepare("INSERT INTO payments(id,tenant_id,payment_no,type,party_id,party_name,amount,method,payment_date,created_at) VALUES('PAY','A','PAY1','Customer receipt','C','Buyer',10,'Cash','2026-10-25',0)").run();

 const {GET:dashboardGET}=await import(pathToFileURL(temp+'/dashboard-route.mjs'));
 const dashboardToday=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 await DB.prepare("INSERT INTO invoices(id,tenant_id,invoice_no,customer_id,customer_name,amount,invoice_date,created_at) VALUES('DASH','A','DASH1','C','Buyer',17,?,0),('FOREIGN','B','OTHER','C','Other',99999,?,0)").bind(dashboardToday,dashboardToday).run();
 let dashboardResponse=await dashboardGET(new Request('https://example.invalid/api/dashboard?period=today'));
 assert.equal(dashboardResponse.status,200);
 const dashboard=await dashboardResponse.json();
 assert.equal(dashboard.sales,dashboardToday==='2026-10-25'?227:17);
 assert.equal(dashboard.receivables,200);assert.equal(dashboard.payables,100);
 assert.equal(dashboard.low,135,'inventory alerts use all tenant batches');
 assert(!JSON.stringify(dashboard).includes('99999'),'dashboard does not leak other tenant sales');
 assert.equal(dashboard.trend.length,1);
 assert.equal((await dashboardGET(new Request('https://example.invalid/api/dashboard?period=invalid'))).status,400);
 globalThis.__reportUser={userId:'P'};
 assert.equal((await dashboardGET(new Request('https://example.invalid/api/dashboard'))).status,403);
 globalThis.__reportUser=null;
 assert.equal((await dashboardGET(new Request('https://example.invalid/api/dashboard'))).status,401);
 globalThis.__reportUser={userId:'U'};
 await DB.prepare("DELETE FROM invoices WHERE id IN ('DASH','FOREIGN')").run();
 assert.equal((await pharmaReportData('U',new URLSearchParams({kind:'sales'}))).rows[0].Total,210);
 assert.equal((await pharmaReportData('U',new URLSearchParams({kind:'salesInvoices'}))).rows.length,1);
 assert.equal((await pharmaReportData('U',new URLSearchParams({kind:'sales',from:'2026-10-26'}))).rows.length,0);
 assert.equal((await pharmaReportData('U',new URLSearchParams({kind:'cash'}))).rows[0].Receipt,10);
 assert.equal((await pharmaReportData('U',new URLSearchParams({kind:'cash'}))).rows[0].Payment,0);
 assert.equal((await pharmaReportData('U',new URLSearchParams({kind:'gst'}))).rows.length,2);
 assert.equal((await pharmaReportData('V',new URLSearchParams({kind:'sales'}))).rows.length,0);

 for(const kind of Object.keys(pharmaReports)) {const r=await pharmaReportData('U',new URLSearchParams({kind}));assert(Array.isArray(r.rows),kind);assert(!r.rows.some(row=>JSON.stringify(row).includes('foreign')),kind+' tenant isolation');}
 assert.equal((await reportProduct('U','A2')).Batch,'B2');
 assert.equal(await reportProduct('V','A2'),null);
 await assert.rejects(pharmaReportData('P',new URLSearchParams()),/ACCESS_DENIED/);
 await assert.rejects(pharmaReportData('U',new URLSearchParams({kind:'DROP TABLE users'})),/Unknown report/);
 await assert.rejects(pharmaReportData('U',new URLSearchParams({from:'2026-02-30'})),/valid report date/);

 assert.equal(snapshot.products.length,135,'report exceeds dashboard 100-row cap');
 assert(!snapshot.products.some(p=>p.id==='foreign'),'tenant stock is isolated');
 assert.equal((await stockReportData('V')).products.length,1);
 await assert.rejects(stockReportData('P'),/ACCESS_DENIED/);
 await assert.rejects(stockReportData('missing'),/ACCESS_DENIED/);
 const options={availability:'available',search:'',columns:report.stockReportPresets.full.columns,productsOnly:false};
 const available=report.selectStockReport(snapshot.products,options);
 assert.equal(available.length,133);
 assert.equal(report.selectStockReport(snapshot.products,{...options,availability:'out'}).length,2);
 assert.equal(report.selectStockReport(snapshot.products,{...options,availability:'all'}).length,135);
 assert.equal(report.selectStockReport(snapshot.products,{...options,search:'Maker B134'}).length,1);
 assert.equal(report.selectStockReport(snapshot.products,{...options,search:'Maker B134'})[0].batch,'B134');
 const unique=report.selectStockReport(snapshot.products,{...options,productsOnly:true});
 assert.equal(unique.length,67,'product-only list collapses matching products across batches');
 const mrpCsv=report.stockReportCsv(available,['name','batch','mrp']);
 assert(mrpCsv.startsWith('\uFEFF"Product","Batch","MRP (INR)"'));
 assert(!mrpCsv.includes('Purchase rate'));
 const hostile={...available[0],name:' =HYPERLINK("https://evil.invalid")',batch:'a,"b\nnext',manufacturer:'<script>alert(1)</script>'};
 const csv=report.stockReportCsv([hostile],['name','batch','manufacturer']);
 assert(csv.includes('"\' =HYPERLINK(""https://evil.invalid"")"'));
 assert(csv.includes('"a,""b\nnext"'));
 const html=report.stockReportPrintHtml([hostile],['name','manufacturer'],'Agency <img src=x>','In stock only');
 assert(!html.includes('<script>'));assert(!html.includes('<img src=x>'));
 assert(html.includes('&lt;script&gt;'));assert(!html.includes('<th>Purchase rate (INR)</th>'));
 let response=await GET();assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'private, no-store');
 globalThis.__reportUser=null;assert.equal((await GET()).status,401);
 globalThis.__reportUser={userId:'P'};assert.equal((await GET()).status,403);
 globalThis.__reportUser={userId:'U'};
 const workingDb=globalThis.__reportDb;
 globalThis.__reportDb={select(){throw new Error('private database failure')}};
 response=await GET();assert.equal(response.status,500);assert(!(await response.text()).includes('private database failure'));
 globalThis.__reportDb=workingDb;
 // Mount the actual report UI: filters and exports share the preview selection.
 const {StockReports}=await import(pathToFileURL(temp+'/ui.mjs'));
 let requests=0,download;
 globalThis.fetch=async(url,init)=>{assert.equal(url,'/api/reports/stock');assert.equal(init.cache,'no-store');requests++;return Response.json(snapshot)};
 const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
 URL.createObjectURL=blob=>{download=blob;return 'blob:report-test'};URL.revokeObjectURL=()=>{};
 globalThis.document={createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}};
 let printed='';
 globalThis.window={open:()=>({opener:{},document:{open(){},write(html){printed=html},close(){}}})};
 try {
  await act(async()=>{renderer=create(createElement(StockReports,{companyName:'Agency'}))});
  const button=text=>renderer.root.findAllByType('button').find(b=>b.children.join('')===text);
  assert(button('Download CSV').props.disabled);
  await act(async()=>button('Generate stock report').props.onClick());
  assert.equal(requests,1);assert.equal(renderer.root.findAllByType('tbody')[0].findAllByType('tr').length,100);
  await act(async()=>button('Next rows').props.onClick());
  assert.equal(renderer.root.findAllByType('tbody')[0].findAllByType('tr').length,33);
  await act(async()=>renderer.root.findAllByType('select')[0].props.onChange({target:{value:'mrp'}}));
  assert(!renderer.root.findAllByType('th').some(h=>h.children.join('').includes('Purchase rate')));
  await act(async()=>button('Download CSV').props.onClick());
  assert.equal(new TextDecoder('utf-8',{ignoreBOM:true}).decode(await download.arrayBuffer()),report.stockReportCsv(available,report.stockReportPresets.mrp.columns));
  await act(async()=>button('Print / Save PDF').props.onClick());
  assert(printed.includes('MRP (INR)'));assert(!printed.includes('Purchase rate (INR)'));
  await act(async()=>renderer.root.findAllByType('select')[0].props.onChange({target:{value:'products'}}));
  assert.equal(renderer.root.findAllByType('tbody')[0].findAllByType('tr').length,67);
  await act(async()=>renderer.root.findAllByType('input').filter(n=>n.props.type==='checkbox')[7].props.onChange({target:{checked:true}}));
  assert.equal(renderer.root.findAllByType('select')[0].props.value,'custom');
  assert.equal(renderer.root.findAllByType('tbody')[0].findAllByType('tr').length,100,'custom monetary columns preserve batch rows');
  assert(renderer.root.findAllByType('th').some(h=>h.children.join('')==='Purchase rate (INR)'));
  assert(!renderer.root.findAllByType('th').some(h=>h.children.join('')==='MRP (INR)'));
  await act(async()=>renderer.root.findByProps({placeholder:'Product, batch, pack or manufacturer'}).props.onChange({target:{value:'missing-product'}}));
  assert(button('Download CSV').props.disabled);
  assert(JSON.stringify(renderer.toJSON()).includes('No stock records match'));
  globalThis.fetch=async()=>Response.json({error:'Please sign in again'},{status:401});
  await act(async()=>button('Refresh stock report').props.onClick());
  assert(JSON.stringify(renderer.toJSON()).includes('Please sign in again'));
  assert(button('Download CSV').props.disabled,'failed refresh cannot export stale stock');
 } finally { URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke; }

 await act(async()=>renderer.unmount());renderer=null;
 const {WholesaleDashboard}=await import(pathToFileURL(temp+'/dashboard-ui.mjs'));
 const dashboardRequests=[], navigations=[], opened=[];
 globalThis.fetch=async(url)=>{dashboardRequests.push(url);return Response.json({...dashboard,salesCount:0,purchaseCount:0,alerts:[]})};
 const dashboardProps={company:'Agency',revision:1,open:kind=>opened.push(kind),navigate:page=>navigations.push(page)};
 await act(async()=>{renderer=create(createElement(WholesaleDashboard,dashboardProps))});
 const dashboardButton=text=>renderer.root.findAllByType('button').find(b=>b.children.join('')===text);
 assert.equal(dashboardRequests.length,1);
 await act(async()=>renderer.update(createElement(WholesaleDashboard,{...dashboardProps,revision:2})));
 assert.equal(dashboardRequests.length,2,'dashboard reloads after workspace records change');
 await act(async()=>dashboardButton('Today').props.onClick());
 assert.equal(dashboardRequests.at(-1),'/api/dashboard?period=today');
 await act(async()=>dashboardButton('+ New sales invoice').props.onClick());assert.equal(opened.at(-1),'invoice');
 await act(async()=>dashboardButton('Inventory').props.onClick());assert.equal(navigations.at(-1),'inventory');
 globalThis.fetch=async()=>Response.json({error:'Session expired'},{status:401});
 await act(async()=>dashboardButton('Refresh').props.onClick());
 assert(JSON.stringify(renderer.toJSON()).includes('Session expired'));
 assert(!renderer.root.findAllByProps({'aria-label':'Business metrics'}).length,'failed dashboard refresh hides stale totals');
 console.log('PASS: dashboard refresh after saves, period controls, navigation, session failure, India dates and expiry boundaries');
 console.log('PASS: full D1 inventory beyond 100 rows, tenant isolation, active membership, HTTP authentication/no-cache, stock filters, unique products, CSV quoting/formula safety, escaped print output, mounted report presets/preview/download and error recovery');
} finally {
 if(renderer)await act(async()=>renderer.unmount());
 await mf.dispose();fs.rmSync(temp,{recursive:true,force:true});
 globalThis.fetch=originalFetch;delete globalThis.window;delete globalThis.document;delete globalThis.__reportDb;delete globalThis.__reportUser;
}
