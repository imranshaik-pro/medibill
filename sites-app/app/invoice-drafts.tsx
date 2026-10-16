"use client";
import { useEffect, useState } from "react";
import { listInvoiceDrafts, type InvoiceDraft } from "@/lib/invoice-drafts";
import { Button } from "@/components/ui/button";

export function InvoiceDrafts({scope, resume}:{scope?:string;resume:(invoiceId:string|null)=>void}) {
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
  if(!drafts.length) return null;
  return <section className="panel p-4 mb-4" aria-label="Invoice drafts">
    <h2>Unfinished invoice drafts</h2>
    <p>Saved in this browser for your signed-in workspace. Drafts do not change stock.</p>
    {drafts.map(draft => <div key={draft.invoiceId || "new"} className="flex items-center justify-between gap-3 py-2">
      <span>{draft.invoiceId ? draft.state.invoiceLabel || "Invoice edit" : "New invoice"} · {draft.state.rows.length} rows · {new Date(draft.updatedAt).toLocaleString()}</span>
      <Button type="button" variant="outline" onClick={() => resume(draft.invoiceId)}>Resume draft</Button>
    </div>)}
  </section>;
}
