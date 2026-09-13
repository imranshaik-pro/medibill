import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient, ExpiryDashboard } from '@/services/api'

const money=(v:string|number)=>Number(v||0).toFixed(2)

export default function ExpiryManagement(){
  const [data,setData]=useState<ExpiryDashboard|null>(null)
  const [maxDays,setMaxDays]=useState(180)
  const [includeExpired,setIncludeExpired]=useState(true)
  const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  const load=async()=>{setLoading(true);setError('');try{setData(await apiClient.getExpiryDashboard(maxDays,includeExpired))}catch(e:any){setError(e?.response?.data?.detail||'Unable to load expiry dashboard')}finally{setLoading(false)}}
  useEffect(()=>{load()},[maxDays,includeExpired])
  const rows=useMemo(()=>{const q=search.trim().toLowerCase();return (data?.rows||[]).filter(r=>!q||r.product_name.toLowerCase().includes(q)||r.product_code.toLowerCase().includes(q)||r.batch_number.toLowerCase().includes(q))},[data,search])

  return <div className="min-h-screen bg-gray-50 p-6"><div className="mx-auto max-w-7xl">
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h1 className="text-2xl font-bold">Expiry Management</h1><p className="text-sm text-gray-500">Monitor expired and near-expiry batch stock before it becomes a loss.</p></div><div className="flex gap-2"><Link to="/inventory" className="rounded border bg-white px-4 py-2">Inventory</Link><Link to="/dashboard" className="rounded bg-gray-900 px-4 py-2 text-white">Dashboard</Link></div></div>
    {error&&<div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Card label="Expired" value={data?.expired_count||0}/><Card label="Within 30 days" value={data?.within_30_count||0}/><Card label="31–60 days" value={data?.days_31_60_count||0}/><Card label="61–90 days" value={data?.days_61_90_count||0}/><Card label="91–180 days" value={data?.days_91_180_count||0}/></div>
    <div className="mb-4 flex flex-col gap-3 rounded-lg bg-white p-4 shadow-sm md:flex-row md:items-center"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search product / code / batch" className="flex-1 rounded border px-3 py-2"/><select value={maxDays} onChange={e=>setMaxDays(Number(e.target.value))} className="rounded border px-3 py-2"><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>365 days</option></select><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeExpired} onChange={e=>setIncludeExpired(e.target.checked)}/> Include expired</label></div>
    <div className="overflow-hidden rounded-lg bg-white shadow-sm">{loading?<div className="p-8 text-center text-gray-500">Loading expiry stock...</div>:rows.length===0?<div className="p-8 text-center text-gray-500">No matching expiry stock.</div>:<div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50"><tr>{['Product','Batch','Expiry','Bucket','Qty','Purchase Value','MRP Value'].map(h=><th key={h} className="border-b p-3 text-left">{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.batch_id} className="border-b"><td className="p-3"><div className="font-medium">{r.product_name}</div><div className="text-xs text-gray-500">{r.product_code}</div></td><td className="p-3 font-medium">{r.batch_number}</td><td className="p-3">{r.expiry_date}<div className={`text-xs ${r.days_to_expiry<0?'text-red-600':r.days_to_expiry<=30?'text-amber-600':'text-gray-500'}`}>{r.days_to_expiry<0?`${Math.abs(r.days_to_expiry)} days expired`:`${r.days_to_expiry} days left`}</div></td><td className="p-3"><span className="rounded bg-gray-100 px-2 py-1 text-xs">{r.expiry_bucket.replaceAll('_',' ')}</span></td><td className="p-3">{r.quantity_available}</td><td className="p-3">₹{money(r.purchase_value)}</td><td className="p-3">₹{money(r.mrp_value)}</td></tr>)}</tbody></table></div>}</div>
  </div></div>
}

function Card({label,value}:{label:string;value:number}){return <div className="rounded-lg border bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>}
