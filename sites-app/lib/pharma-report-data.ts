import { env } from 'cloudflare:workers';
import { getMembership } from './medibill';
import { pharmaReports, reportDate, type PharmaReportKind } from './pharma-reports';
const sales = `SELECT l.product_id AS productId,i.invoice_no AS Invoice,i.invoice_date AS Date,i.customer_name AS Customer,l.product_name AS Product,l.batch AS Batch,l.expiry AS Expiry,l.pack AS Pack,l.quantity AS Quantity,l.free_quantity AS Free,l.unit_rate AS Rate,l.taxable_amount AS Taxable,l.gst_rate AS GST_rate,l.gst_amount AS Tax,l.line_total AS Total FROM invoice_lines l JOIN invoices i ON i.id=l.invoice_id AND i.tenant_id=l.tenant_id`;
const purchase = `SELECT l.product_id AS productId,i.inward_no AS Inward,i.invoice_no AS Supplier_invoice,i.invoice_date AS Date,i.supplier_name AS Supplier,l.product_name AS Product,l.batch AS Batch,l.expiry AS Expiry,l.pack AS Pack,l.billed_quantity AS Quantity,l.free_quantity AS Free,l.net_rate AS Rate,l.gst_rate AS GST_rate,l.gst_amount AS Tax,l.line_total AS Total FROM purchase_inward_items l JOIN purchase_inwards i ON i.id=l.inward_id AND i.tenant_id=l.tenant_id`;
// Every query is fixed by the report allowlist. Tenant is always derived from active membership.
const definitions: Record<PharmaReportKind, {
    sql: string;
    tenant: string;
    date?: string;
}> = {
    sales: { sql: sales, tenant: 'i.tenant_id', date: 'i.invoice_date' },
    regulated: { sql: sales + ` JOIN products p ON p.id=l.product_id AND p.tenant_id=l.tenant_id JOIN product_masters m ON m.id=p.product_master_id AND m.tenant_id=p.tenant_id`, tenant: 'i.tenant_id', date: 'i.invoice_date' },
    purchases: { sql: purchase, tenant: 'i.tenant_id', date: 'i.invoice_date' },
    salesInvoices: { sql: `SELECT invoice_no AS Invoice,invoice_date AS Date,customer_name AS Customer,due_date AS Due_date,payment_mode AS Payment_mode,status AS Status,amount AS Total,cgst AS CGST,sgst AS SGST,igst AS IGST FROM invoices`, tenant: 'tenant_id', date: 'invoice_date' },
    purchaseInvoices: { sql: `SELECT inward_no AS Inward,invoice_no AS Supplier_invoice,invoice_date AS Date,supplier_name AS Supplier,due_date AS Due_date,status AS Status,grand_total AS Total,cgst AS CGST,sgst AS SGST,igst AS IGST FROM purchase_inwards`, tenant: 'tenant_id', date: 'invoice_date' },
    legacyPurchases: { sql: `SELECT product_id AS productId,purchase_no AS Purchase,purchase_date AS Date,supplier_name AS Supplier,product_name AS Product,quantity AS Quantity,unit_cost AS Rate,gst_rate AS GST_rate,amount AS Total,status AS Status FROM purchases`, tenant: 'tenant_id', date: 'purchase_date' },
    receivables: { sql: `SELECT name AS Customer,phone AS Phone,gstin AS GSTIN,outstanding AS Outstanding,status AS Status FROM customers`, tenant: 'tenant_id' },
    payables: { sql: `SELECT name AS Supplier,phone AS Phone,gstin AS GSTIN,outstanding AS Outstanding,status AS Status FROM suppliers`, tenant: 'tenant_id' },
    cash: { sql: `SELECT payment_no AS Reference,payment_date AS Date,type AS Type,party_name AS Party,method AS Method,CASE WHEN type='Customer receipt' THEN amount ELSE 0 END AS Receipt,CASE WHEN type='Supplier payment' THEN amount ELSE 0 END AS Payment,notes AS Notes FROM payments`, tenant: 'tenant_id', date: 'payment_date' },
    customerLedger: { sql: `SELECT * FROM (SELECT tenant_id,invoice_date AS Date,invoice_no AS Reference,customer_name AS Party,'Sales invoice' AS Type,amount AS Debit,0 AS Credit FROM invoices UNION ALL SELECT tenant_id,payment_date,payment_no,party_name,type,0,amount FROM payments WHERE type='Customer receipt' UNION ALL SELECT tenant_id,return_date,return_no,party_name,type,0,amount FROM returns WHERE type='Sales return')`, tenant: 'tenant_id', date: 'Date' },
    supplierLedger: { sql: `SELECT * FROM (SELECT tenant_id,invoice_date AS Date,inward_no AS Reference,supplier_name AS Party,'Purchase inward' AS Type,0 AS Debit,grand_total AS Credit FROM purchase_inwards UNION ALL SELECT tenant_id,payment_date,payment_no,party_name,type,amount,0 FROM payments WHERE type='Supplier payment' UNION ALL SELECT tenant_id,return_date,return_no,party_name,type,amount,0 FROM returns WHERE type='Purchase return')`, tenant: 'tenant_id', date: 'Date' },
    gst: { sql: `SELECT * FROM (SELECT tenant_id,invoice_date AS Date,invoice_no AS Reference,customer_name AS Party,'Output tax' AS Type,cgst AS CGST,sgst AS SGST,igst AS IGST,amount AS Invoice_total FROM invoices UNION ALL SELECT tenant_id,invoice_date,inward_no,supplier_name,'Purchase tax',cgst,sgst,igst,grand_total FROM purchase_inwards)`, tenant: 'tenant_id', date: 'Date' },
    returns: { sql: `SELECT return_no AS Reference,return_date AS Date,type AS Type,party_name AS Party,reference_no AS Source_reference,amount AS Amount,reason AS Reason FROM returns`, tenant: 'tenant_id', date: 'return_date' },
    adjustments: { sql: `SELECT product_id AS productId,batch AS Batch,date(created_at/1000,'unixepoch') AS Date,previous_stock AS Previous_stock,new_stock AS New_stock,delta AS Change,reason AS Reason FROM stock_adjustments`, tenant: 'tenant_id', date: "date(created_at/1000,'unixepoch')" },
};
export async function pharmaReportData(userId: string, params: URLSearchParams) {
    const member = await getMembership(userId);
    if (!member)
        throw new Error('REPORT_ACCESS_DENIED');
    const kind = params.get('kind') || 'sales';
    if (!Object.hasOwn(pharmaReports, kind))
        throw new Error('Unknown report.');
    const from = reportDate(params.get('from')), to = reportDate(params.get('to'));
    if (from && to && from > to)
        throw new Error('Start date must precede end date.');
    const d = definitions[kind as PharmaReportKind], values: unknown[] = [member.tenantId];
    let where = ` WHERE ${d.tenant}=?`;
    if (kind === 'regulated')
        where += ' AND (m.is_schedule_h1=1 OR m.is_prescription_required=1 OR m.is_high_caution=1)';
    if (d.date) {
        if (from) {
            where += ` AND ${d.date}>=?`;
            values.push(from);
        }
        if (to) {
            where += ` AND ${d.date}<=?`;
            values.push(to);
        }
    }
    const result = await env.DB.prepare(d.sql + where + (d.date ? ` ORDER BY ${d.date} DESC` : '')).bind(...values).all<Record<string, unknown>>();
    const rows = result.results.map(({ tenant_id, ...row }) => row);
    return { rows, generatedAt: new Date().toISOString(), title: pharmaReports[kind as PharmaReportKind].title, note: pharmaReports[kind as PharmaReportKind].note, dateFiltered: !!d.date };
}
export async function reportProduct(userId: string, id: string) {
    const member = await getMembership(userId);
    if (!member)
        throw new Error('REPORT_ACCESS_DENIED');
    return env.DB.prepare(`SELECT p.name AS Product,m.composition AS Composition,p.manufacturer AS Manufacturer,m.marketed_by AS Marketer,p.batch AS Batch,p.pack AS Pack,p.expiry AS Expiry,p.mfg_date AS Manufactured,p.hsn AS HSN,m.category AS Category,m.caution_notes AS Caution FROM products p LEFT JOIN product_masters m ON m.id=p.product_master_id AND m.tenant_id=p.tenant_id WHERE p.tenant_id=? AND p.id=?`).bind(member.tenantId, id).first<Record<string, unknown>>();
}
