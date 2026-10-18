import { documentRequests } from "../db/schema";

export class DocumentRequestError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
type Member = {id: string; tenantId: string; status: string};
export type DocumentOperation = {
  receipt: (db: any, result: unknown) => any[];
};
function canonical(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export async function runDocumentRequest<T>(db: D1Database, member: Member | null, kind: string,
  key: string | null, input: unknown, create: (operation: DocumentOperation) => Promise<T>) {
  if (!member || member.status !== 'active') throw new DocumentRequestError('Active agency membership required',403);
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new DocumentRequestError('A valid Idempotency-Key is required. Refresh the application before saving.',400);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(input))))].map(b=>b.toString(16).padStart(2,'0')).join('');
  async function replay(): Promise<{found: boolean; result?: T}> {
    const row = await db.prepare('SELECT payload_hash,result_json FROM document_requests WHERE tenant_id=? AND user_id=? AND kind=? AND request_key=?')
      .bind(member!.tenantId,member!.id,kind,key).first<{payload_hash:string;result_json:string}>();
    if (!row) return {found:false};
    if (row.payload_hash !== hash) throw new DocumentRequestError('This save key was already used for different details. Start a new save.');
    const result = JSON.parse(row.result_json);
    const table = {sale:"invoices",purchase:"purchase_inwards",legacy_purchase:"purchases",payment:"payments"}[kind as 'sale'|'purchase'|'legacy_purchase'|'payment'];
    if (!table) throw new DocumentRequestError("Unknown document operation",400);
    if (!await db.prepare(`SELECT id FROM ${table} WHERE tenant_id=? AND id=?`).bind(member!.tenantId,result.id).first())
      throw new DocumentRequestError("This earlier save was deleted or removed by a restore. Review the ledger before starting a new entry.");
    return {found:true,result};
  }
  const existing = await replay();
  if (existing.found) return existing.result as T;
  const operation: DocumentOperation = {receipt: (orm,result) => [orm.insert(documentRequests).values({
    id:crypto.randomUUID(),tenantId:member.tenantId,userId:member.id,kind,requestKey:key,
    payloadHash:hash,resultJson:JSON.stringify(result),createdAt:Date.now(),
  })]};
  try { return await create(operation); }
  catch (error) {
    // A competing request may have committed first. Its complete result is atomic
    // with the invoice, stock and balance changes; the losing batch rolls back.
    const saved = await replay();
    if (saved.found) return saved.result as T;
    throw error;
  }
}
