export type InvoiceDraftState = {
  head: Record<string, any>;
  rows: Array<Record<string, any>>;
  acknowledged: string[];
  expectedRevision?: string;
  invoiceLabel?: string;
  pendingSave?: { body: string; key: string };
};
export type InvoiceDraft = {
  version: 1;
  scope: string;
  invoiceId: string | null;
  updatedAt: number;
  generation: string;
  state: InvoiceDraftState;
};
const prefix = "medibill:invoice-draft:v1:";
export const draftScope = (member: { id?: string; tenantId?: string }) =>
  member.id && member.tenantId ? JSON.stringify([member.tenantId, member.id]) : undefined;
export const draftKey = (scope: string, invoiceId: string | null) =>
  prefix + encodeURIComponent(scope) + ":" + encodeURIComponent(invoiceId ?? "new");
export function readInvoiceDraft(storage: Storage, scope: string, invoiceId: string | null): InvoiceDraft | null {
  const raw = storage.getItem(draftKey(scope, invoiceId));
  if (!raw) return null;
  const value = JSON.parse(raw) as InvoiceDraft;
  if (value.version !== 1 || value.scope !== scope || value.invoiceId !== invoiceId ||
      !Number.isFinite(value.updatedAt) || typeof value.generation !== "string" ||
      !value.state || typeof value.state.head !== "object" || !value.state.head ||
      !Array.isArray(value.state.rows) || value.state.rows.length > 500 ||
      value.state.rows.some(row => !row || typeof row !== "object") ||
      !Array.isArray(value.state.acknowledged)) throw new Error("This saved draft could not be read. Do not clear browser storage; copy your entries before starting again.");
  return value;
}
export function writeInvoiceDraft(storage: Storage, scope: string, invoiceId: string | null,
  state: InvoiceDraftState, expectedGeneration: string | null): InvoiceDraft {
  const current = readInvoiceDraft(storage, scope, invoiceId);
  if ((current?.generation ?? null) !== expectedGeneration)
    throw new Error("This draft changed in another tab. Your entries are still on screen; reopen the draft before continuing.");
  const draft: InvoiceDraft = { version: 1, scope, invoiceId, state, generation: crypto.randomUUID(), updatedAt: Date.now() };
  storage.setItem(draftKey(scope, invoiceId), JSON.stringify(draft));
  return draft;
}
export function removeInvoiceDraft(storage: Storage, scope: string, invoiceId: string | null, expectedGeneration: string | null) {
  const current = readInvoiceDraft(storage, scope, invoiceId);
  if ((current?.generation ?? null) !== expectedGeneration) throw new Error("Draft changed in another tab and was preserved.");
  storage.removeItem(draftKey(scope, invoiceId));
}
export function listInvoiceDrafts(storage: Storage, scope: string): InvoiceDraft[] {
  const drafts: InvoiceDraft[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix + encodeURIComponent(scope) + ":")) continue;
    try {
      const value = JSON.parse(storage.getItem(key) || "null") as InvoiceDraft;
      const draft = readInvoiceDraft(storage, scope, value.invoiceId);
      if (draft) drafts.push(draft);
    } catch { /* One damaged record must not hide other drafts. */ }
  }
  return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
}
