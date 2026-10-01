type Member = { id: string; tenantId: string; role: string; status: string };
type DeleteInput = { confirm_delete?: boolean; reason?: string };
type Kind = 'sale' | 'purchase';
type RecordRow = Record<string, any>;

export class InvoiceDeletionError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}

export async function nextDocumentNumber(db: D1Database, tenantId: string, kind: Kind, prefix: string) {
  const table = kind === 'sale' ? 'invoices' : 'purchase_inwards';
  const column = kind === 'sale' ? 'invoice_no' : 'inward_no';
  const live = await db.prepare(`SELECT ${column} AS number FROM ${table} WHERE tenant_id=?`).bind(tenantId).all<{number:string}>();
  const archived = await db.prepare(`SELECT json_extract(details, '$.header.${column}') AS number FROM audit_logs WHERE tenant_id=? AND action=? AND json_valid(details)`).bind(tenantId, `${kind}.deleted`).all<{number:string}>();
  let max = 0;
  for (const row of [...live.results, ...archived.results]) {
    if (typeof row.number !== 'string' || !row.number.startsWith(prefix)) continue;
    const suffix = row.number.slice(prefix.length);
    if (/^\d+$/.test(suffix)) max = Math.max(max, Number(suffix));
  }
  return prefix + String(max + 1).padStart(4, '0');
}

