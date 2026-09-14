import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiClient, InvoiceDocument } from '@/services/api'

const money=(v:string|number|undefined)=>Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})
const shortDate=(v:string)=>{const [y,m,d]=v.split('-');return `${d}/${m}/${y}`}
const exp=(v:string)=>{const [y,m]=v.split('-');return `${m}/${y.slice(2)}`}

export default function InvoicePrint(){
  const { invoiceId }=useParams()
  const [doc,setDoc]=useState<InvoiceDocument|null>(null)
  const [mode,setMode]=useState<'invoice'|'receipt'>('invoice')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  useEffect(()=>{if(!invoiceId)return;apiClient.getInvoiceDocument(Number(invoiceId)).then(setDoc).catch((e:any)=>setError(e?.response?.data?.detail||'Unable to load invoice')).finally(()=>setLoading(false))},[invoiceId])
  if(loading)return <div className="p-8 text-center">Loading invoice...</div>
  if(error||!doc)return <div className="p-8 text-center text-red-700">{error||'Invoice not found'}</div>
  return <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
    <style>{`@media print{.no-print{display:none!important}.print-sheet{box-shadow:none!important;margin:0!important;width:100%!important;max-width:none!important}.page-break{page-break-before:always}} @page{size:A4;margin:8mm}`}</style>
    <div className="no-print mx-auto mb-4 flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-3">
      <div className="flex gap-2"><Link to="/sales" className="rounded border bg-white px-4 py-2">← Sales</Link><button onClick={()=>setMode('invoice')} className={`rounded px-4 py-2 ${mode==='invoice'?'bg-blue-700 text-white':'border bg-white'}`}>Tax Invoice</button><button onClick={()=>setMode('receipt')} className={`rounded px-4 py-2 ${mode==='receipt'?'bg-blue-700 text-white':'border bg-white'}`}>Order-style Receipt</button></div>
      <button onClick={()=>window.print()} className="rounded bg-gray-900 px-5 py-2 text-white">Print / Save PDF</button>
    </div>
    {mode==='invoice'?<TaxInvoice doc={doc}/>:<CompactReceipt doc={doc}/>} 
  </div>
}

