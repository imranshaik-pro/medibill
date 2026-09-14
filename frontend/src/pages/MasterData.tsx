import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '@/services/api'
import { dataToolsApi, GstLookupResult, ImportEntity, ImportResult } from '@/services/dataToolsApi'

type Tab = ImportEntity

const tabs: { key: Tab; label: string }[] = [
  { key: 'customers', label: 'Customers' },
  { key: 'suppliers', label: 'Suppliers / Vendors' },
  { key: 'products', label: 'Products' },
  { key: 'categories', label: 'Categories' },
  { key: 'manufacturers', label: 'Manufacturers' },
]

export default function MasterData() {
  const [tab, setTab] = useState<Tab>('customers')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const rows = tab === 'suppliers' ? await apiClient.listSuppliers(undefined, false) : await apiClient.listMasterData(tab as any)
      setItems(rows)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Unable to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tab])

  const filtered = useMemo(() => items.filter((item) =>
    JSON.stringify(item).toLowerCase().includes(search.toLowerCase())
  ), [items, search])

  const current = tabs.find((item) => item.key === tab)!

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Business masters</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Master Data</h1>
          <p className="mt-1 text-sm text-slate-500">Maintain customers, vendors and products manually or import them safely from Excel.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => dataToolsApi.downloadTemplate(tab)} className="btn-secondary">Download Excel Template</button>
          <button onClick={() => setShowImport(true)} className="btn-secondary">Import Excel / CSV</button>
          <button onClick={() => setShowForm(true)} className="btn-primary">+ Add {singleLabel(tab)}</button>
        </div>
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-2">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(item => <button key={item.key} onClick={() => { setTab(item.key); setSearch(''); setError('') }} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === item.key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>{item.label}</button>)}
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-lg">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${current.label.toLowerCase()}...`} className="input-field pl-10" />
            <span className="pointer-events-none absolute left-3 top-2.5 text-slate-400">⌕</span>
          </div>
          <button onClick={load} className="btn-secondary">Refresh</button>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {loading ? <div className="py-12 text-center text-slate-500">Loading {current.label.toLowerCase()}...</div> :
          filtered.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center"><p className="font-semibold text-slate-700">No {current.label.toLowerCase()} found</p><p className="mt-1 text-sm text-slate-500">Add one manually or download the Excel template for bulk import.</p></div> :
          <MasterTable rows={filtered} />}
      </div>
    </section>

    {showForm && <SimpleForm tab={tab} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    {showImport && <ImportDialog entity={tab} onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); load() }} />}
  </div>
}

