"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
export type DeleteTarget = { id: string; invoiceNo: string; kind: "sale" | "purchase" };
export function InvoiceDeleteDialog({target,onClose,onDeleted}:{target:DeleteTarget;onClose:()=>void;onDeleted:(message:string)=>void}) {
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function remove() {
    if(busy)return;
    if(reason.trim().length<3){setError("Enter a brief reason for deleting this invoice.");return;}
    setBusy(true);setError("");
    try {
      const base=target.kind==="sale"?"invoices":"purchase-inwards";
      const response=await fetch(`/api/${base}/${target.id}`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({confirm_delete:true,reason:reason.trim()})});
      const out=await response.json() as {error?:string;message:string};
      if(!response.ok)throw new Error(out.error||"Unable to delete invoice.");
      onDeleted(out.message);onClose();
    } catch(error) {setError(error instanceof Error?error.message:"Unable to delete invoice. Please try again.");}
    finally {setBusy(false);}
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="entry-dialog" style={{maxWidth:520}}><DialogHeader><DialogTitle>Delete {target.kind==="sale"?"sales":"purchase"} invoice {target.invoiceNo}?</DialogTitle><DialogDescription>{target.kind==="sale"?"Billed and free quantities will be returned to their original stock batches.":"Received billed and free quantities will be removed from stock. Deletion is blocked if insufficient stock remains."} The invoice will leave the active ledger. A recovery backup and audit record will be retained. Payments or linked returns must be reconciled first.</DialogDescription></DialogHeader><label>Reason for deletion<Input value={reason} maxLength={300} disabled={busy} onChange={e=>setReason(e.target.value)} placeholder="For example: Duplicate test invoice"/></label>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<div className="row-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="button" variant="destructive" disabled={busy||reason.trim().length<3} onClick={remove}><Trash2/>{busy?"Deleting & syncing…":"Confirm delete"}</Button></div></DialogContent></Dialog>;
}
