"use client";
import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ProductDescription } from './product-description';
type Period = 'today' | 'month' | 'year';
type Snapshot = {
    from: string;
    to: string;
    generatedAt: string;
    sales: number;
    purchases: number;
    salesCount: number;
    purchaseCount: number;
    receivables: number;
    payables: number;
    low: number;
    near: number;
    expired: number;
    stockCost: number;
    stockMrp: number;
    trend: {
        day: string;
        sales: number;
        purchases: number;
    }[];
    alerts: {
        id: string;
        name: string;
        batch: string;
        stock: number;
        expiry: string;
        issue: string;
    }[];
    recent: {
        id: string;
        number: string;
        customer: string;
        date: string;
        amount: number;
        status: string;
    }[];
    customers: {
        name: string;
        outstanding: number;
    }[];
    suppliers: {
        name: string;
        outstanding: number;
    }[];
};
const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
export function WholesaleDashboard({ company, open, navigate }: {
    company: string;
    open: (kind: 'invoice' | 'purchase') => void;
    navigate: (page: string) => void;
}) {
    const [period, setPeriod] = useState<Period>('month'), [snapshot, setSnapshot] = useState<Snapshot | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
    useEffect(() => { const controller = new AbortController(); setLoading(true); setError(''); setSnapshot(null); fetch('/api/dashboard?period=' + period, { cache: 'no-store', signal: controller.signal }).then(async (r) => { const data = await r.json() as Snapshot & {
        error?: string;
    }; if (!r.ok)
        throw new Error(data.error || 'Unable to load dashboard'); return data as Snapshot; }).then(setSnapshot).catch(e => { if (e.name !== 'AbortError')
        setError(e.message); }).finally(() => { if (!controller.signal.aborted)
        setLoading(false); }); return () => controller.abort(); }, [period, refresh]);
    const metrics = snapshot ? [['Sales', snapshot.sales, `${snapshot.salesCount} posted invoices`], ['Purchases', snapshot.purchases, `${snapshot.purchaseCount} purchase records`], ['Receivables', snapshot.receivables, 'Current customer balances'], ['Payables', snapshot.payables, 'Current supplier balances']] as const : [];
    return <div className="wh-dashboard">
  <header className="wh-heading"><div><p className="wh-eyebrow">PHARMACEUTICAL WHOLESALE</p><h1>Business overview</h1><p>{company} · Sales, stock, and outstanding balances</p></div><div className="wh-controls"><div className="wh-period" role="group" aria-label="Reporting period">{([['today', 'Today'], ['month', 'This month'], ['year', 'This year']] as const).map(([value, label]) => <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}</div><button className="wh-button" disabled={loading} onClick={() => setRefresh(n => n + 1)}>Refresh</button></div></header>
  <nav className="wh-shortcuts" aria-label="Quick actions"><button className="wh-primary" onClick={() => open('invoice')}>+ New sales invoice</button><button onClick={() => open('purchase')}>Purchase entry</button><button onClick={() => navigate('inventory')}>Inventory</button><button onClick={() => navigate('accounting')}>Accounting & GST</button><button onClick={() => navigate('reports')}>Reports</button><button onClick={() => navigate('catalog')}>Product catalog</button></nav>
  {error && <div className="wh-error" role="alert">{error} <button onClick={() => setRefresh(n => n + 1)}>Retry</button></div>}
  {loading && <div className="wh-card wh-loading" role="status">Loading workspace totals…</div>}
  {snapshot && <>
   <div className="wh-asof">Transactions: {snapshot.from} to {snapshot.to} · Balances and inventory are current · Updated {new Date(snapshot.generatedAt).toLocaleTimeString('en-IN')}</div>
   <section className="wh-metrics" aria-label="Business metrics">{metrics.map(([label, value, detail]) => <article className="wh-card" key={label}><p>{label}</p><strong>{money(value)}</strong><span>{detail}</span></article>)}</section>
   <div className="wh-main-grid"><section className="wh-card"><div className="wh-panel-title"><div><h2>Sales & purchase trend</h2><p>Recorded invoice totals, including tax</p></div><div className="wh-legend"><span>● Sales</span><span>● Purchases</span></div></div>{snapshot.salesCount + snapshot.purchaseCount === 0 ? <div className="wh-empty">No transactions in this period.</div> : <div className="wh-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={snapshot.trend}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="day" tickFormatter={s => String(s).slice(5)} tick={{ fontSize: 11 }} minTickGap={28}/><YAxis width={65} tickFormatter={v => new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(v)} tick={{ fontSize: 11 }}/><Tooltip formatter={v => money(Number(v))}/><Area name="Sales" dataKey="sales" stroke="#2563eb" fill="#dbeafe" strokeWidth={2}/><Area name="Purchases" dataKey="purchases" stroke="#0f766e" fill="#ccfbf1" strokeWidth={2}/></AreaChart></ResponsiveContainer></div>}<details className="wh-chart-data"><summary>View chart data</summary><div className="wh-table-scroll"><table><thead><tr><th>Period</th><th>Sales</th><th>Purchases</th></tr></thead><tbody>{snapshot.trend.map(r => <tr key={r.day}><td>{r.day}</td><td>{money(r.sales)}</td><td>{money(r.purchases)}</td></tr>)}</tbody></table></div></details></section>
   <section className="wh-card"><h2>Inventory health</h2><div className="wh-health">{[['Low stock', snapshot.low], ['Near expiry', snapshot.near], ['Expired', snapshot.expired]].map(([label, count]) => <button key={label} onClick={() => navigate('reports')}><strong>{count}</strong><span>{label}</span></button>)}</div><p className="wh-note">Low stock: ≤10 units · Near expiry: 90 days · Counts are batches.</p><dl className="wh-valuations"><div><dt>Stock at purchase cost</dt><dd>{money(snapshot.stockCost)}</dd></div><div><dt>Stock at MRP</dt><dd>{money(snapshot.stockMrp)}</dd></div></dl><p className="wh-note">Positive stock excluding known expired batches. Unknown expiry dates need review. MRP valuation is not expected revenue.</p><button className="wh-link" onClick={() => navigate('inventory')}>Open inventory →</button></section></div>
   <section className="wh-card"><div className="wh-panel-title"><div><h2>Stock requiring attention</h2><p>Expired batches first, followed by near-expiry and low stock</p></div><button className="wh-link" onClick={() => navigate('reports')}>All stock reports →</button></div><div className="wh-table-scroll"><table><thead><tr><th>Product / batch</th><th>Available quantity</th><th>Expiry</th><th>Alert</th><th>Details</th></tr></thead><tbody>{snapshot.alerts.map(p => <tr key={p.id}><td><b>{p.name}</b><small>Batch {p.batch || 'Not recorded'}</small></td><td>{p.stock}</td><td>{p.expiry || 'Not recorded'}</td><td><span className={'wh-badge ' + (p.issue === 'Expired' ? 'wh-danger' : 'wh-warning')}>{p.issue}</span></td><td><ProductDescription id={p.id}/></td></tr>)}{!snapshot.alerts.length && <tr><td colSpan={5}>No stock alerts found.</td></tr>}</tbody></table></div></section>
   <div className="wh-main-grid"><section className="wh-card"><div className="wh-panel-title"><div><h2>Recent sales invoices</h2><p>Latest posted invoices · Status indicates payment state</p></div><button className="wh-link" onClick={() => navigate('sales')}>View sales →</button></div><div className="wh-table-scroll"><table><thead><tr><th>Invoice / date</th><th>Customer</th><th>Amount</th><th>Payment</th></tr></thead><tbody>{snapshot.recent.map(i => <tr key={i.id}><td><a className="wh-link" href={'/invoices/' + encodeURIComponent(i.id) + '/print'}>{i.number}</a><small>{i.date}</small></td><td>{i.customer}</td><td>{money(i.amount)}</td><td><span className="wh-badge">{i.status}</span></td></tr>)}{!snapshot.recent.length && <tr><td colSpan={4}>No posted invoices yet.</td></tr>}</tbody></table></div><button className="wh-link" onClick={() => navigate('sales')}>Open sales & saved drafts →</button></section>
   <section className="wh-card"><h2>Outstanding balances</h2><p className="wh-note">Largest current balances. Invoice aging requires payment allocations.</p>{([['Customers to collect from', snapshot.customers, 'customers'], ['Suppliers to pay', snapshot.suppliers, 'payables']] as const).map(([title, rows, page]) => <div className="wh-balances" key={title}><h3>{title}</h3>{rows.map((r, i) => <div key={i}><span>{r.name}</span><b>{money(r.outstanding)}</b></div>)}{!rows.length && <p>No outstanding balances.</p>}<button className="wh-link" onClick={() => navigate(page)}>View ledger →</button></div>)}</section></div>
  </>}
 </div>;
}
