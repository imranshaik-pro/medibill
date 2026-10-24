export const pharmaReports = {
    sales: { title: 'Sales item / batch register', note: 'Issued invoice lines, including recorded tax before invoice-level adjustments.' },
    salesInvoices: { title: 'Sales invoice register', note: 'Invoice totals and stored output tax; one row per invoice.' },
    purchases: { title: 'Purchase item / batch register', note: 'Purchase inward lines with supplier, batch and expiry.' },
    purchaseInvoices: { title: 'Purchase invoice register', note: 'Purchase inward totals; excludes the separate legacy purchase register.' },
    legacyPurchases: { title: 'Legacy purchases', note: 'Separate legacy purchase records. Do not add to inward totals without reconciliation.' },
    receivables: { title: 'Customer receivables', note: 'Current recorded customer balances. Not historical invoice aging; payments have no invoice allocations.' },
    payables: { title: 'Supplier payables', note: 'Current recorded supplier balances. Not historical invoice aging; payments have no invoice allocations.' },
    cash: { title: 'Cash / bank receipts and payments', note: 'Recorded payment activity only. Excludes unrecorded expenses, opening balances, transfers and unposted cash sales; not a complete cash-flow statement.' },
    customerLedger: { title: 'Customer account activity', note: 'Recorded invoices, receipts and returns. No invented opening or running balance; reconcile against current balances.' },
    supplierLedger: { title: 'Supplier account activity', note: 'Recorded inward invoices, payments and returns. Legacy purchases remain a separate register.' },
    gst: { title: 'GST input / output working paper', note: 'Recorded invoice tax components. Input tax shown is purchase tax, not verified ITC eligibility. Requires reconciliation and review before filing; not a GSTR filing.' },
    returns: { title: 'Returns register', note: 'Recorded return values and references; legacy returns do not record item quantities.' },
    adjustments: { title: 'Stock adjustment log', note: 'Recorded quantity changes and reasons.' },
    regulated: { title: 'Schedule-controlled sales activity', note: 'Operational product transaction report. Not a certified Schedule H1 register; patient/prescriber data and applicable wholesale requirements must be reviewed separately.' },
} as const;
export type PharmaReportKind = keyof typeof pharmaReports;
export function reportDate(value: string | null) {
    if (!value)
        return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
        throw new Error('Enter a valid report date.');
    return value;
}
export function reportCsv(rows: Record<string, unknown>[], columns: string[]) {
    const cell = (v: unknown) => { let s = String(v ?? ''); if (typeof v === 'string' && /^[\s\u0000-\u0020]*[=+@-]/.test(s))
        s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; };
    return '\uFEFF' + [columns.map(cell).join(','), ...rows.map(r => columns.map(c => cell(r[c])).join(','))].join('\r\n');
}
