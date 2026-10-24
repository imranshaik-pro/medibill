"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProductDescription } from "./product-description";
import { Button } from "@/components/ui/button";
import { stockReportColumns, stockReportPresets, selectStockReport, selectedStockColumns, stockReportCsv, stockReportPrintHtml, type StockReportProduct, type StockReportOptions, type StockReportColumn } from "@/lib/stock-report";

export function StockReports({companyName}: {companyName: string}) {
  const [preset, setPreset] = useState("full");
  const [options, setOptions] = useState<StockReportOptions>({availability: "available", search: "", columns: [...stockReportPresets.full.columns], productsOnly: false});
  const [snapshot, setSnapshot] = useState<{products: StockReportProduct[]; generatedAt: string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const loading = useRef(false);
  const rows = useMemo(() => snapshot ? selectStockReport(snapshot.products, options) : [], [snapshot, options]);
  const columns = selectedStockColumns(options.columns);
  useEffect(() => setPage(0), [snapshot, options]);
  const lastPage = Math.max(0, Math.ceil(rows.length / 100) - 1);
  const currentPage = Math.min(page, lastPage);
  const preview = rows.slice(currentPage * 100, (currentPage + 1) * 100);
  async function generate() {
    if (loading.current) return;
    loading.current = true; setBusy(true); setError(""); setSnapshot(null);
    try {
      const response = await fetch("/api/reports/stock", {cache: "no-store"});
      const out = await response.json() as {products?: StockReportProduct[]; generatedAt?: string; error?: string};
      if (!response.ok) throw new Error(out.error || "Unable to generate report.");
      if (!Array.isArray(out.products) || !out.generatedAt) throw new Error("The stock report response is incomplete. Please retry.");
      setSnapshot({products: out.products, generatedAt: out.generatedAt});
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to generate report. Check your connection and retry."); }
    finally { loading.current = false; setBusy(false); }
  }
  function choosePreset(value: string) {
    setPreset(value);
    if (value === "custom") return;
    const selected = stockReportPresets[value as keyof typeof stockReportPresets];
    setOptions(o => ({...o, columns: [...selected.columns], productsOnly: selected.productsOnly}));
  }
  function toggleColumn(key: StockReportColumn, checked: boolean) {
    setPreset("custom");
    setOptions(o => ({...o, productsOnly: false, columns: checked ? [...o.columns, key] : o.columns.filter(c => c !== key)}));
  }
  function downloadCsv() {
    const url = URL.createObjectURL(new Blob([stockReportCsv(rows, options.columns)], {type: "text/csv;charset=utf-8"}));
    const a = document.createElement("a"); a.href = url;
    a.download = `medibill-stock-${snapshot!.generatedAt.slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const context = snapshot ? `Stock snapshot: ${new Date(snapshot.generatedAt).toLocaleString("en-IN")}\nInventory condition: ${options.condition||"all"}\nStock filter: ${{available: "In stock only", all: "All stock records", out: "Out of stock"}[options.availability]}${options.search.trim() ? ` · Search: ${options.search.trim()}` : ""}\n${options.productsOnly ? "Unique products by name, pack and manufacturer." : "One row per stock batch."}` : "";
  function printReport() {
    const tab = window.open("", "_blank");
    if (!tab) { setError("Allow pop-ups for MediBill to open the printable report, or download the CSV."); return; }
    tab.opener = null;
    tab.document.open(); tab.document.write(stockReportPrintHtml(rows, options.columns, companyName, context)); tab.document.close();
  }
  return <section className="panel stock-reports" aria-labelledby="stock-reports-title">
    <div className="panel-head"><div><h2 id="stock-reports-title">Stock report</h2><p>Generate a complete stock snapshot, select the details you need, then export or print it.</p></div></div>
    <div className="stock-report-controls">
      <label>Report format<select value={preset} onChange={e => choosePreset(e.target.value)}>{Object.entries(stockReportPresets).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}<option value="custom">Custom columns (by batch)</option></select></label>
      <label>Stock filter<select value={options.availability} onChange={e => setOptions(o => ({...o, availability: e.target.value as StockReportOptions["availability"]}))}><option value="available">In stock only</option><option value="all">All stock records</option><option value="out">Out of stock</option></select></label>
      <label>Inventory condition<select value={options.condition||"all"} onChange={e=>setOptions(o=>({...o,condition:e.target.value as StockReportOptions["condition"]}))}><option value="all">All conditions</option><option value="low">Low stock (10 or fewer)</option><option value="near">Expiring in 90 days</option><option value="expired">Expired stock</option></select></label>
      <label>Search products<input value={options.search} placeholder="Product, batch, pack or manufacturer" onChange={e => setOptions(o => ({...o, search: e.target.value}))}/></label>
      <fieldset><legend>Include columns</legend><div className="stock-report-columns">{stockReportColumns.map(c => <label key={c.key}><input type="checkbox" checked={c.key === "name" || options.columns.includes(c.key)} disabled={c.key === "name"} onChange={e => toggleColumn(c.key, e.target.checked)}/>{c.label}</label>)}</div></fieldset>
      <div className="stock-report-actions"><Button type="button" disabled={busy} onClick={generate}>{busy ? "Generating…" : snapshot ? "Refresh stock report" : "Generate stock report"}</Button><Button type="button" variant="outline" disabled={busy || !snapshot || !rows.length} onClick={downloadCsv}>Download CSV</Button><Button type="button" variant="outline" disabled={busy || !snapshot || !rows.length} onClick={printReport}>Print / Save PDF</Button></div>
      <p className="stock-report-note">Quantity and purchase rate use the units recorded on each batch. Purchase rate is the stored batch rate, not a historical purchase ledger or a stock valuation.</p>
      {error && <p role="alert" className="error">{error}</p>}
      {snapshot && <p role="status" className="stock-report-note">{rows.length} {options.productsOnly ? "products" : "batch rows"} from {snapshot.products.length} stock records · Snapshot: {new Date(snapshot.generatedAt).toLocaleString("en-IN")}. Filters and columns update the preview and exports together. Refresh to include newer stock changes.</p>}
    </div>
    {snapshot && rows.length > 100 && <nav className="stock-report-pagination" aria-label="Report preview pages"><Button type="button" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous rows</Button><span>Preview rows {currentPage * 100 + 1}–{Math.min((currentPage + 1) * 100, rows.length)} of {rows.length}. Exports include all {rows.length} matching rows.</span><Button type="button" variant="outline" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Next rows</Button></nav>}
    {snapshot && (rows.length ? <div className="table-scroll" tabIndex={0} aria-label="Stock report preview"><table><thead><tr>{columns.map(c => <th key={c.key} scope="col">{c.label}</th>)}<th>Product Description</th></tr></thead><tbody>{preview.map(p => <tr key={p.id}>{columns.map(c => <td key={c.key}>{c.key === "mrp" || c.key === "purchaseRate" ? p[c.key].toFixed(2) : p[c.key]}</td>)}<td><ProductDescription id={p.id}/></td></tr>)}</tbody></table></div> : <p className="empty">No stock records match these filters.</p>)}
  </section>;
}
