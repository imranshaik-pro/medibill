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
 globalThis.__reportDb=drizzle(DB);
 globalThis.__reportUser={userId:'U'};
 const shims={
  '@/db':'export const getDb=()=>globalThis.__reportDb;',
  'cloudflare:workers':'export const env={};',
  '@/app/chatgpt-auth':'export const getChatGPTUser=async()=>globalThis.__reportUser;',
  'next/server':'export const NextResponse={json:(body,init)=>Response.json(body,init)};',
 };
 for(const [entry,name] of [['lib/stock-report.ts','report'],['lib/stock-report-data.ts','data'],['app/api/reports/stock/route.ts','route'],['app/stock-reports.tsx','ui']]) {
  await build({entryPoints:[root+entry],outfile:temp+'/'+name+'.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'runtime',setup(b){
   b.onResolve({filter:/^(cloudflare:workers|@\/db|@\/app\/chatgpt-auth|next\/server)$/},args=>({path:args.path,namespace:'test'}));
   b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:shims[args.path],loader:'js'}));
  }}]});
 }
 const report=await import(pathToFileURL(temp+'/report.mjs'));
 const {stockReportData}=await import(pathToFileURL(temp+'/data.mjs'));
 const {GET}=await import(pathToFileURL(temp+'/route.mjs'));
 const snapshot=await stockReportData('U');
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
 console.log('PASS: full D1 inventory beyond 100 rows, tenant isolation, active membership, HTTP authentication/no-cache, stock filters, unique products, CSV quoting/formula safety, escaped print output, mounted report presets/preview/download and error recovery');
} finally {
 if(renderer)await act(async()=>renderer.unmount());
 await mf.dispose();fs.rmSync(temp,{recursive:true,force:true});
 globalThis.fetch=originalFetch;delete globalThis.window;delete globalThis.document;delete globalThis.__reportDb;delete globalThis.__reportUser;
}
