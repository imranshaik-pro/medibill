import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function Dashboard() {
  const { user, logout } = useAuth()
  return <div className="min-h-screen bg-gray-50">
    <nav className="bg-white border-b"><div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center"><div><h1 className="text-2xl font-bold text-gray-900">MediBill</h1><p className="text-xs text-gray-500">Medical Agency Billing System</p></div><div className="flex items-center gap-4"><span className="text-gray-600">{user?.name}</span><button onClick={logout} className="px-4 py-2 border rounded-md hover:bg-gray-50">Logout</button></div></div></nav>
    <main className="max-w-7xl mx-auto py-8 px-4"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"><DashboardCard title="Total Sales" value="₹0" /><DashboardCard title="Today's Sales" value="₹0" /><DashboardCard title="Outstanding Credit" value="₹0" /><DashboardCard title="Current Stock" value="0" /></div>
      <section className="mt-8 bg-white rounded-lg border p-6"><h2 className="text-xl font-bold mb-4">Quick Actions</h2><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><ActionButton to="/master-data" label="Manage Customers" /><ActionButton to="/master-data" label="Manage Products" /><ActionButton to="/master-data" label="Categories & Manufacturers" /><ActionButton label="Create Invoice" disabled /><ActionButton to="/inventory" label="Inventory & Batches" /><ActionButton label="Reports" disabled /></div></section>
    </main></div>
}
function DashboardCard({title,value}:{title:string;value:string}){return <div className="bg-white rounded-lg border p-6"><h3 className="text-gray-500 text-sm font-semibold">{title}</h3><p className="text-3xl font-bold text-gray-900 mt-2">{value}</p></div>}
function ActionButton({label,to,disabled=false}:{label:string;to?:string;disabled?:boolean}){if(to)return <Link to={to} className="px-4 py-3 bg-blue-600 text-white rounded-md text-center hover:bg-blue-700">{label}</Link>;return <button disabled={disabled} className="px-4 py-3 bg-gray-200 text-gray-500 rounded-md cursor-not-allowed">{label}<span className="block text-xs">Coming soon</span></button>}
