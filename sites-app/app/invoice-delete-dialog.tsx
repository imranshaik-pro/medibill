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
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="entry-dialog" style={{width:"min(520px, calc(100vw - 2rem))",maxHeight:"85vh"}}><DialogHeader><DialogTitle>Delete {target.kind==="sale"?"sales":"purchase"} invoice {target.invoiceNo}?</DialogTitle><DialogDescription>{target.kind==="sale"?"Billed and free quantities will be returned to their original stock batches.":"Received billed and free quantities will be removed from stock. Deletion is blocked if insufficient stock remains."} The invoice will leave the active ledger. A recovery backup and audit record will be retained. Payments or linked returns must be reconciled first.</DialogDescription></DialogHeader><div style={{display:"grid",gap:16,padding:"20px 24px 24px",background:"#ffffff",color:"#172b2a"}}><label style={{display:"grid",gap:8,fontWeight:600}}>Reason for deletion<Input value={reason} maxLength={300} disabled={busy} onChange={e=>setReason(e.target.value)} placeholder="For example: Duplicate test invoice"/></label>{error&&<p role="alert" style={{margin:0,padding:12,border:"1px solid #fecaca",borderRadius:8,background:"#fef2f2",color:"#991b1b",fontSize:14}}>{error}</p>}<div style={{display:"flex",flexWrap:"wrap",justifyContent:"flex-end",gap:12}}><Button type="button" variant="outline" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minHeight:44,padding:"10px 18px",border:"1px solid #bfcfcb",borderRadius:8,background:"#ffffff",color:"#172b2a",fontWeight:600,cursor:busy?"wait":"pointer"}} disabled={busy} onClick={onClose}>Cancel</Button><Button type="button" variant="destructive" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,minHeight:44,padding:"10px 18px",border:"1px solid #b91c1c",borderRadius:8,background:"#b91c1c",color:"#ffffff",fontWeight:700,opacity:busy||reason.trim().length<3?0.55:1,cursor:busy?"wait":"pointer"}} disabled={busy||reason.trim().length<3} onClick={remove}><Trash2 size={18} style={{width:18,height:18,flexShrink:0}}/>{busy?"Deleting & syncing…":"Confirm delete"}</Button></div></div></DialogContent></Dialog>;
}
