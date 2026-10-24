"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ProductDescription } from './product-description';
import { pharmaReports, reportCsv, type PharmaReportKind } from '@/lib/pharma-reports';
type Snapshot = {
    rows: Record<string, unknown>[];
    generatedAt: string;
    title: string;
    note: string;
    dateFiltered: boolean;
};
export function PharmaReports() {
    const [kind, setKind] = useState<PharmaReportKind>('sales'), [from, setFrom] = useState(''), [to, setTo] = useState(''), [search, setSearch] = useState(''), [snapshot, setSnapshot] = useState<Snapshot | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [page, setPage] = useState(0);
    const rows = (snapshot?.rows || []).filter(r => Object.values(r).join(' ').toLowerCase().includes(search.toLowerCase()));
    const columns = Object.keys(snapshot?.rows[0] || {}).filter(c => c !== 'productId');
    async function generate() { setBusy(true); setSnapshot(null); setError(''); setPage(0); try {
        const r = await fetch('/api/reports/pharma?' + new URLSearchParams({ kind, from, to }), { cache: 'no-store' });
        const out = await r.json() as Snapshot & {
            error?: string;
        };
        if (!r.ok)
            throw new Error(out.error || 'Unable to generate report');
        setSnapshot(out);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to generate report');
    }
    finally {
        setBusy(false);
    } }
    function csv() { const url = URL.createObjectURL(new Blob([reportCsv(rows, columns)], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'medibill-' + kind + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    function print() { const tab = window.open('', '_blank'); if (!tab) {
        setError('Allow pop-ups to print this report.');
        return;
    } tab.opener = null; const d = tab.document; d.title = snapshot!.title; const heading = d.createElement('h1'); heading.textContent = snapshot!.title; d.body.appendChild(heading); const note = d.createElement('p'); note.textContent = snapshot!.note + ' Snapshot: ' + snapshot!.generatedAt + (search ? ' Search: ' + search : '') + (snapshot!.dateFiltered ? ' Dates: ' + (from || 'All') + ' to ' + (to || 'All') : ' Current snapshot; date range does not apply.'); d.body.appendChild(note); const button = d.createElement('button'); button.textContent = 'Print / Save PDF'; button.onclick = () => tab.print(); d.body.appendChild(button); const style = d.createElement('style'); style.textContent = 'table{border-collapse:collapse;width:100%;font:12px Arial}td,th{border:1px solid #999;padding:6px;text-align:left}thead{display:table-header-group}@page{size:A4 landscape}@media print{button{display:none}}'; d.head.appendChild(style); const table = d.createElement('table'), head = table.createTHead().insertRow(); for (const c of columns) {
        const th = d.createElement('th');
        th.textContent = c.replaceAll('_', ' ');
        head.appendChild(th);
    } const body = table.createTBody(); for (const row of rows) {
        const tr = body.insertRow();
        for (const c of columns)
            tr.insertCell().textContent = String(row[c] ?? '');
    } d.body.appendChild(table); }
    return <section className="panel stock-reports" style={{ marginBottom: 24 }}><div className="panel-head"><h2>Pharma reporting suite</h2></div><div className="stock-report-controls"><label>Report<select disabled={busy} value={kind} onChange={e => { setKind(e.target.value as PharmaReportKind); setSnapshot(null); setError(''); }}>{Object.entries(pharmaReports).map(([k, v]) => <option value={k} key={k}>{v.title}</option>)}</select></label><label>From<input disabled={busy} type="date" value={from} onChange={e => { setFrom(e.target.value); setSnapshot(null); }}/></label><label>To<input disabled={busy} type="date" value={to} onChange={e => { setTo(e.target.value); setSnapshot(null); }}/></label><p className="stock-report-note">{pharmaReports[kind].note}</p><label>Filter results<input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Product, customer, supplier, batch or reference"/></label><div className="stock-report-actions"><Button disabled={busy} onClick={generate}>{busy ? 'Generating…' : 'Generate report'}</Button><Button variant="outline" disabled={!snapshot || !rows.length} onClick={csv}>Download CSV</Button><Button variant="outline" disabled={!snapshot || !rows.length} onClick={print}>Print / Save PDF</Button></div>{error && <p role="alert">{error}</p>}{snapshot && <p role="status" className="stock-report-note">{rows.length} rows · {new Date(snapshot.generatedAt).toLocaleString('en-IN')} · {snapshot.dateFiltered ? 'Selected document date range' : 'Current balance snapshot; date filter does not apply'}. Exports include all matching rows.</p>}</div>{snapshot && <><div className="stock-report-pagination"><Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page + 1} of {Math.max(1, Math.ceil(rows.length / 100))}</span><Button variant="outline" disabled={(page + 1) * 100 >= rows.length} onClick={() => setPage(page + 1)}>Next</Button></div><div className="table-scroll"><table><thead><tr>{columns.map(c => <th key={c}>{c.replaceAll('_', ' ')}</th>)}<th>Product Description</th></tr></thead><tbody>{rows.slice(page * 100, (page + 1) * 100).map((r, i) => <tr key={i}>{columns.map(c => <td key={c}>{String(r[c] ?? '')}</td>)}<td>{typeof r.productId === 'string' ? <ProductDescription id={r.productId}/> : <span>Not an item row</span>}</td></tr>)}</tbody></table>{!rows.length && <p className="empty">No records match this report.</p>}</div></>}</section>;
}
