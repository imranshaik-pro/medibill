import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '@/services/api'

type Tab = 'customers' | 'categories' | 'manufacturers' | 'products'

export default function MasterData() {
  const [tab, setTab] = useState<Tab>('customers')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    try { setItems(await apiClient.listMasterData(tab)) }
    catch (e: any) { setError(e.response?.data?.detail || 'Unable to load data') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [tab])

  const filtered = useMemo(() => items.filter((item) =>
    JSON.stringify(item).toLowerCase().includes(search.toLowerCase())
  ), [items, search])

  const title = tab.charAt(0).toUpperCase() + tab.slice(1)
  return <div className="min-h-screen bg-gray-50">
    <header className="bg-white border-b"><div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
      <div><Link to="/dashboard" className="text-sm text-blue-600">← Dashboard</Link><h1 className="text-2xl font-bold text-gray-900">Master Data</h1></div>
      <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">+ Add {tab === 'customers' ? 'Customer' : tab === 'products' ? 'Product' : tab.slice(0, -1)}</button>
    </div></header>
    <main className="max-w-7xl mx-auto px-4 py-6">
      <div className="bg-white rounded-lg border p-2 flex gap-2 mb-4 overflow-x-auto">
        {(['customers','categories','manufacturers','products'] as Tab[]).map(t => <button key={t} onClick={() => {setTab(t); setSearch('')}} className={`px-4 py-2 rounded-md capitalize ${tab === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{t}</button>)}
      </div>
      <div className="bg-white rounded-lg border p-4">
        <div className="flex gap-3 mb-4"><input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${title.toLowerCase()}...`} className="w-full max-w-md px-3 py-2 border rounded-md"/><button onClick={load} className="px-4 py-2 border rounded-md">Refresh</button></div>
        {error && <div className="p-3 mb-4 bg-red-50 text-red-700 rounded">{error}</div>}
        {loading ? <p className="p-6 text-gray-500">Loading...</p> : filtered.length === 0 ? <p className="p-6 text-gray-500 text-center">No {title.toLowerCase()} found.</p> : <div className="overflow-x-auto"><table className="w-full text-left"><thead className="border-b"><tr>{Object.keys(filtered[0]).filter(k => !['id','company_id','created_at','updated_at'].includes(k)).slice(0,6).map(k => <th key={k} className="p-3 text-xs uppercase text-gray-500">{k.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{filtered.map(item => <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">{Object.keys(filtered[0]).filter(k => !['id','company_id','created_at','updated_at'].includes(k)).slice(0,6).map(k => <td key={k} className="p-3 text-sm">{String(item[k] ?? '-')}</td>)}</tr>)}</tbody></table></div>}
      </div>
    </main>
    {showForm && <SimpleForm tab={tab} onClose={() => setShowForm(false)} onSaved={() => {setShowForm(false); load()}} />}
  </div>
}

function SimpleForm({tab,onClose,onSaved}:{tab:Tab;onClose:()=>void;onSaved:()=>void}) {
  const [data,setData]=useState<Record<string,string>>({})
  const fields: Record<Tab,string[]> = {customers:['customer_code','customer_name','phone','email','gstin','state','pincode','credit_limit','credit_days'],categories:['category_name','description'],manufacturers:['manufacturer_name','contact_person','phone','email'],products:['product_code','product_name','generic_name','brand_name','hsn_code','gst_rate','unit','pack_size','default_mrp','default_selling_price','reorder_level','category_id','manufacturer_id']}
  const [error,setError]=useState('')
  const submit=async(e:any)=>{e.preventDefault();setError('');try{await apiClient.createMasterData(tab,data);onSaved()}catch(err:any){setError(err.response?.data?.detail||'Unable to save')}}
  return <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4"><form onSubmit={submit} className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"><div className="flex justify-between mb-5"><h2 className="text-xl font-bold">Add {tab.slice(0,-1)}</h2><button type="button" onClick={onClose}>✕</button></div>{error&&<div className="p-3 mb-4 bg-red-50 text-red-700 rounded">{error}</div>}<div className="grid sm:grid-cols-2 gap-4">{fields[tab].map(field=><label key={field} className="text-sm font-medium capitalize">{field.replaceAll('_',' ')}<input required={['customer_name','category_name','manufacturer_name','product_name'].includes(field)} value={data[field]||''} onChange={e=>setData({...data,[field]:e.target.value})} className="mt-1 w-full px-3 py-2 border rounded-md" /></label>)}</div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="px-4 py-2 border rounded-md">Cancel</button><button className="px-4 py-2 bg-blue-600 text-white rounded-md">Save</button></div></form></div>
}
