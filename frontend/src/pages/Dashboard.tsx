import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { apiClient, DashboardSummary } from '@/services/api'

const rupees=(v:string|number|undefined)=>`₹${Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [summary,setSummary]=useState<DashboardSummary|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{apiClient.getDashboardSummary().then(setSummary).catch((e:any)=>setError(e?.response?.data?.detail||'Unable to load dashboard metrics'))},[])
  return <div className="min-h-screen bg-gray-50">
    <nav className="bg-white border-b"><div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center"><div><h1 className="text-2xl font-bold text-gray-900">MediBill</h1><p className="text-xs text-gray-500">Pharmaceutical Distribution Billing & Inventory</p></div><div className="flex items-center gap-4"><span className="text-gray-600">{user?.name}</span><button onClick={logout} className="px-4 py-2 border rounded-md hover:bg-gray-50">Logout</button></div></div></nav>
    <main className="max-w-7xl mx-auto py-8 px-4">
      {error&&<div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardCard title="Today's Sales" value={rupees(summary?.today_sales)} />
        <DashboardCard title="Monthly Sales" value={rupees(summary?.monthly_sales)} />
        <DashboardCard title="Outstanding Credit" value={rupees(summary?.total_receivables)} />
        <DashboardCard title="Supplier Payables" value={rupees(summary?.total_payables)} />
        <DashboardCard title="Stock Value" value={rupees(summary?.current_stock_value)} />
        <DashboardCard title="Today's Purchases" value={rupees(summary?.today_purchases)} />
        <DashboardCard title="Today's Collections" value={rupees(summary?.today_collections)} />
        <DashboardCard title="Low Stock Items" value={String(summary?.low_stock_items??0)} />
        <DashboardCard title="Near Expiry Batches" value={String(summary?.near_expiry_batches??0)} />
        <DashboardCard title="Expired Batches" value={String(summary?.expired_batches??0)} />
        <DashboardCard title="Stock Units" value={String(summary?.current_stock_units??0)} />
        <DashboardCard title="Today's Est. Gross Profit" value={rupees(summary?.today_estimated_gross_profit)} />
        <DashboardCard title="Total Sales" value={rupees(summary?.total_sales)} />
      </div>
      <section className="mt-8 bg-white rounded-lg border p-6"><h2 className="text-xl font-bold mb-4">Quick Actions</h2><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><ActionButton to="/master-data" label="Customers & Products" /><ActionButton to="/purchases" label="Purchases & Suppliers" /><ActionButton to="/inventory" label="Inventory & Batches" /><ActionButton to="/sales" label="Create Invoice" /><ActionButton to="/documents" label="Invoice Print & Reprint" /><ActionButton to="/document-settings" label="Invoice & Print Settings" /><ActionButton to="/returns" label="Sales & Purchase Returns" /><ActionButton to="/receivables" label="Receivables & Payments" /><ActionButton to="/accounting" label="Accounting, Payables & GST" /><ActionButton to="/expiry" label="Expiry Management" /><ActionButton to="/reports" label="Advanced Reports & Analytics" /><ActionButton to="/admin" label="Administration & Audit" /></div></section>
    </main></div>
}
function DashboardCard({title,value}:{title:string;value:string}){return <div className="bg-white rounded-lg border p-6"><h3 className="text-gray-500 text-sm font-semibold">{title}</h3><p className="text-3xl font-bold text-gray-900 mt-2">{value}</p></div>}
function ActionButton({label,to}:{label:string;to:string}){return <Link to={to} className="px-4 py-3 bg-blue-600 text-white rounded-md text-center hover:bg-blue-700">{label}</Link>}