function MasterTable({ rows }: { rows: any[] }) {
  const hidden = ['id', 'company_id', 'created_at', 'updated_at']
  const columns = Object.keys(rows[0]).filter(k => !hidden.includes(k)).slice(0, 7)
  return <div className="overflow-x-auto rounded-xl border border-slate-200">
    <table className="w-full text-left">
      <thead className="bg-slate-50"><tr>{columns.map(k => <th key={k} className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">{pretty(k)}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.map(item => <tr key={item.id} className="hover:bg-blue-50/40">{columns.map(k => <td key={k} className="max-w-xs px-4 py-3 text-sm text-slate-700">{formatValue(item[k])}</td>)}</tr>)}</tbody>
    </table>
  </div>
}

function SimpleForm({ tab, onClose, onSaved }: { tab: Tab; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [gstLoading, setGstLoading] = useState(false)
  const [gstResult, setGstResult] = useState<GstLookupResult | null>(null)

  const fields: Record<Tab, string[]> = {
    customers: ['customer_code', 'customer_name', 'business_name', 'customer_type', 'contact_person', 'phone', 'email', 'gstin', 'billing_address', 'state', 'state_code', 'pincode', 'drug_license_number', 'credit_limit', 'credit_days'],
    suppliers: ['supplier_code', 'supplier_name', 'contact_person', 'phone', 'email', 'gstin', 'address', 'credit_days', 'credit_limit'],
    categories: ['name', 'description'],
    manufacturers: ['name', 'phone', 'email', 'gstin', 'address'],
    products: ['product_code', 'product_name', 'generic_name', 'brand_name', 'hsn_code', 'gst_rate', 'unit', 'pack_size', 'default_mrp', 'default_selling_price', 'minimum_sale_rate', 'reorder_level', 'category_id', 'manufacturer_id'],
  }

  const required = new Set(['customer_code', 'customer_name', 'supplier_code', 'supplier_name', 'name', 'product_code', 'product_name', 'category_id'])
  const supportsGst = ['customers', 'suppliers', 'manufacturers'].includes(tab)

  const fetchGst = async () => {
    if (!data.gstin) { setError('Enter the GSTIN first.'); return }
    setError(''); setGstResult(null); setGstLoading(true)
    try { setGstResult(await dataToolsApi.verifyGstin(data.gstin)) }
    catch (err: any) { setError(err.response?.data?.detail || 'Unable to verify GSTIN') }
    finally { setGstLoading(false) }
  }

  const applyGst = () => {
    if (!gstResult) return
    const name = gstResult.trade_name || gstResult.legal_name || ''
    if (tab === 'customers') {
      setData(prev => ({ ...prev, gstin: gstResult.gstin, customer_name: prev.customer_name || name, business_name: name || prev.business_name, billing_address: gstResult.address || prev.billing_address, state_code: gstResult.state_code || prev.state_code }))
    } else if (tab === 'suppliers') {
      setData(prev => ({ ...prev, gstin: gstResult.gstin, supplier_name: prev.supplier_name || name, address: gstResult.address || prev.address }))
    } else if (tab === 'manufacturers') {
      setData(prev => ({ ...prev, gstin: gstResult.gstin, name: prev.name || name, address: gstResult.address || prev.address }))
    }
    setGstResult(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      const payload: Record<string, unknown> = { ...data }
      ;['credit_days', 'pack_size', 'reorder_level', 'category_id', 'manufacturer_id'].forEach(k => { if (payload[k] !== undefined && payload[k] !== '') payload[k] = Number(payload[k]) })
      if (tab === 'customers' && !payload.customer_type) payload.customer_type = 'OTHER'
      if (tab === 'suppliers') await apiClient.createSupplier(payload)
      else await apiClient.createMasterData(tab as any, payload)
      onSaved()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Unable to save')
    } finally { setSaving(false) }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
    <form onSubmit={submit} className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5"><div><h2 className="text-xl font-bold text-slate-900">Add {singleLabel(tab)}</h2><p className="mt-1 text-sm text-slate-500">Enter the details below. GST-registered firms can be verified before saving.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button></div>
      <div className="max-h-[70vh] overflow-y-auto p-6">
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div className="grid gap-4 sm:grid-cols-2">{fields[tab].map(field => <label key={field} className={`${['billing_address', 'address', 'description'].includes(field) ? 'sm:col-span-2' : ''} text-sm font-semibold text-slate-700`}>{pretty(field)}{required.has(field) && <span className="text-red-500"> *</span>}<input required={required.has(field)} value={data[field] || ''} onChange={e => { setData({ ...data, [field]: e.target.value }); if (field === 'gstin') setGstResult(null) }} className="input-field mt-1.5" placeholder={field === 'gstin' ? '15-character GSTIN' : undefined} /></label>)}</div>

        {supportsGst && <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-900">GST firm verification</p><p className="text-sm text-slate-600">Verify the GSTIN and review the registered firm details before using them.</p></div><button type="button" onClick={fetchGst} disabled={gstLoading || !data.gstin} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50">{gstLoading ? 'Checking...' : 'Fetch GST Details'}</button></div>
          {gstResult && <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${String(gstResult.status).toLowerCase() === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{gstResult.status || 'Status unavailable'}</span><span className="text-xs text-slate-500">GSTIN {gstResult.gstin}</span></div><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><Info label="Legal name" value={gstResult.legal_name} /><Info label="Trade name" value={gstResult.trade_name} /><Info label="Taxpayer type" value={gstResult.taxpayer_type} /><Info label="State code" value={gstResult.state_code} /><div className="sm:col-span-2"><Info label="Registered address" value={gstResult.address} /></div></dl><div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">{gstResult.credits_remaining !== undefined ? `${gstResult.credits_remaining} provider credits remaining` : ''}</span><button type="button" onClick={applyGst} className="btn-primary">Use these details</button></div></div>}
        </div>}
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4"><button type="button" onClick={onClose} className="btn-secondary">Cancel</button><button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button></div>
    </form>
  </div>
}

function ImportDialog({ entity, onClose, onImported }: { entity: ImportEntity; onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (preview: boolean) => {
    if (!file) return
    setBusy(true); setError('')
    try {
      const response = await dataToolsApi.importFile(entity, file, preview)
      setResult(response)
      if (!preview && response.imported > 0) onImported()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Unable to process import file')
    } finally { setBusy(false) }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
    <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5"><div><h2 className="text-xl font-bold text-slate-900">Import {singleLabel(entity)} data</h2><p className="mt-1 text-sm text-slate-500">Preview first. MediBill will not import anything while errors remain.</p></div><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">✕</button></div>
      <div className="space-y-4 p-6">
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center"><input type="file" accept=".xlsx,.csv" onChange={e => { setFile(e.target.files?.[0] || null); setResult(null) }} className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-blue-700" /><p className="mt-2 text-xs text-slate-500">Accepted: .xlsx and .csv · Maximum 10 MB</p></div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {result && <div className="rounded-xl border border-slate-200 p-4"><div className="grid grid-cols-3 gap-3 text-center"><Summary label="Rows" value={result.total_rows} /><Summary label="Valid" value={result.valid_rows} /><Summary label="Errors" value={result.error_rows} danger={result.error_rows > 0} /></div>{result.errors.length > 0 && <div className="mt-4 max-h-48 overflow-y-auto rounded-lg bg-red-50 p-3"><p className="mb-2 text-sm font-bold text-red-800">Please correct these rows</p>{result.errors.map((item, i) => <p key={i} className="py-1 text-xs text-red-700">Row {item.row}: {item.error}</p>)}</div>}{result.error_rows === 0 && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Validation passed. You can safely confirm the import.</p>}</div>}
      </div>
      <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4"><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={() => run(true)} disabled={!file || busy} className="btn-secondary disabled:opacity-50">{busy ? 'Checking...' : 'Preview & Validate'}</button><button onClick={() => run(false)} disabled={!file || busy || !result || result.error_rows > 0 || !result.preview} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">Confirm Import</button></div>
    </div>
  </div>
}

function Info({ label, value }: { label: string; value?: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-slate-700">{value || '-'}</dd></div> }
function Summary({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) { return <div className="rounded-lg bg-slate-50 p-3"><p className={`text-2xl font-bold ${danger ? 'text-red-600' : 'text-slate-900'}`}>{value}</p><p className="text-xs font-semibold uppercase text-slate-500">{label}</p></div> }
function pretty(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) }
function formatValue(value: any) { if (value === null || value === undefined || value === '') return '-'; if (typeof value === 'boolean') return value ? 'Active' : 'Inactive'; return String(value) }
function singleLabel(tab: Tab) { return ({ customers: 'Customer', suppliers: 'Supplier / Vendor', products: 'Product', categories: 'Category', manufacturers: 'Manufacturer' } as Record<Tab, string>)[tab] }