function TaxInvoice({doc}:{doc:InvoiceDocument}){
 const c=doc.company
 return <div className="print-sheet mx-auto max-w-[1120px] bg-white p-4 text-[11px] leading-tight shadow print:p-0">
   <div className="border border-black">
    <div className="grid grid-cols-[1fr_330px] border-b border-black">
      <div className="p-2"><div className="text-2xl font-black tracking-wide">{c.legal_name||c.company_name}</div><div className="text-sm font-semibold">Pharmaceutical & Medical Distribution</div><div>{[c.address,c.city,c.state,c.pincode].filter(Boolean).join(', ')}</div><div>Phone: {c.phone||'-'} {c.email?` · ${c.email}`:''}</div></div>
      <div className="grid grid-cols-2 border-l border-black"><div className="p-2 font-semibold">GSTIN</div><div className="p-2">{c.gstin||'-'}</div><div className="border-t border-black p-2 font-semibold">DL 20B</div><div className="border-t border-black p-2">{c.drug_license_20b||'-'}</div><div className="border-t border-black p-2 font-semibold">DL 21B</div><div className="border-t border-black p-2">{c.drug_license_21b||'-'}</div><div className="border-t border-black p-2 font-semibold">State / Code</div><div className="border-t border-black p-2">{c.state||'-'} {c.state_code?`/ ${c.state_code}`:''}</div></div>
    </div>
    <div className="border-b border-black py-1 text-center text-lg font-black">TAX INVOICE</div>
    <div className="grid grid-cols-2 border-b border-black">
      <div className="p-2"><div className="font-bold">To: {doc.customer_name}</div><div>{doc.customer_address||'-'}</div><div>Phone: {doc.customer_phone||'-'}</div><div>GSTIN: {doc.customer_gstin||'-'}</div><div>D.L. No.: {doc.customer_drug_license||'-'}</div><div>State: {doc.customer_state||'-'} {doc.customer_state_code?`/ ${doc.customer_state_code}`:''}</div></div>
      <div className="grid grid-cols-[120px_1fr] border-l border-black"><div className="p-2 font-semibold">Invoice No.</div><div className="p-2 font-bold">{doc.invoice_number}</div><div className="border-t border-black p-2 font-semibold">Date</div><div className="border-t border-black p-2">{shortDate(doc.invoice_date)}</div><div className="border-t border-black p-2 font-semibold">Pay Type</div><div className="border-t border-black p-2">{doc.pay_type}</div><div className="border-t border-black p-2 font-semibold">Balance Due</div><div className="border-t border-black p-2">₹{money(doc.balance_due)}</div></div>
    </div>
    <table className="w-full border-collapse text-[10px]"><thead><tr className="bg-gray-200">{['Sno','HSN','Product Description','Pack','MFG','Batch-No','ExpDt.','Qty','Free','DS%','Rate','M.R.P','GST %','Amount'].map(h=><th key={h} className="border-b border-r border-black p-1 last:border-r-0">{h}</th>)}</tr></thead><tbody>{doc.lines.map(l=><tr key={l.sno}><td className="border-b border-r border-black p-1 text-center">{l.sno}</td><td className="border-b border-r border-black p-1">{l.hsn_code||''}</td><td className="border-b border-r border-black p-1 font-semibold">{l.product_name}</td><td className="border-b border-r border-black p-1">{l.pack||''}</td><td className="border-b border-r border-black p-1">{l.manufacturer||''}</td><td className="border-b border-r border-black p-1">{l.batch_number}</td><td className="border-b border-r border-black p-1">{exp(l.expiry_date)}</td><td className="border-b border-r border-black p-1 text-right">{l.quantity}</td><td className="border-b border-r border-black p-1 text-right">{l.free_quantity||''}</td><td className="border-b border-r border-black p-1 text-right">{Number(l.discount_percent)||''}</td><td className="border-b border-r border-black p-1 text-right">{money(l.rate)}</td><td className="border-b border-r border-black p-1 text-right">{money(l.mrp)}</td><td className="border-b border-r border-black p-1 text-right">{Number(l.gst_rate)}%</td><td className="border-b border-black p-1 text-right font-semibold">{money(l.net_amount)}</td></tr>)}</tbody></table>
    <div className="grid grid-cols-[1fr_360px] border-b border-black">
      <div className="p-2"><div className="grid grid-cols-2 gap-x-5"><div><span className="font-bold">GST breakup:</span> {Object.entries(doc.gst_rate_summary).map(([k,v])=>`${k}: ₹${money(v)}`).join(' · ')||'-'}</div><div>CGST: ₹{money(doc.cgst)} · SGST: ₹{money(doc.sgst)} · IGST: ₹{money(doc.igst)}</div></div><div className="mt-3 font-semibold">Bank Details</div><div>{c.bank_name||'-'} {c.bank_account_number?` · A/C: ${c.bank_account_number}`:''}</div><div>{c.bank_branch||''} {c.bank_ifsc?` · IFSC: ${c.bank_ifsc}`:''}</div></div>
      <div className="grid grid-cols-2 border-l border-black text-sm"><div className="p-1 font-semibold">Gross Amount</div><div className="p-1 text-right">₹{money(doc.subtotal)}</div><div className="p-1 font-semibold">Discount</div><div className="p-1 text-right">₹{money(doc.discount_total)}</div><div className="p-1 font-semibold">Taxable</div><div className="p-1 text-right">₹{money(doc.taxable_total)}</div><div className="p-1 font-semibold">Total GST</div><div className="p-1 text-right">₹{money(doc.total_gst)}</div><div className="p-1 font-semibold">Round Off</div><div className="p-1 text-right">₹{money(doc.round_off)}</div><div className="border-t border-black p-1 text-base font-black">Net Amount</div><div className="border-t border-black p-1 text-right text-base font-black">₹{money(doc.grand_total)}</div></div>
    </div>
    <div className="border-b border-black p-2 text-center"><span className="font-semibold">Amount in Words:</span> {doc.amount_in_words}</div>
    <div className="grid grid-cols-[1fr_380px] min-h-28">
      <div className="p-2"><div className="font-bold">Terms & Conditions</div><div className="whitespace-pre-line">{c.invoice_terms||'Goods once sold will be accepted for return only as per company policy. Please verify batch, quantity and expiry at delivery.'}</div>{c.jurisdiction&&<div className="mt-1">All disputes subject to {c.jurisdiction} jurisdiction.</div>}{doc.notes&&<div className="mt-2"><b>Invoice Note:</b> {doc.notes}</div>}</div>
      <div className="border-l border-black p-2 text-center"><div className="font-bold">For {c.legal_name||c.company_name}</div><div className="h-14"></div><div className="font-semibold">{c.authorized_signatory||'Authorized Signatory'}</div></div>
    </div>
   </div>
 </div>
}

