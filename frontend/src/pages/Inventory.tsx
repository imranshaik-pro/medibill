import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '@/services/api'

type Product = { id:number; product_name:string; product_code:string }
type Batch = { id:number; product_id:number; batch_number:string; expiry_date:string; manufacturing_date?:string; mrp:string|number; purchase_rate:string|number; is_active:boolean }
type Stock = { id:number; product_id:number; batch_id:number; product_name:string; product_code:string; batch_number:string; expiry_date:string; quantity_on_hand:number; quantity_reserved:number; quantity_available:number }

const emptyForm = { product_id:'', batch_number:'', manufacturing_date:'', expiry_date:'', mrp:'', purchase_rate:'' }

export default function Inventory() {
  const [products,setProducts] = useState<Product[]>([])
  const [batches,setBatches] = useState<Batch[]>([])
  const [stock,setStock] = useState<Stock[]>([])
  const [productId,setProductId] = useState('')
  const [search,setSearch] = useState('')
  const [showBatch,setShowBatch] = useState(false)
  const [showAdjust,setShowAdjust] = useState(false)
  const [batchForm,setBatchForm] = useState(emptyForm)
  const [adjust,setAdjust] = useState({product_id:'',batch_id:'',quantity:'',transaction_type:'ADJUSTMENT',unit_cost:''})
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [p,b,s] = await Promise.all([apiClient.listMasterData('products'), apiClient.listBatches(productId || undefined), apiClient.listStock(productId || undefined, true)])
      setProducts(p); setBatches(b); setStock(s)
    } catch(e:any) { setError(e?.response?.data?.detail || 'Unable to load inventory') }
    finally { setLoading(false) }
  }
  useEffect(()=>{load()},[productId])

  const visibleStock = useMemo(()=>stock.filter(x=>`${x.product_name} ${x.product_code} ${x.batch_number}`.toLowerCase().includes(search.toLowerCase())),[stock,search])
  const expiring = useMemo(()=>batches.filter(b=>{const d=(new Date(b.expiry_date).getTime()-Date.now())/86400000; return d>=0 && d<=90}),[batches])

  const submitBatch = async(e:React.FormEvent) => { e.preventDefault(); setError(''); try { await apiClient.createBatch(batchForm); setShowBatch(false); setBatchForm(emptyForm); await load() } catch(e:any){setError(e?.response?.data?.detail || 'Unable to create batch')} }
  const submitAdjust = async(e:React.FormEvent) => { e.preventDefault(); setError(''); try { await apiClient.adjustStock({...adjust, product_id:Number(adjust.product_id), batch_id:Number(adjust.batch_id), quantity:Number(adjust.quantity), unit_cost:adjust.unit_cost ? Number(adjust.unit_cost):undefined}); setShowAdjust(false); setAdjust({product_id:'',batch_id:'',quantity:'',transaction_type:'ADJUSTMENT',unit_cost:''}); await load() } catch(e:any){setError(e?.response?.data?.detail || 'Unable to adjust stock')} }

  return <div className="min-h-screen bg-gray-50 p-6">
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-center justify-between"><div><h1 className="text-2xl font-bold text-gray-900">Inventory & Batches</h1><p className="text-sm text-gray-500">Track stock by batch and monitor expiry dates.</p></div><div className="flex gap-2"><button onClick={()=>setShowBatch(true)} className="rounded bg-blue-600 px-4 py-2 text-white">+ Batch</button><button onClick={()=>setShowAdjust(true)} className="rounded bg-gray-900 px-4 py-2 text-white">Adjust Stock</button></div></div>
      {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="mb-4 grid gap-4 md:grid-cols-3"><div className="rounded-lg bg-white p-4 shadow-sm"><div className="text-sm text-gray-500">Stock lines</div><div className="text-2xl font-bold">{stock.length}</div></div><div className="rounded-lg bg-white p-4 shadow-sm"><div className="text-sm text-gray-500">Batches</div><div className="text-2xl font-bold">{batches.length}</div></div><div className="rounded-lg bg-white p-4 shadow-sm"><div className="text-sm text-gray-500">Expiring ≤ 90 days</div><div className="text-2xl font-bold">{expiring.length}</div></div></div>
      <div className="mb-4 flex gap-3"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search product or batch..." className="flex-1 rounded border px-3 py-2"/><select value={productId} onChange={e=>setProductId(e.target.value)} className="rounded border px-3 py-2"><option value="">All products</option>{products.map(p=><option key={p.id} value={p.id}>{p.product_name} ({p.product_code})</option>)}</select><button onClick={load} className="rounded border bg-white px-4 py-2">Refresh</button></div>
      {loading ? <div className="rounded bg-white p-8 text-center text-gray-500">Loading inventory...</div> : visibleStock.length===0 ? <div className="rounded bg-white p-8 text-center text-gray-500">No stock records found.</div> : <div className="overflow-x-auto rounded-lg bg-white shadow-sm"><table className="min-w-full text-left text-sm"><thead className="border-b bg-gray-50"><tr><th className="p-3">Product</th><th className="p-3">Batch</th><th className="p-3">Expiry</th><th className="p-3">On hand</th><th className="p-3">Reserved</th><th className="p-3">Available</th></tr></thead><tbody>{visibleStock.map(s=>{const days=Math.ceil((new Date(s.expiry_date).getTime()-Date.now())/86400000); return <tr key={s.id} className="border-b"><td className="p-3 font-medium">{s.product_name}<div className="text-xs text-gray-500">{s.product_code}</div></td><td className="p-3">{s.batch_number}</td><td className={`p-3 ${days<=90?'font-semibold':''}`}>{s.expiry_date}{days<0 && <span className="ml-2 text-red-600">Expired</span>}{days>=0&&days<=90&&<span className="ml-2 text-amber-600">{days}d</span>}</td><td className="p-3">{s.quantity_on_hand}</td><td className="p-3">{s.quantity_reserved}</td><td className="p-3 font-semibold">{s.quantity_available}</td></tr>})}</tbody></table></div>}

      {showBatch && <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4"><form onSubmit={submitBatch} className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"><h2 className="mb-4 text-lg font-semibold">Create Batch</h2><div className="grid gap-3"><select required value={batchForm.product_id} onChange={e=>setBatchForm({...batchForm,product_id:e.target.value})} className="rounded border px-3 py-2"><option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.product_name} ({p.product_code})</option>)}</select><input required placeholder="Batch number" value={batchForm.batch_number} onChange={e=>setBatchForm({...batchForm,batch_number:e.target.value})} className="rounded border px-3 py-2"/><div className="grid grid-cols-2 gap-3"><input type="date" value={batchForm.manufacturing_date} onChange={e=>setBatchForm({...batchForm,manufacturing_date:e.target.value})} className="rounded border px-3 py-2"/><input required type="date" value={batchForm.expiry_date} onChange={e=>setBatchForm({...batchForm,expiry_date:e.target.value})} className="rounded border px-3 py-2"/><input required type="number" step="0.01" min="0" placeholder="MRP" value={batchForm.mrp} onChange={e=>setBatchForm({...batchForm,mrp:e.target.value})} className="rounded border px-3 py-2"/><input required type="number" step="0.01" min="0" placeholder="Purchase rate" value={batchForm.purchase_rate} onChange={e=>setBatchForm({...batchForm,purchase_rate:e.target.value})} className="rounded border px-3 py-2"/></div></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setShowBatch(false)} className="rounded border px-4 py-2">Cancel</button><button className="rounded bg-blue-600 px-4 py-2 text-white">Create</button></div></form></div>}

      {showAdjust && <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4"><form onSubmit={submitAdjust} className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"><h2 className="mb-4 text-lg font-semibold">Adjust Stock</h2><div className="grid gap-3"><select required value={adjust.product_id} onChange={e=>setAdjust({...adjust,product_id:e.target.value,batch_id:''})} className="rounded border px-3 py-2"><option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.product_name}</option>)}</select><select required value={adjust.batch_id} onChange={e=>setAdjust({...adjust,batch_id:e.target.value})} className="rounded border px-3 py-2"><option value="">Select batch</option>{batches.filter(b=>String(b.product_id)===adjust.product_id).map(b=><option key={b.id} value={b.id}>{b.batch_number} — exp {b.expiry_date}</option>)}</select><input required type="number" placeholder="Quantity (+ receipt / - issue)" value={adjust.quantity} onChange={e=>setAdjust({...adjust,quantity:e.target.value})} className="rounded border px-3 py-2"/><input type="number" step="0.01" min="0" placeholder="Unit cost (optional)" value={adjust.unit_cost} onChange={e=>setAdjust({...adjust,unit_cost:e.target.value})} className="rounded border px-3 py-2"/></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setShowAdjust(false)} className="rounded border px-4 py-2">Cancel</button><button className="rounded bg-gray-900 px-4 py-2 text-white">Apply adjustment</button></div></form></div>}
    </div>
  </div>
}
