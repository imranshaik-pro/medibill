"use client";
import { useEffect, useState } from "react";
import { listInvoiceDrafts, removeInvoiceDraft, type InvoiceDraft } from "@/lib/invoice-drafts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function InvoiceDrafts({scope, resume}:{scope?:string;resume:(invoiceId:string|null)=>void}) {
  const [target,setTarget] = useState<InvoiceDraft|null>(null);
  const [error,setError] = useState("");
  const [drafts,setDrafts] = useState<InvoiceDraft[]>([]);
  useEffect(() => {
    const refresh = () => {
      try { setDrafts(scope ? listInvoiceDrafts(window.localStorage,scope) : []); }
      catch { setDrafts([]); }
    };
    refresh();
    window.addEventListener("storage",refresh);
    window.addEventListener("medibill-drafts-changed",refresh);
    return () => { window.removeEventListener("storage",refresh); window.removeEventListener("medibill-drafts-changed",refresh); };
  },[scope]);
  function deleteDraft() {
    if (!scope || !target || target.scope !== scope) return;
    try {
      removeInvoiceDraft(window.localStorage, scope, target.invoiceId, target.generation);
      setDrafts(listInvoiceDrafts(window.localStorage, scope)); setTarget(null); setError("");
      window.dispatchEvent(new Event("medibill-drafts-changed"));
    } catch(e) { setError(e instanceof Error ? e.message : "Unable to delete draft."); }
  }
  if(!drafts.length) return null;
  return <section className="panel p-4 mb-4" aria-label="Invoice drafts">
    <h2>Unfinished invoice drafts</h2>
    <p>Saved in this browser for your signed-in workspace. Drafts do not change stock.</p>
    {drafts.map(draft => <div key={draft.invoiceId || "new"} className="flex items-center justify-between gap-3 py-2">
      <span>{draft.invoiceId ? draft.state.invoiceLabel || "Invoice edit" : "New invoice"} · {draft.state.rows.length} rows · {new Date(draft.updatedAt).toLocaleString()}</span>
      <Button type="button" variant="outline" onClick={() => resume(draft.invoiceId)}>Resume draft</Button><Button type="button" variant="outline" onClick={()=>{setError("");setTarget(draft)}}>Delete draft</Button>
    </div>)}
    <Dialog open={!!target} onOpenChange={open=>{if(!open)setTarget(null)}}><DialogContent><DialogHeader><DialogTitle>Delete this draft?</DialogTitle><DialogDescription>This permanently removes the unfinished entries from this browser. This does not cancel an invoice previously submitted to the server. Posted invoices, stock and accounts are unaffected.</DialogDescription></DialogHeader>{error&&<p role="alert">{error}</p>}<Button type="button" variant="outline" onClick={()=>setTarget(null)}>Keep draft</Button><Button type="button" onClick={deleteDraft}>Delete draft permanently</Button></DialogContent></Dialog>
  </section>;
}
