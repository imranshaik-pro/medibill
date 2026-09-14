import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient, SalesInvoice } from '@/services/api'

export default function InvoiceDocuments(){
 const [rows,setRows]=useState<SalesInvoice[]>([]);const [search,setSearch]=useState('');const [loading,setLoading]=useState(true);const [error,setError]=useState('')
 const load=async()=>{setLoading(true);setError('');try{setRows(await apiClient.listSales(search?{search}:undefined))}catch(e:any){setError(e?.response?.data?.detail||'Unable to load invoices')}finally{setLoading(false)}}
 useEffect(()=>{load()},[])
 return <div className="min-h-screen bg-gray-50 p-6"><div className="mx-auto max-w-6xl">
  <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Invoice Print & Reprint</h1><p className="text-sm text-gray-500">Open any posted sales invoice in the pharma A4 tax-invoice or compact receipt layout and print/save it as PDF.</p></div><div className="flex gap-2"><Link to="/document-settings" className="rounded border bg-white px-4 py-2">Invoice Settings</Link><Link to="/dashboard" className="rounded border bg-white px-4 py-2">Dashboard</Link></div></div>
  <div className="mb-4 flex gap-2 rounded bg-white p-4 shadow-sm"><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')load()}} placeholder="Search invoice number or customer" className="flex-1 rounded border px-3 py-2"/><button onClick={load} className="rounded bg-blue-700 px-4 py-2 text-white">Search</button></div>
  {error&&<div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}
  <div className="overflow-hidden rounded bg-white shadow-sm">{loading?<div className="p-8 text-center text-gray-500">Loading...</div>:rows.length===0?<div className="p-8 text-center text-gray-500">No invoices found.</div>:<div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="border-b bg-gray-50"><tr><th className="p-3 text-left">Date</th><th className="p-3 text-left">Invoice</th><th className="p-3 text-left">Customer</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Balance</th><th className="p-3 text-left">Status</th><th className="p-3 text-right">Document</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-b"><td className="p-3">{r.invoice_date}</td><td className="p-3 font-semibold">{r.invoice_number}</td><td className="p-3">{r.customer_name}</td><td className="p-3 text-right">₹{Number(r.grand_total).toLocaleString('en-IN',{minimumFractionDigits:2})}</td><td className="p-3 text-right">₹{Number(r.balance_due).toLocaleString('en-IN',{minimumFractionDigits:2})}</td><td className="p-3">{r.payment_status}</td><td className="p-3 text-right"><Link to={`/sales/${r.id}/print`} className="rounded bg-gray-900 px-3 py-2 text-white">Print / Reprint</Link></td></tr>)}</tbody></table></div>}</div>
 </div></div>
}