export async function deleteInvoiceRecord(
  db: D1Database, member: Member | null, kind: Kind, id: string,
  input: DeleteInput, beforeDelete: () => Promise<unknown>,
) {
  if (!member || member.status !== 'active') throw new InvoiceDeletionError('Active agency membership required.', 403);
  if (!['admin', 'super_admin'].includes(member.role)) throw new InvoiceDeletionError('Only an agency administrator can delete invoices.', 403);
  if (input?.confirm_delete !== true) throw new InvoiceDeletionError('Explicit deletion confirmation is required.', 400);
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < 3 || reason.length > 300) throw new InvoiceDeletionError('Enter a deletion reason between 3 and 300 characters.', 400);
  const tenant = member.tenantId;
  const table = kind === 'sale' ? 'invoices' : 'purchase_inwards';
  const lineTable = kind === 'sale' ? 'invoice_lines' : 'purchase_inward_items';
  const parentColumn = kind === 'sale' ? 'invoice_id' : 'inward_id';
  const partyColumn = kind === 'sale' ? 'customer_id' : 'supplier_id';
  const quantityColumn = kind === 'sale' ? 'quantity' : 'billed_quantity';
  const amountColumn = kind === 'sale' ? 'amount' : 'grand_total';
  const header = await db.prepare(`SELECT * FROM ${table} WHERE tenant_id=? AND id=?`).bind(tenant,id).first<RecordRow>();
  if (!header) throw new InvoiceDeletionError('Invoice not found in your agency.',404);
  const lines = (await db.prepare(`SELECT * FROM ${lineTable} WHERE tenant_id=? AND ${parentColumn}=?`).bind(tenant,id).all<RecordRow>()).results;
  if (!lines.length) throw new InvoiceDeletionError('This invoice has no stock lines. Verify or repair the record before deleting it.');
  const charges = kind === 'purchase' ? (await db.prepare('SELECT * FROM purchase_charges WHERE tenant_id=? AND inward_id=?').bind(tenant,id).all<RecordRow>()).results : [];
  const partyId = header[partyColumn];
  const partyTable = kind === 'sale' ? 'customers' : 'suppliers';
  const party = partyId ? await db.prepare(`SELECT * FROM ${partyTable} WHERE tenant_id=? AND id=?`).bind(tenant,partyId).first<RecordRow>() : null;
  if (partyId && !party) throw new InvoiceDeletionError('The invoice party is missing. Repair the ledger before deleting.');
  const references = [...new Set([id,header.invoice_no,header.inward_no,header.order_no].filter(Boolean))];
  const refSlots = references.map(() => '?').join(',');
  const linkedReturns = await db.prepare(`SELECT id FROM returns WHERE tenant_id=? AND reference_no IN (${refSlots}) LIMIT 1`).bind(tenant,...references).first();
  if (linkedReturns) throw new InvoiceDeletionError('Cannot delete an invoice with a linked return. Resolve the return first.');
  // Party-level payments cannot be safely allocated to one invoice in this schema.
  if (partyId && await db.prepare('SELECT id FROM payments WHERE tenant_id=? AND party_id=? LIMIT 1').bind(tenant,partyId).first())
    throw new InvoiceDeletionError('Cannot delete while this party has recorded payments. Reconcile those payments first.');
  const quantities = new Map<string, number>();
  for (const line of lines) {
    const billed=Number(line[quantityColumn]), free=Number(line.free_quantity || 0);
    if (!Number.isSafeInteger(billed) || !Number.isSafeInteger(free) || billed<0 || free<0)
      throw new InvoiceDeletionError('Invalid invoice quantities. Repair the record before deleting.');
    quantities.set(line.product_id,(quantities.get(line.product_id)||0)+billed+free);
  }
  const batches: RecordRow[] = [];
  for (const [productId, quantity] of quantities) {
    const product=await db.prepare('SELECT * FROM products WHERE tenant_id=? AND id=?').bind(tenant,productId).first<RecordRow>();
    if (!product) throw new InvoiceDeletionError('An invoice batch is missing. Repair the stock ledger before deleting.');
    if (kind==='purchase' && product.stock<quantity)
      throw new InvoiceDeletionError(`Cannot delete purchase: ${product.name} batch ${product.batch} needs ${quantity} units but only ${product.stock} remain. Stock has already been sold or adjusted.`);
    batches.push(product);
  }
  const due=header.status==='Paid'?0:Number(header[amountColumn]);
  if (!Number.isFinite(due) || due<0) throw new InvoiceDeletionError('Invalid invoice amount. Repair the record before deleting.');
  if (party && party.outstanding+0.005<due) throw new InvoiceDeletionError('Party balance is below this invoice balance. Reconcile the ledger before deleting.');
  await beforeDelete(); // Abort without mutations if a recovery snapshot cannot be created.
  const prepare=(sql:string,...values:any[])=>db.prepare(sql).bind(...values);
  const guards:string[] = [
    `EXISTS(SELECT 1 FROM users WHERE id=? AND tenant_id=? AND status='active' AND role IN ('admin','super_admin'))`,
    `EXISTS(SELECT 1 FROM ${table} WHERE tenant_id=? AND id=? AND ${partyColumn} IS ? AND ${amountColumn}=? AND status=?)`,
    `(SELECT COUNT(*) FROM ${lineTable} WHERE tenant_id=? AND ${parentColumn}=?)=?`,
    `NOT EXISTS(SELECT 1 FROM returns WHERE tenant_id=? AND reference_no IN (${refSlots}))`,
  ];
  const guardValues:any[] = [member.id,tenant,tenant,id,partyId,header[amountColumn],header.status,tenant,id,lines.length,tenant,...references];
  // Compare complete snapshots at commit time without one bind per item.
  const columnMatch=(row:RecordRow,alias:string,json:string)=>Object.keys(row).map(key=>{
    if(!/^[a-z_]+$/.test(key))throw new Error("Unexpected schema column");
    return `${alias}.${key} IS json_extract(${json},'$.${key}')`;
  }).join(' AND ');
  guards.push(`EXISTS(SELECT 1 FROM ${table} h CROSS JOIN (SELECT ? AS value) snapshot WHERE h.tenant_id=? AND h.id=? AND ${columnMatch(header,'h','snapshot.value')})`);
  guardValues.push(JSON.stringify(header),tenant,id);
  guards.push(`NOT EXISTS(SELECT 1 FROM ${lineTable} l WHERE l.tenant_id=? AND l.${parentColumn}=? AND NOT EXISTS(SELECT 1 FROM json_each(?) snapshot WHERE ${columnMatch(lines[0],'l','snapshot.value')}))`);
  guardValues.push(tenant,id,JSON.stringify(lines));
  if(kind==='purchase') {
    guards.push('(SELECT COUNT(*) FROM purchase_charges WHERE tenant_id=? AND inward_id=?)=?');
    guardValues.push(tenant,id,charges.length);
    if(charges.length) {
      guards.push(`NOT EXISTS(SELECT 1 FROM purchase_charges c WHERE c.tenant_id=? AND c.inward_id=? AND NOT EXISTS(SELECT 1 FROM json_each(?) snapshot WHERE ${columnMatch(charges[0],'c','snapshot.value')}))`);
      guardValues.push(tenant,id,JSON.stringify(charges));
    }
  }
  guards.push(`NOT EXISTS(SELECT 1 FROM json_each(?) q WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.tenant_id=? AND p.id=json_extract(q.value,'$.id') ${kind==='purchase'?"AND p.stock>=json_extract(q.value,'$.quantity')":""}))`);
  guardValues.push(JSON.stringify([...quantities].map(([id,quantity])=>({id,quantity}))),tenant);
  guards.push(`EXISTS(SELECT 1 FROM ${table} WHERE tenant_id=? AND id=? AND ${kind==='sale'?'invoice_no':'inward_no'}=?)`);
  guardValues.push(tenant,id,kind==='sale'?header.invoice_no:header.inward_no);

  if(partyId) {
    guards.push('NOT EXISTS(SELECT 1 FROM payments WHERE tenant_id=? AND party_id=?)');
    guardValues.push(tenant,partyId);
    guards.push(`EXISTS(SELECT 1 FROM ${partyTable} WHERE tenant_id=? AND id=? AND outstanding>=?)`);
    guardValues.push(tenant,partyId,Math.max(0,due-0.005));
  }
  const now=Date.now(), auditId=crypto.randomUUID();
  // audit_logs.id is NOT NULL. A failed guard aborts the entire D1 batch transaction,
  // including concurrent deletes, changed stock lines, payments and permissions.
  const statements = [prepare(
    `INSERT INTO audit_logs(id,tenant_id,user_id,action,details,created_at) VALUES(CASE WHEN ${guards.join(' AND ')} THEN ? ELSE NULL END,?,?,?,?,?)`,
    ...guardValues,auditId,tenant,member.id,`${kind}.deleted`,JSON.stringify({reason,header,items:lines,charges}),now,
  )];
  for(const product of batches) {
    const quantity=quantities.get(product.id)!;
    const delta=kind==='sale'?quantity:-quantity;
    statements.push(prepare('INSERT INTO stock_adjustments(id,tenant_id,product_id,batch,previous_stock,new_stock,delta,reason,user_id,created_at) SELECT ?,tenant_id,id,batch,stock,stock+?,?,?, ?,? FROM products WHERE tenant_id=? AND id=?',crypto.randomUUID(),delta,delta,`${kind} invoice deleted: ${header.invoice_no||header.inward_no} · ${reason}`,member.id,now,tenant,product.id));
    statements.push(prepare('UPDATE products SET stock=stock+?,physical_stock=MAX(0,(stock+?)*MAX(1,pack_multiplier)) WHERE tenant_id=? AND id=?',delta,delta,tenant,product.id));
  }
  if(partyId && due) statements.push(prepare(`UPDATE ${partyTable} SET outstanding=MAX(0,ROUND(outstanding-?,2)) WHERE tenant_id=? AND id=?`,due,tenant,partyId));
  if(kind==='purchase')statements.push(prepare('DELETE FROM purchase_charges WHERE tenant_id=? AND inward_id=?',tenant,id));
  statements.push(prepare(`DELETE FROM ${lineTable} WHERE tenant_id=? AND ${parentColumn}=?`,tenant,id));
  statements.push(prepare(`DELETE FROM ${table} WHERE tenant_id=? AND id=?`,tenant,id));
  try { await db.batch(statements); }
  catch { throw new InvoiceDeletionError('Invoice changed or deletion could not complete. Nothing was deleted. Refresh and try again; check stock, payments and returns.'); }
  return { id, deleted:true, invoiceNo:header.invoice_no||header.inward_no, message:`${kind==='sale'?'Sales':'Purchase'} invoice deleted and inventory synced successfully.` };
}
