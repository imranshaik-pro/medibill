import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient, CustomerLedger, ReceivableCustomer, ReceivableInvoice } from '@/services/api'

const today = new Date().toISOString().slice(0, 10)
const money = (value: string | number) => Number(value || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })

export default function Receivables() {
  const [customers, setCustomers] = useState<ReceivableCustomer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [ledger, setLedger] = useState<CustomerLedger | null>(null)
  const [search, setSearch] = useState('')
  const [outstandingOnly, setOutstandingOnly] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [payingInvoice, setPayingInvoice] = useState<ReceivableInvoice | null>(null)
  const [payment, setPayment] = useState({ amount: '', payment_date: today, payment_mode: 'CASH', reference_number: '', notes: '' })

  const totals = useMemo(() => customers.reduce((acc, customer) => {
    acc.outstanding += Number(customer.balance_due || 0)
    acc.open += customer.open_invoices || 0
    return acc
  }, { outstanding: 0, open: 0 }), [customers])

  async function loadCustomers() {
    setLoading(true)
    setError('')
    try {
      const rows = await apiClient.listReceivables({ search: search || undefined, outstanding_only: outstandingOnly })
      setCustomers(rows)
      if (selectedCustomerId && !rows.some((row) => row.customer_id === selectedCustomerId) && outstandingOnly) {
        setSelectedCustomerId(null)
        setLedger(null)
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Unable to load receivables')
    } finally {
      setLoading(false)
    }
  }

  async function loadLedger(customerId: number) {
    setSelectedCustomerId(customerId)
    setError('')
    try {
      setLedger(await apiClient.getCustomerLedger(customerId))
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Unable to load customer ledger')
    }
  }

  useEffect(() => { void loadCustomers() }, [outstandingOnly])

  async function submitPayment(event: React.FormEvent) {
    event.preventDefault()
    if (!payingInvoice || !selectedCustomerId) return
    const amount = Number(payment.amount)
    if (!amount || amount <= 0 || amount > Number(payingInvoice.balance_due)) {
      setError('Enter a payment amount up to the invoice balance')
      return
    }
    setLoading(true)
    setError('')
    try {
      await apiClient.recordSalePayment(payingInvoice.invoice_id, {
        amount,
        payment_date: payment.payment_date,
        payment_mode: payment.payment_mode,
        reference_number: payment.reference_number || null,
        notes: payment.notes || null,
      })
      setPayingInvoice(null)
      setPayment({ amount: '', payment_date: today, payment_mode: 'CASH', reference_number: '', notes: '' })
      await Promise.all([loadCustomers(), loadLedger(selectedCustomerId)])
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Payment could not be recorded')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Customer Receivables</h1>
            <p className="text-sm text-gray-500">Track customer credit, open invoices and collections.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/sales" className="rounded-md border bg-white px-4 py-2 text-sm">Sales</Link>
            <Link to="/dashboard" className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">Dashboard</Link>
          </div>
        </div>

        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-white p-4 shadow-sm"><div className="text-sm text-gray-500">Outstanding</div><div className="mt-1 text-2xl font-semibold">{money(totals.outstanding)}</div></div>
          <div className="rounded-lg bg-white p-4 shadow-sm"><div className="text-sm text-gray-500">Open invoices</div><div className="mt-1 text-2xl font-semibold">{totals.open}</div></div>
          <div className="rounded-lg bg-white p-4 shadow-sm"><div className="text-sm text-gray-500">Customers shown</div><div className="mt-1 text-2xl font-semibold">{customers.length}</div></div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <section className="rounded-lg bg-white p-4 shadow-sm">
            <div className="flex gap-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void loadCustomers() }} placeholder="Search customer" className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm" />
              <button onClick={() => void loadCustomers()} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white">Search</button>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={outstandingOnly} onChange={(e) => setOutstandingOnly(e.target.checked)} />Outstanding only</label>
            <div className="mt-4 space-y-2">
              {loading && customers.length === 0 && <div className="text-sm text-gray-500">Loading…</div>}
              {!loading && customers.length === 0 && <div className="text-sm text-gray-500">No receivables found.</div>}
              {customers.map((customer) => (
                <button key={customer.customer_id} onClick={() => void loadLedger(customer.customer_id)} className={`w-full rounded-md border p-3 text-left ${selectedCustomerId === customer.customer_id ? 'border-blue-500 bg-blue-50' : 'bg-white'}`}>
                  <div className="font-medium text-gray-900">{customer.customer_name}</div>
                  <div className="text-xs text-gray-500">{customer.customer_code}{customer.phone ? ` · ${customer.phone}` : ''}</div>
                  <div className="mt-2 flex justify-between text-sm"><span>{customer.open_invoices} open</span><span className="font-semibold">{money(customer.balance_due)}</span></div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg bg-white p-4 shadow-sm">
            {!ledger ? <div className="py-12 text-center text-sm text-gray-500">Select a customer to view the ledger.</div> : <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                <div><h2 className="text-lg font-semibold">{ledger.customer.customer_name}</h2><div className="text-sm text-gray-500">Credit limit {money(ledger.customer.credit_limit)}</div></div>
                <div className="text-right"><div className="text-sm text-gray-500">Balance due</div><div className="text-xl font-semibold">{money(ledger.customer.balance_due)}</div></div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-left text-gray-500"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Invoice</th><th className="py-2 pr-3">Total</th><th className="py-2 pr-3">Paid</th><th className="py-2 pr-3">Balance</th><th className="py-2">Action</th></tr></thead>
                  <tbody>{ledger.invoices.map((invoice) => <tr key={invoice.invoice_id} className="border-b last:border-0"><td className="py-3 pr-3">{invoice.invoice_date}</td><td className="py-3 pr-3 font-medium">{invoice.invoice_number}</td><td className="py-3 pr-3">{money(invoice.grand_total)}</td><td className="py-3 pr-3">{money(invoice.amount_paid)}</td><td className="py-3 pr-3 font-semibold">{money(invoice.balance_due)}</td><td className="py-3">{Number(invoice.balance_due) > 0 ? <button onClick={() => { setPayingInvoice(invoice); setPayment((p) => ({ ...p, amount: invoice.balance_due })) }} className="rounded-md bg-green-600 px-3 py-1.5 text-xs text-white">Receive payment</button> : <span className="text-xs text-green-700">Paid</span>}</td></tr>)}</tbody>
                </table>
              </div>
            </>}
          </section>
        </div>
      </div>

      {payingInvoice && <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
        <form onSubmit={submitPayment} className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
          <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Receive payment</h3><button type="button" onClick={() => setPayingInvoice(null)} className="text-gray-500">✕</button></div>
          <div className="mt-1 text-sm text-gray-500">{payingInvoice.invoice_number} · Balance {money(payingInvoice.balance_due)}</div>
          <div className="mt-4 space-y-3">
            <label className="block text-sm">Amount<input required type="number" min="0.01" step="0.01" max={payingInvoice.balance_due} value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label>
            <label className="block text-sm">Payment date<input required type="date" max={today} value={payment.payment_date} onChange={(e) => setPayment({ ...payment, payment_date: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label>
            <label className="block text-sm">Mode<select value={payment.payment_mode} onChange={(e) => setPayment({ ...payment, payment_mode: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2"><option>CASH</option><option>UPI</option><option>CARD</option><option>BANK</option></select></label>
            <label className="block text-sm">Reference<input value={payment.reference_number} onChange={(e) => setPayment({ ...payment, reference_number: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label>
            <label className="block text-sm">Notes<textarea value={payment.notes} onChange={(e) => setPayment({ ...payment, notes: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label>
          </div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setPayingInvoice(null)} className="rounded-md border px-4 py-2 text-sm">Cancel</button><button disabled={loading} className="rounded-md bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-50">{loading ? 'Saving…' : 'Record payment'}</button></div>
        </form>
      </div>}
    </div>
  )
}
