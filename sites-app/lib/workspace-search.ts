export type SearchResult = { id: string; kind: string; page: string; title: string; subtitle: string; query: string; record: Record<string, unknown> };
const sources = [
 { table:'product_masters', kind:'Product Master', page:'catalog', title:'name', subtitle:"COALESCE(composition,'') || ' · MFR: ' || COALESCE(manufacturer,'') || ' · HSN: ' || COALESCE(hsn,'')", fields:['name','composition','manufacturer','hsn'], query:'name' },
 { table:'products', kind:'Inventory batch', page:'inventory', title:'name', subtitle:"'Batch: ' || batch || ' · Expiry: ' || expiry || ' · Available: ' || stock", fields:['name','batch','manufacturer','hsn','pack'], query:'batch' },
 { table:'customers', kind:'Customer', page:'customers', title:'name', subtitle:"COALESCE(city,'') || ' · GSTIN: ' || COALESCE(gstin,'') || ' · DL: ' || COALESCE(dl_no,'') || ' · Phone: ' || COALESCE(phone,'')", fields:['name','legal_name','trade_name','gstin','dl_no','phone','address','city'], query:'name' },
 { table:'suppliers', kind:'Supplier', page:'payables', title:'name', subtitle:"COALESCE(city,'') || ' · GSTIN: ' || COALESCE(gstin,'') || ' · DL: ' || COALESCE(dl_no,'') || ' · Phone: ' || COALESCE(phone,'')", fields:['name','legal_name','trade_name','gstin','dl_no','phone','address','city'], query:'name' },
 { table:'invoices', kind:'Sales invoice', page:'sales', title:'invoice_no', subtitle:"customer_name || ' · ' || invoice_date || ' · ₹' || amount || ' · ' || status", fields:['invoice_no','customer_name','invoice_date'], query:'invoice_no' },
 { table:'purchase_inwards', kind:'Purchase invoice', page:'purchases', title:"COALESCE(NULLIF(invoice_no,''),inward_no)", subtitle:"supplier_name || ' · ' || COALESCE(invoice_date,'') || ' · ₹' || grand_total || ' · ' || status", fields:['invoice_no','order_no','inward_no','supplier_name','invoice_date'], query:"COALESCE(NULLIF(invoice_no,''),inward_no)" },
];
export async function searchWorkspace(db: D1Database, tenantId: string, input: string) {
 const q=input.trim().replace(/\s+/g,' ');
 if(q.length>120)throw new Error('Search is limited to 120 characters.');
 if(q.length<2)return {results:[] as SearchResult[],hasMore:false};
 const tokens=q.toLowerCase().split(' ').slice(0,10);
 const groups=await Promise.all(sources.map(async source=>{
  const text=source.fields.map(field=>`COALESCE(${field},'')`).join(" || ' ' || ");
  // instr treats %, _, quotes and backslashes literally, avoiding LIKE wildcards.
  const where=tokens.map(()=>`instr(lower(${text}),?)>0`).join(' AND ');
  const extra=source.table==='purchase_inwards'?',(SELECT COUNT(*) FROM purchase_inward_items i WHERE i.tenant_id=purchase_inwards.tenant_id AND i.inward_id=purchase_inwards.id) AS total_items':'';
  const out=await db.prepare(`SELECT *,${source.title} AS title,${source.subtitle} AS subtitle,${source.query} AS query ${extra} FROM ${source.table} WHERE tenant_id=? AND ${where} ORDER BY created_at DESC,id LIMIT 21`).bind(tenantId,...tokens).all<Record<string,unknown> & {id:string;title:string;subtitle:string;query:string}>();
  return {more:out.results.length>20,rows:out.results.slice(0,20).map(row=>{
   const {title,subtitle,query,...fields}=row;
   const record=Object.fromEntries(Object.entries(fields).map(([key,value])=>[key.replace(/_([a-z])/g,(_,letter:string)=>letter.toUpperCase()),value]));
   return {id:row.id,title,subtitle,query,record,kind:source.kind,page:source.page};
  })};
 }));
 return {results:groups.flatMap(g=>g.rows),hasMore:groups.some(g=>g.more)};
}
