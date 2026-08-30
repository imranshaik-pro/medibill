import React from 'react'
import { useAuth } from '@/context/AuthContext'

export default function Dashboard() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">MediBill</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">Welcome, {user?.name}</span>
            <button
              onClick={logout}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardCard title="Total Sales" value="₹0" />
          <DashboardCard title="Today's Sales" value="₹0" />
          <DashboardCard title="Outstanding Credit" value="₹0" />
          <DashboardCard title="Current Stock" value="0" />
        </div>

        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ActionButton label="Create Invoice" />
            <ActionButton label="View Invoices" />
            <ActionButton label="Manage Customers" />
            <ActionButton label="Manage Products" />
            <ActionButton label="Inventory" />
            <ActionButton label="Reports" />
          </div>
        </div>
      </main>
    </div>
  )
}

function DashboardCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-gray-600 text-sm font-semibold">{title}</h3>
      <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
    </div>
  )
}

function ActionButton({ label }: { label: string }) {
  return (
    <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
      {label}
    </button>
  )
}
