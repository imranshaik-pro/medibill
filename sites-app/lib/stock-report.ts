export type StockReportProduct = {
  id: string; name: string; pack: string; manufacturer: string; batch: string;
  expiry: string; stock: number; mrp: number; purchaseRate: number;
};
export const stockReportColumns = [
  { key: "name", label: "Product" },
  { key: "pack", label: "Pack" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "batch", label: "Batch" },
  { key: "expiry", label: "Expiry" },
  { key: "stock", label: "Quantity" },
  { key: "mrp", label: "MRP (INR)" },
  { key: "purchaseRate", label: "Purchase rate (INR)" },
] as const;
export type StockReportColumn = typeof stockReportColumns[number]["key"];
export type StockReportOptions = {
  availability: "available" | "all" | "out";
  search: string;
  columns: StockReportColumn[];
  productsOnly: boolean;
  condition?: "all" | "low" | "near" | "expired";
  lowThreshold?: number;
};
export const stockReportPresets = {
  products: { label: "Available products", columns: ["name", "pack", "manufacturer"], productsOnly: true },
  quantity: { label: "Stock quantities", columns: ["name", "pack", "batch", "expiry", "stock"], productsOnly: false },
  mrp: { label: "Stock with MRP", columns: ["name", "pack", "batch", "stock", "mrp"], productsOnly: false },
  purchase: { label: "Stock with purchase rate", columns: ["name", "pack", "batch", "stock", "purchaseRate"], productsOnly: false },
  full: { label: "Full stock statement", columns: stockReportColumns.map(c => c.key), productsOnly: false },
} satisfies Record<string, {label: string; columns: StockReportColumn[]; productsOnly: boolean}>;

export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

export function indiaBusinessDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Explicit dates retain their day; month-only dates expire at month end.
export function stockExpiryTimestamp(value: string) {
  const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value.trim());
  const short = /^(\d{2})\/(\d{2}|\d{4})$/.exec(value.trim());
  if (!iso && !short) return NaN;
  let year = Number(iso ? iso[1] : short![2]);
  if (year < 100) year += 2000;
  const month = Number(iso ? iso[2] : short![1]);
  if (month < 1 || month > 12) return NaN;
  const day = iso?.[3] ? Number(iso[3]) : new Date(Date.UTC(year, month, 0)).getUTCDate();
  const result = Date.UTC(year, month - 1, day);
  const date = new Date(result);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? result : NaN;
}

export function selectStockReport(products: StockReportProduct[], options: StockReportOptions) {
  const tokens = options.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const today = Date.parse(indiaBusinessDate() + 'T00:00:00Z');
  const expiryDay = stockExpiryTimestamp;
  const matches = products.filter(p =>
    (!options.condition || options.condition === 'all' ||
      (options.condition === 'low' && p.stock <= (options.lowThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD)) ||
      (options.condition === 'near' && p.stock > 0 && expiryDay(p.expiry)>=today && expiryDay(p.expiry)<=today+90*86400000) ||
      (options.condition === 'expired' && p.stock > 0 && expiryDay(p.expiry)<today)) &&
    (options.availability === "all" || (options.availability === "available" ? p.stock > 0 : p.stock <= 0)) &&
    tokens.every(token => [p.name, p.pack, p.manufacturer, p.batch].join(" ").toLocaleLowerCase().includes(token)),
  ).sort((a, b) => a.name.localeCompare(b.name, "en-IN", {numeric: true}) || a.pack.localeCompare(b.pack) || a.batch.localeCompare(b.batch) || a.id.localeCompare(b.id));
  // Product lists collapse batches only when the selected identity is identical.
  // Monetary and quantity reports always retain separate batch records.
  if (!options.productsOnly) return matches;
  const seen = new Set<string>();
  return matches.filter(p => {
    const key = JSON.stringify([p.name, p.pack, p.manufacturer]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function selectedStockColumns(keys: StockReportColumn[]) {
  return stockReportColumns.filter(c => c.key === "name" || keys.includes(c.key));
}
function csvCell(value: string | number) {
  // Spreadsheet formulas are never executed from product names or batch labels.
  const safe = typeof value === "string" && /^[\s\u0000-\u0020]*[=+@-]/.test(value) ? "'" + value : String(value);
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function stockReportCsv(rows: StockReportProduct[], keys: StockReportColumn[]) {
  const columns = selectedStockColumns(keys);
  return "\uFEFF" + [columns.map(c => csvCell(c.label)).join(","),
    ...rows.map(p => columns.map(c => csvCell(p[c.key])).join(","))].join("\r\n");
}
const escapeHtml = (s: string | number) => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]!);
export function stockReportPrintHtml(rows: StockReportProduct[], keys: StockReportColumn[], company: string, context: string) {
  const columns = selectedStockColumns(keys);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Stock report</title><style>
    body{font:13px Arial,sans-serif;color:#172b2a;margin:24px}h1{font-size:22px}p{white-space:pre-wrap}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #aaa;text-align:left;overflow-wrap:anywhere}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}button{padding:10px;margin-bottom:16px}@page{size:A4 landscape;margin:12mm}@media print{button{display:none}body{margin:0}}
    </style></head><body><button onclick="window.print()">Print / Save PDF</button><h1>${escapeHtml(company)} — Stock report</h1><p>${escapeHtml(context)}</p><table><thead><tr>${columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead><tbody>${rows.map(p => `<tr>${columns.map(c => `<td>${escapeHtml(p[c.key])}</td>`).join("")}</tr>`).join("")}</tbody></table><p>${rows.length} report rows. Purchase rates and quantities are the values recorded on each stock batch.</p></body></html>`;
}
