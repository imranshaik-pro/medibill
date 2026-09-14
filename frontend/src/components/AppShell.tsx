import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  ArrowRightOnRectangleIcon,
  BanknotesIcon,
  Bars3Icon,
  ChartBarIcon,
  ClockIcon,
  Cog6ToothIcon,
  CubeIcon,
  DocumentTextIcon,
  HomeIcon,
  ReceiptPercentIcon,
  ShoppingCartIcon,
  Squares2X2Icon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/context/AuthContext'

const navigation = [
  { label: 'Dashboard', to: '/dashboard', icon: HomeIcon },
  { label: 'Sales & Billing', to: '/sales', icon: ReceiptPercentIcon },
  { label: 'Purchases', to: '/purchases', icon: ShoppingCartIcon },
  { label: 'Inventory', to: '/inventory', icon: CubeIcon },
  { label: 'Master Data', to: '/master-data', icon: Squares2X2Icon },
  { label: 'Receivables', to: '/receivables', icon: BanknotesIcon },
  { label: 'Accounting & GST', to: '/accounting', icon: DocumentTextIcon },
  { label: 'Expiry', to: '/expiry', icon: ClockIcon },
  { label: 'Returns', to: '/returns', icon: ShoppingCartIcon },
  { label: 'Invoices', to: '/documents', icon: DocumentTextIcon },
  { label: 'Reports', to: '/reports', icon: ChartBarIcon },
]

const secondaryNavigation = [
  { label: 'Administration', to: '/admin', icon: UsersIcon },
  { label: 'Print Settings', to: '/document-settings', icon: Cog6ToothIcon },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
      isActive
        ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
    }`

  const SidebarContent = () => (
    <>
      <div className="flex h-20 items-center gap-3 border-b border-slate-200 px-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-sm">M</div>
        <div className="min-w-0">
          <div className="text-lg font-extrabold tracking-tight text-slate-950">MediBill</div>
          <div className="truncate text-xs text-slate-500">Pharma Billing & Inventory</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Workspace</p>
        <nav className="space-y-1">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass} onClick={() => setMobileOpen(false)}>
              <item.icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="mb-2 mt-6 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Settings</p>
        <nav className="space-y-1">
          {secondaryNavigation.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass} onClick={() => setMobileOpen(false)}>
              <item.icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="border-t border-slate-200 p-4">
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700">
            {(user?.name || 'U').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
            <p className="truncate text-xs text-slate-500">Signed in</p>
          </div>
        </div>
        <button onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
          <ArrowRightOnRectangleIcon className="h-5 w-5" />
          Logout
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-slate-50 text-left">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close navigation" className="absolute inset-0 bg-slate-950/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-72 flex-col bg-white shadow-2xl">
            <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <XMarkIcon className="h-6 w-6" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button aria-label="Open navigation" onClick={() => setMobileOpen(true)} className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden">
              <Bars3Icon className="h-6 w-6" />
            </button>
            <div>
              <p className="text-sm font-semibold text-slate-900">Pharmaceutical Distribution</p>
              <p className="hidden text-xs text-slate-500 sm:block">Billing, stock, payments and compliance in one place</p>
            </div>
          </div>
          <NavLink to="/sales" className="medibill-btn-primary">New Sale</NavLink>
        </header>
        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  )
}
