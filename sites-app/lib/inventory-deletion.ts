type Member = { id: string; tenantId: string; role: string; status: string };
export class InventoryDeletionError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}
export async function deleteInventoryBatch(db: D1Database, member: Member | null, id: string, input: { confirm_delete?: boolean; reason?: string }, beforeDelete: () => Promise<unknown>) {
  if (!member || member.status !== 'active' || !['admin', 'super_admin'].includes(member.role)) throw new InventoryDeletionError('Only an active agency administrator can delete inventory batches.', 403);
  if (input.confirm_delete !== true) throw new InventoryDeletionError('Explicit deletion confirmation is required.', 400);
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < 3 || reason.length > 300) throw new InventoryDeletionError('Enter a deletion reason between 3 and 300 characters.', 400);
  const tenant = member.tenantId;
  const row = await db.prepare('SELECT * FROM products WHERE tenant_id=? AND id=?').bind(tenant, id).first<Record<string, unknown>>();
  if (!row) throw new InventoryDeletionError('Inventory batch not found in your agency.', 404);
  if (Number(row.stock) !== 0 || Number(row.physical_stock || 0) !== 0) throw new InventoryDeletionError('Cannot delete a batch with remaining stock. Record a stock adjustment with a reason first.');
  const linked = async (table: string) => db.prepare(`SELECT id FROM ${table} WHERE tenant_id=? AND product_id=? LIMIT 1`).bind(tenant, id).first();
  for (const table of ['invoice_lines', 'purchase_inward_items', 'purchases']) if (await linked(table)) throw new InventoryDeletionError('Cannot delete a batch linked to sales or purchase history. Resolve the linked sample invoices first.');
  await beforeDelete();
  const conjunction = (parts: string[]): string => parts.length <= 1 ? (parts[0] || '1') : `(${conjunction(parts.slice(0, Math.floor(parts.length / 2)))} AND ${conjunction(parts.slice(Math.floor(parts.length / 2)))})`;
  const unchanged = conjunction(Object.keys(row).map(key => {
    if (!/^[a-z_]+$/.test(key)) throw new Error('Unexpected inventory schema column');
    return `p.${key} IS json_extract(snapshot.value,'$.${key}')`;
  }));
  // Archive the batch and its adjustments in the same transaction that removes it.
  // Commit-time checks prevent concurrent stock changes, new links, or role changes.
  const auditId = crypto.randomUUID();
  const now = Date.now();
  try {
    await db.batch([
      db.prepare(`INSERT INTO audit_logs(id,tenant_id,user_id,action,details,created_at)
        SELECT CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=? AND tenant_id=? AND status='active' AND role IN ('admin','super_admin'))
        AND p.stock=0 AND COALESCE(p.physical_stock,0)=0 AND ${unchanged}
        AND NOT EXISTS(SELECT 1 FROM invoice_lines WHERE tenant_id=? AND product_id=?)
        AND NOT EXISTS(SELECT 1 FROM purchase_inward_items WHERE tenant_id=? AND product_id=?)
        AND NOT EXISTS(SELECT 1 FROM purchases WHERE tenant_id=? AND product_id=?)
        THEN ? ELSE NULL END,?,?, 'inventory.batch_deleted',
        json_object('reason',?,'batch',json(?),'adjustments',json(COALESCE((SELECT json_group_array(json_object('id',id,'tenant_id',tenant_id,'product_id',product_id,'batch',batch,'previous_stock',previous_stock,'new_stock',new_stock,'delta',delta,'reason',reason,'user_id',user_id,'created_at',created_at)) FROM stock_adjustments WHERE tenant_id=? AND product_id=?),'[]'))),?
        FROM products p CROSS JOIN (SELECT ? AS value) snapshot WHERE p.tenant_id=? AND p.id=?
        UNION ALL SELECT NULL,?,?, 'inventory.batch_deleted','{}',? WHERE NOT EXISTS(SELECT 1 FROM products WHERE tenant_id=? AND id=?)`).bind(member.id,tenant,tenant,id,tenant,id,tenant,id,auditId,tenant,member.id,reason,JSON.stringify(row),tenant,id,now,JSON.stringify(row),tenant,id,tenant,member.id,now,tenant,id),
      db.prepare('DELETE FROM stock_adjustments WHERE tenant_id=? AND product_id=?').bind(tenant, id),
      db.prepare('DELETE FROM products WHERE tenant_id=? AND id=?').bind(tenant, id),
    ]);
  } catch (error) {
    console.error('Inventory batch deletion transaction failed', { tenantId: tenant, productId: id, error: error instanceof Error ? error.message : 'Unknown error' });
    throw new InventoryDeletionError('Nothing was deleted. The batch changed, gained invoice links, or the database could not complete the transaction. Refresh and try again.');
  }
  return { id, deleted: true, message: 'Inventory batch deleted successfully. Product Master preserved.' };
}
