import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRightIcon,
  BanknotesIcon,
  ChartBarIcon,
  ClockIcon,
  CubeIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  ReceiptPercentIcon,
  ShoppingCartIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/context/AuthContext'
import { apiClient, DashboardSummary } from '@/services/api'

const rupees = (value: string | number | undefined) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

export default function Dashboard() {
  const { user } = useAuth()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiClient
      .getDashboardSummary()
      .then(setSummary)
      .catch((e: any) => setError(e?.response?.data?.detail || 'Unable to load dashboard metrics'))
  }, [])

  const firstName = user?.name?.split(' ')[0] || 'there'

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 px-6 py-7 text-white shadow-soft sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-100">Welcome back, {firstName}</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Run today's business from one screen</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
              Start billing, record purchases, check stock and follow pending payments without searching through multiple pages.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/sales" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-50">
              <ReceiptPercentIcon className="h-5 w-5" />
              Create Sale
            </Link>
            <Link to="/purchases" className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/20">
              <ShoppingCartIcon className="h-5 w-5" />
              Record Purchase
            </Link>
          </div>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Business overview</h2>
            <p className="mt-1 text-sm text-slate-500">Live operational numbers for your agency.</p>
          </div>
          <Link to="/reports" className="hidden items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700 sm:flex">
            View reports <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Today's Sales" value={rupees(summary?.today_sales)} icon={ReceiptPercentIcon} hint="Sales billed today" />
          <MetricCard title="Today's Collections" value={rupees(summary?.today_collections)} icon={BanknotesIcon} hint="Customer payments received" />
          <MetricCard title="Outstanding Credit" value={rupees(summary?.total_receivables)} icon={UserGroupIcon} hint="Pending customer receivables" attention={Number(summary?.total_receivables || 0) > 0} />
          <MetricCard title="Supplier Payables" value={rupees(summary?.total_payables)} icon={DocumentTextIcon} hint="Amount payable to suppliers" attention={Number(summary?.total_payables || 0) > 0} />
          <MetricCard title="Stock Value" value={rupees(summary?.current_stock_value)} icon={CubeIcon} hint={`${summary?.current_stock_units ?? 0} units currently in stock`} />
          <MetricCard title="Today's Purchases" value={rupees(summary?.today_purchases)} icon={ShoppingCartIcon} hint="Purchase value recorded today" />
          <MetricCard title="Monthly Sales" value={rupees(summary?.monthly_sales)} icon={ChartBarIcon} hint="Sales in the current month" />
          <MetricCard title="Today's Est. Gross Profit" value={rupees(summary?.today_estimated_gross_profit)} icon={ChartBarIcon} hint="Estimated before overheads" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="medibill-card p-5 sm:p-6 xl:col-span-2">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-slate-950">Quick actions</h2>
            <p className="mt-1 text-sm text-slate-500">Common daily tasks, arranged in the order most users need them.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ActionCard to="/sales" title="Create Sale Invoice" description="Bill a customer and reduce stock" icon={ReceiptPercentIcon} primary />
            <ActionCard to="/purchases" title="Record Purchase" description="Add supplier invoice and stock" icon={ShoppingCartIcon} />
            <ActionCard to="/inventory" title="Check Inventory" description="View batches and current stock" icon={CubeIcon} />
            <ActionCard to="/receivables" title="Collect Payment" description="Review dues and record receipt" icon={BanknotesIcon} />
            <ActionCard to="/documents" title="Print / Reprint Invoice" description="Open posted invoices for printing" icon={DocumentTextIcon} />
            <ActionCard to="/master-data" title="Customers & Products" description="Maintain business master data" icon={UserGroupIcon} />
          </div>
        </section>

        <section className="medibill-card p-5 sm:p-6">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-slate-950">Needs attention</h2>
            <p className="mt-1 text-sm text-slate-500">Items that may require action before billing.</p>
          </div>
          <div className="space-y-3">
            <AttentionRow label="Low stock items" value={summary?.low_stock_items ?? 0} to="/inventory" icon={CubeIcon} />
            <AttentionRow label="Near expiry batches" value={summary?.near_expiry_batches ?? 0} to="/expiry" icon={ClockIcon} />
            <AttentionRow label="Expired batches" value={summary?.expired_batches ?? 0} to="/expiry" icon={ExclamationTriangleIcon} danger />
          </div>
        </section>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SecondaryLink to="/returns" title="Returns" description="Sales and purchase returns" />
        <SecondaryLink to="/accounting" title="Accounting & GST" description="Payables, ledgers and GST summary" />
        <SecondaryLink to="/admin" title="Administration" description="Users, roles, audit and controls" />
      </section>
    </div>
  )
}

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
  attention = false,
}: {
  title: string
  value: string
  hint: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  attention?: boolean
}) {
  return (
    <div className="medibill-card p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${attention ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
          <Icon className="h-5 w-5" />
        </div>
        {attention && <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">Pending</span>}
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{hint}</p>
    </div>
  )
}

function ActionCard({
  to,
  title,
  description,
  icon: Icon,
  primary = false,
}: {
  to: string
  title: string
  description: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  primary?: boolean
}) {
  return (
    <Link
      to={to}
      className={`group rounded-2xl border p-4 transition ${
        primary
          ? 'border-blue-200 bg-blue-50 hover:border-blue-300 hover:bg-blue-100/60'
          : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${primary ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 group-hover:bg-blue-50 group-hover:text-blue-700'}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
    </Link>
  )
}

function AttentionRow({
  label,
  value,
  to,
  icon: Icon,
  danger = false,
}: {
  label: string
  value: number
  to: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  danger?: boolean
}) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-slate-300 hover:bg-slate-50">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${danger && value > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">Open management screen</p>
      </div>
      <span className={`text-xl font-extrabold ${danger && value > 0 ? 'text-red-700' : 'text-slate-950'}`}>{value}</span>
    </Link>
  )
}

function SecondaryLink({ to, title, description }: { to: string; title: string; description: string }) {
  return (
    <Link to={to} className="medibill-card flex items-center justify-between gap-4 p-5 transition hover:border-blue-200 hover:shadow-md">
      <div>
        <p className="font-bold text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <ArrowRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
    </Link>
  )
}
