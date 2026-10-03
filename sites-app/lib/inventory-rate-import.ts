type Member = { id: string; tenantId: string; role: string; status: string };
export type RateSource = { sourceRow: number; product: string; pack: string; rate: string | number; mrp: string | number; originalRate?: string | number; rateDivisor?: number; unit?: 'strip' | 'original' | 'review'; adjustmentNote?: string };
type Batch = { id: string; name: string; master_name?: string | null; product_master_id?: string | null; pack: string; mrp: number; purchase_rate: number; batch: string };
type Catalog = { id: string; name: string };
export class RateImportError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}
const nameKey = (value: string) => value.normalize('NFKC').replace(/[‐‑–—]/g, '-').trim().replace(/\s+/g, ' ').toUpperCase();
const amount = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const s = String(value).trim();
  // No correction of OCR fragments, comma placement, currencies or joined numbers.
  if (!/^\d+(?:\.\d{1,6})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n <= 100000000 ? n : null;
};
const isCharge = (name: string) => /^(?:ADD\b|AUTO(?:\/|\b)|COURIER\b|FREIGHT\b|INSURANCE\b)/i.test(name.trim());
// Call once on unadjusted source rows. Explicit unit metadata prevents double conversion.
export function adjustBoxRates(rows: RateSource[]): RateSource[] {
  return rows.map(row => {
    if (row.unit) return row;
    const originalRate = row.rate;
    if (isCharge(row.product) || !/\b(?:TAB(?:LET)?S?|CAP(?:SULE)?S?|SOFTGELS?)\b/i.test(row.product)) return { ...row, originalRate, rateDivisor: 1, unit: 'original', adjustmentNote: 'Original listed rate retained; not a tablet/capsule box conversion' };
    const main = row.pack.split('/')[0].trim();
    // Only clearly separated dimensions, such as 10*10, 10 15, or 10*1*10.
    // Concatenated numbers and displaced suffixes are never repaired by guessing.
    if (!/^\d+(?:(?:\s*[xX×*]\s*|\s+)\d+){1,2}$/.test(main)) return { ...row, originalRate, unit: 'review', adjustmentNote: 'Ambiguous tablet/capsule pack; confirm strips per box manually' };
    const dimensions = main.split(/\s*[xX×*]\s*|\s+/).map(Number);
    const unitsPerStrip = dimensions.at(-1)!;
    const divisor = dimensions.slice(0,-1).reduce((n,d)=>n*d,1);
    if (dimensions.some(n=>n<=0) || unitsPerStrip > 30 || divisor > 1000 || amount(originalRate) === null) return { ...row, originalRate, unit: 'review', adjustmentNote: 'Bottle/bulk/invalid pack or rate; confirm billing unit manually' };
    return { ...row, originalRate, rate: Number((amount(originalRate)! / divisor).toFixed(6)).toString(), rateDivisor: divisor, unit: 'strip', adjustmentNote: `Box rate divided by ${divisor} strips per box; ${unitsPerStrip} tablets/capsules per strip` };
  });
}
const packKey = (value: string) => {
  const parts = value.normalize('NFKC').trim().toUpperCase().split('/');
  const base = parts.shift()!.replace(/\s*(?:[X×*]|\s+)\s*(?=\d)/g, 'X').replace(/\s+/g, '');
  return { base, suffix: parts.join('/').replace(/\s+/g, '') };
};
const compatiblePack = (a: string, b: string) => {
  if (!a.trim() || !b.trim()) return false;
  const x = packKey(a), y = packKey(b);
  return x.base === y.base && (!x.suffix || !y.suffix || x.suffix === y.suffix);
};
export function buildRatePlan(rows: RateSource[], batches: Batch[], catalog: Catalog[]) {
  const updates: Array<{ id: string; product: string; batch: string; pack: string; mrp: number; oldRate: number; newRate: number; sourceRows: number[]; unit?: string; originalRate?: string | number; rateDivisor?: number }> = [];
  const issues: Array<{ sourceRow: number; product: string; pack: string; rate: string | number; mrp: string | number; status: string; reason: string; batchId?: string }> = [];
  const valid = rows.filter(row => {
    if (isCharge(row.product)) {
      issues.push({ ...row, status: 'excluded_charge', reason: 'Additional charge, not a product rate' }); return false;
    }
    if (row.unit === 'review') { issues.push({ ...row, status: 'unit_review', reason: row.adjustmentNote || 'Confirm the billing unit and conversion manually' }); return false; }
    if (amount(row.rate) === null || amount(row.mrp) === null || amount(row.mrp) === 0) {
      issues.push({ ...row, status: 'invalid_source', reason: 'Rate/MRP must be an unambiguous numeric value and MRP must be positive' }); return false;
    }
    return true;
  });
  const allNames = new Set([...catalog.map(p => nameKey(p.name)), ...batches.flatMap(p => [nameKey(p.name), ...(p.master_name ? [nameKey(p.master_name)] : [])])]);
  for (const row of rows) if (!isCharge(row.product) && !allNames.has(nameKey(row.product))) {
    issues.push({ ...row, status: 'unmatched', reason: 'Product name not present in current agency catalog or inventory; no fuzzy matching performed' });
  }
  const seenSources = new Set<number>();
  for (const batch of batches) {
    const names = new Set([nameKey(batch.name), ...(batch.master_name ? [nameKey(batch.master_name)] : [])]);
    const named = valid.filter(r => names.has(nameKey(r.product)));
    for (const row of named) seenSources.add(row.sourceRow);
    if (!named.length) continue;
    const compatible = named.filter(r => compatiblePack(r.pack, batch.pack || '') && Math.abs(amount(r.mrp)! - Number(batch.mrp)) < 0.005);
    if (compatible.length) for (const row of named.filter(r => !compatible.includes(r))) issues.push({ ...row, batchId: batch.id, status: 'variant_review', reason: `Source variant does not match batch ${batch.batch || '(blank)'} Pack=${batch.pack}, MRP=${batch.mrp}` });
    if (!compatible.length) {
      for (const row of named) issues.push({ ...row, batchId: batch.id, status: 'pack_mrp_review', reason: `Batch ${batch.batch || '(blank)'}: application Pack=${batch.pack || '(missing)'}, MRP=${batch.mrp}. Pack/MRP mismatch or missing; no unit conversions guessed` });
      continue;
    }
    const rates = new Set(compatible.map(r => amount(r.rate)!));
    if (rates.size !== 1) {
      for (const row of compatible) issues.push({ ...row, batchId: batch.id, status: 'conflicting_rates', reason: 'Multiple different rates for the same product, compatible pack and MRP; choose a rate manually' });
      continue;
    }
    const newRate = [...rates][0];
    if (newRate > Number(batch.mrp)) {
      for (const row of compatible) issues.push({ ...row, batchId: batch.id, status: 'unit_review', reason: 'Rate exceeds application MRP; confirm whether rate is per carton, strip or individual unit' });
      continue;
    }
    if (Number(batch.purchase_rate) !== newRate) updates.push({ id: batch.id, product: batch.name, batch: batch.batch, pack: batch.pack, mrp: Number(batch.mrp), oldRate: Number(batch.purchase_rate), newRate, sourceRows: compatible.map(r => r.sourceRow), unit: compatible[0].unit, originalRate: compatible[0].originalRate, rateDivisor: compatible[0].rateDivisor });
    else for (const row of compatible) issues.push({ ...row, batchId: batch.id, status: 'already_current', reason: 'Rate already equals source value' });
  }
  for (const row of valid) if (allNames.has(nameKey(row.product)) && !seenSources.has(row.sourceRow)) {
    issues.push({ ...row, status: 'no_batch', reason: 'Present in Product Master but no inventory batch exists; no placeholder batch created' });
  }
  return { updates, issues, summary: { sourceRows: rows.length, batchesToUpdate: updates.length, unmatchedProducts: new Set(issues.filter(x => x.status === 'unmatched').map(x => nameKey(x.product))).size, reviewEntries: issues.filter(x => !['excluded_charge','already_current','unmatched'].includes(x.status)).length } };
}
function validateRows(input: unknown): RateSource[] {
  if (!Array.isArray(input) || !input.length || input.length > 1000) throw new RateImportError('Provide 1–1000 source rows.', 400);
  const seen = new Set<number>();
  return input.map((row: unknown) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new RateImportError('Invalid source row.',400);
    const r = row as Record<string,unknown>;
    if (!Number.isSafeInteger(r.sourceRow) || Number(r.sourceRow) < 1 || seen.has(Number(r.sourceRow)) || typeof r.product !== 'string' || !r.product.trim() || r.product.length > 300 || typeof r.pack !== 'string' || r.pack.length > 200 || !['number','string'].includes(typeof r.rate) || !['number','string'].includes(typeof r.mrp) || String(r.rate).length > 80 || String(r.mrp).length > 80) throw new RateImportError('Malformed or duplicate source row.',400);
    seen.add(Number(r.sourceRow));
    if (r.unit !== undefined && !['strip','original','review'].includes(String(r.unit))) throw new RateImportError('Invalid rate unit metadata.',400);
    if (r.originalRate !== undefined && ((!['number','string'].includes(typeof r.originalRate)) || String(r.originalRate).length > 80)) throw new RateImportError('Invalid original rate metadata.',400);
    if (r.rateDivisor !== undefined && (!Number.isSafeInteger(r.rateDivisor) || Number(r.rateDivisor) < 1 || Number(r.rateDivisor) > 1000)) throw new RateImportError('Invalid rate divisor.',400);
    if (r.adjustmentNote !== undefined && (typeof r.adjustmentNote !== 'string' || r.adjustmentNote.length > 400)) throw new RateImportError('Invalid adjustment note.',400);
    if (r.unit === 'strip' && (amount(r.originalRate) === null || !Number.isSafeInteger(r.rateDivisor) || Number(r.rateDivisor) < 1 || Number(r.rateDivisor) > 1000 || amount(r.rate) === null || Math.abs(amount(r.rate)! * Number(r.rateDivisor) - amount(r.originalRate)!) > 0.001)) throw new RateImportError('Adjusted rate does not reconcile to original box rate and divisor.',400);
    return { sourceRow: Number(r.sourceRow), product: r.product.trim(), pack: r.pack.trim(), rate: r.rate as string | number, mrp: r.mrp as string | number, ...(r.unit ? { unit: r.unit as RateSource['unit'], originalRate: r.originalRate as string | number, rateDivisor: r.rateDivisor as number | undefined, adjustmentNote: r.adjustmentNote as string | undefined } : {}) };
  });
}
export async function importInventoryRates(db: D1Database, member: Member | null, body: { rows?: unknown; sourceFile?: unknown; action?: unknown; planHash?: unknown; confirm_update?: unknown }, beforeUpdate: () => Promise<unknown>) {
  if (!member || member.status !== 'active' || !['admin','super_admin'].includes(member.role)) throw new RateImportError('Only an active agency administrator can import rates.',403);
  if (body.action !== 'preview' && body.action !== 'apply') throw new RateImportError('Choose preview or apply.',400);
  if (typeof body.sourceFile !== 'string' || body.sourceFile.length > 200 || !body.sourceFile.trim()) throw new RateImportError('A source filename is required.',400);
  const rows = validateRows(body.rows), tenant = member.tenantId;
  const [inventory, masters] = await Promise.all([
    db.prepare('SELECT p.*,m.name AS master_name FROM products p LEFT JOIN product_masters m ON m.id=p.product_master_id AND m.tenant_id=p.tenant_id WHERE p.tenant_id=? ORDER BY p.id').bind(tenant).all<Batch>(),
    db.prepare('SELECT id,name FROM product_masters WHERE tenant_id=? ORDER BY id').bind(tenant).all<Catalog>(),
  ]);
  const plan = buildRatePlan(rows, inventory.results, masters.results);
  const fingerprint = JSON.stringify({ tenant, rows, sourceFile: body.sourceFile, inventory: inventory.results, masters: masters.results });
  const planHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprint))),x=>x.toString(16).padStart(2,'0')).join('');
  if (body.action === 'preview') return { ...plan, planHash, applied: false };
  if (body.confirm_update !== true) throw new RateImportError('Explicit update confirmation is required.',400);
  if (body.planHash !== planHash) throw new RateImportError('The source or inventory changed since preview. Preview again before applying.');
  if (!plan.updates.length) return { ...plan, planHash, applied: true, updated: 0, message: 'No safe rate changes available; review the report.' };
  const backup = await beforeUpdate();
  // D1 batch is atomic. A NOT NULL audit guard aborts all changes on any stale input.
  const sourceSnapshot = JSON.stringify(inventory.results.map(({ master_name, ...p }) => p));
  const masterSnapshot = JSON.stringify(masters.results);
  const details = JSON.stringify({ sourceFile: body.sourceFile, updates: plan.updates, summary: plan.summary, planHash });
  const conjunction = (parts: string[]): string => parts.length <= 1 ? (parts[0] || '1') : `(${conjunction(parts.slice(0,parts.length >> 1))} AND ${conjunction(parts.slice(parts.length >> 1))})`;
  const columns = Object.keys(inventory.results[0]).filter(k => k !== 'master_name');
  if (columns.some(k => !/^[a-z_]+$/.test(k))) throw new Error('Unexpected inventory schema column');
  const compare = conjunction(columns.map(k => `p.${k} IS json_extract(s.value,'$.${k}')`));
  const updatesJSON = JSON.stringify(plan.updates);
  try {
    await db.batch([
      db.prepare(`INSERT INTO audit_logs(id,tenant_id,user_id,action,details,created_at)
        SELECT CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=? AND tenant_id=? AND status='active' AND role IN ('admin','super_admin'))
        AND (SELECT COUNT(*) FROM products WHERE tenant_id=?)=json_array_length(?)
        AND NOT EXISTS(SELECT 1 FROM json_each(?) s LEFT JOIN products p ON p.id=json_extract(s.value,'$.id') AND p.tenant_id=? WHERE p.id IS NULL OR NOT ${compare})
        AND (SELECT COUNT(*) FROM product_masters WHERE tenant_id=?)=json_array_length(?)
        AND NOT EXISTS(SELECT 1 FROM json_each(?) s LEFT JOIN product_masters m ON m.id=json_extract(s.value,'$.id') AND m.tenant_id=? WHERE m.id IS NULL OR m.name IS NOT json_extract(s.value,'$.name'))
        THEN ? ELSE NULL END,?,?, 'inventory.rates_imported',?,?`).bind(member.id,tenant,tenant,sourceSnapshot,sourceSnapshot,tenant,tenant,masterSnapshot,masterSnapshot,tenant,crypto.randomUUID(),tenant,member.id,details,Date.now()),
      db.prepare(`UPDATE products SET purchase_rate=(SELECT json_extract(u.value,'$.newRate') FROM json_each(?) u WHERE json_extract(u.value,'$.id')=products.id) WHERE tenant_id=? AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?))`).bind(updatesJSON,tenant,updatesJSON),
    ]);
  } catch {
    console.error('Inventory rate import rolled back', { tenantId: tenant, rows: plan.updates.length });
    throw new RateImportError('No rates were changed. Inventory or permissions changed, or the transaction failed. Preview again.');
  }
  return { ...plan, planHash, applied: true, updated: plan.updates.length, backup, message: 'Inventory rates updated successfully. Packs, MRP, stock quantities and historical invoices preserved.' };
}