function CompactReceipt({doc}:{doc:InvoiceDocument}){
 const c=doc.company
 return <div className="print-sheet mx-auto max-w-[900px] bg-white p-6 text-[11px] shadow print:p-0">
   <div className="border-2 border-black p-3">
    <div className="text-center"><div className="text-2xl font-black">{c.legal_name||c.company_name}</div><div>{[c.address,c.city,c.state,c.pincode].filter(Boolean).join(', ')}</div><div>GST: {c.gstin||'-'} · DL: {[c.drug_license_20b,c.drug_license_21b].filter(Boolean).join(' / ')||'-'}</div><div className="my-2 text-lg font-black">SALES ORDER / RECEIPT</div></div>
    <div className="grid grid-cols-2 border-y border-black py-2"><div><b>{doc.customer_name}</b><div>{doc.customer_address}</div><div>DL: {doc.customer_drug_license||'-'} · GST: {doc.customer_gstin||'-'}</div></div><div className="text-right"><div><b>Reference:</b> {doc.invoice_number}</div><div><b>Date:</b> {shortDate(doc.invoice_date)}</div><div><b>Pay Type:</b> {doc.pay_type}</div></div></div>
    <table className="mt-2 w-full border-collapse"><thead><tr className="bg-cyan-100">{['S.','Product','HSN','Pack','Mfr.','Batch','Exp.','Qty','MRP','Rate','GST','Amount'].map(h=><th key={h} className="border border-black p-1">{h}</th>)}</tr></thead><tbody>{doc.lines.map(l=><tr key={l.sno}><td className="border-x border-black p-1">{l.sno}</td><td className="border-r border-black p-1 font-semibold">{l.product_name}</td><td className="border-r border-black p-1">{l.hsn_code}</td><td className="border-r border-black p-1">{l.pack}</td><td className="border-r border-black p-1">{l.manufacturer}</td><td className="border-r border-black p-1">{l.batch_number}</td><td className="border-r border-black p-1">{exp(l.expiry_date)}</td><td className="border-r border-black p-1 text-right">{l.quantity}{l.free_quantity?`+${l.free_quantity}`:''}</td><td className="border-r border-black p-1 text-right">{money(l.mrp)}</td><td className="border-r border-black p-1 text-right">{money(l.rate)}</td><td className="border-r border-black p-1 text-right">{Number(l.gst_rate)}%</td><td className="border-r border-black p-1 text-right">{money(l.net_amount)}</td></tr>)}</tbody></table>
    <div className="mt-3 grid grid-cols-[1fr_280px] border-t border-black pt-2"><div><div className="font-semibold">{doc.amount_in_words}</div><div className="mt-3 whitespace-pre-line">{c.invoice_terms||''}</div></div><div className="grid grid-cols-2 text-sm"><div>Sub Total</div><div className="text-right">₹{money(doc.taxable_total)}</div><div>GST</div><div className="text-right">₹{money(doc.total_gst)}</div><div>Round Off</div><div className="text-right">₹{money(doc.round_off)}</div><div className="border-t border-black pt-1 text-base font-black">GRAND TOTAL</div><div className="border-t border-black pt-1 text-right text-base font-black">₹{money(doc.grand_total)}</div></div></div>
    <div className="mt-6 flex justify-between"><div>{c.bank_name&&<>Bank: {c.bank_name} · A/C {c.bank_account_number} · IFSC {c.bank_ifsc}</>}</div><div className="font-bold">{c.authorized_signatory||'Authorized signatory'}</div></div>
   </div>
 </div>
}
