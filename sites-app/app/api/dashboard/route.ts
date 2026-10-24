import { NextResponse } from 'next/server';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getMembership } from '@/lib/medibill';
import { stockReportData } from '@/lib/stock-report-data';
import { selectStockReport } from '@/lib/stock-report';
export async function GET(request: Request) {
    const headers = { 'Cache-Control': 'private, no-store' };
    const user = await getChatGPTUser();
    if (!user)
        return NextResponse.json({ error: 'Sign in required.' }, { status: 401, headers });
    try {
        const member = await getMembership(user.userId);
        if (!member)
            return NextResponse.json({ error: 'Active workspace required.' }, { status: 403, headers });
        const period = new URL(request.url).searchParams.get('period') || 'month';
        if (!['today', 'month', 'year'].includes(period))
            return NextResponse.json({ error: 'Invalid period.' }, { status: 400, headers });
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const from = period === 'today' ? today : period === 'month' ? today.slice(0, 7) + '-01' : today.slice(0, 4) + '-01-01';
        const tenant = member.tenantId;
        const [sales, purchases, customers, suppliers, recent, stock] = await Promise.all([
            env.DB.prepare('SELECT invoice_date AS day,SUM(amount) AS amount,COUNT(*) AS count FROM invoices WHERE tenant_id=? AND invoice_date>=? AND invoice_date<=? GROUP BY invoice_date ORDER BY invoice_date').bind(tenant, from, today).all<{
                day: string;
                amount: number;
                count: number;
            }>(),
            env.DB.prepare(`SELECT day,SUM(amount) AS amount,COUNT(*) AS count FROM (SELECT invoice_date AS day,grand_total AS amount FROM purchase_inwards WHERE tenant_id=? UNION ALL SELECT purchase_date,amount FROM purchases WHERE tenant_id=?) WHERE day>=? AND day<=? GROUP BY day ORDER BY day`).bind(tenant, tenant, from, today).all<{
                day: string;
                amount: number;
                count: number;
            }>(),
            env.DB.prepare('SELECT name,outstanding FROM customers WHERE tenant_id=? AND outstanding>0 ORDER BY outstanding DESC').bind(tenant).all<{
                name: string;
                outstanding: number;
            }>(),
            env.DB.prepare('SELECT name,outstanding FROM suppliers WHERE tenant_id=? AND outstanding>0 ORDER BY outstanding DESC').bind(tenant).all<{
                name: string;
                outstanding: number;
            }>(),
            env.DB.prepare('SELECT id,invoice_no AS number,customer_name AS customer,invoice_date AS date,amount,status FROM invoices WHERE tenant_id=? ORDER BY invoice_date DESC,created_at DESC LIMIT 8').bind(tenant).all(),
            stockReportData(user.userId),
        ]);
        const options = { availability: 'all' as const, search: '', columns: ['name' as const], productsOnly: false };
        const expired = selectStockReport(stock.products, { ...options, condition: 'expired' });
        const near = selectStockReport(stock.products, { ...options, condition: 'near' });
        const low = selectStockReport(stock.products, { ...options, condition: 'low', lowThreshold: 10 });
        const expiredIds = new Set(expired.map(p => p.id));
        const saleable = stock.products.filter(p => p.stock > 0 && !expiredIds.has(p.id));
        const buckets = new Map<string, {
            day: string;
            sales: number;
            purchases: number;
        }>();
        const key = (day: string) => period === 'year' ? day.slice(0, 7) : day;
        for (const day = new Date(from + 'T00:00:00Z'); day.toISOString().slice(0, 10) <= today; day.setUTCDate(day.getUTCDate() + 1)) {
            const k = key(day.toISOString().slice(0, 10));
            buckets.set(k, { day: k, sales: 0, purchases: 0 });
        }
        for (const row of sales.results)
            buckets.get(key(row.day))!.sales += Number(row.amount);
        for (const row of purchases.results)
            buckets.get(key(row.day))!.purchases += Number(row.amount);
        const sum = (rows: {
            amount: number;
        }[]) => rows.reduce((n, r) => n + Number(r.amount), 0);
        const alerts = new Map<string, typeof stock.products[number] & {
            issue: string;
        }>();
        for (const [rows, issue] of [[expired, 'Expired'], [near, 'Near expiry'], [low, 'Low stock']] as const)
            for (const p of rows)
                if (!alerts.has(p.id))
                    alerts.set(p.id, { ...p, issue });
        return NextResponse.json({ period, from, to: today, generatedAt: new Date().toISOString(), sales: sum(sales.results), purchases: sum(purchases.results), salesCount: sales.results.reduce((n, r) => n + Number(r.count), 0), purchaseCount: purchases.results.reduce((n, r) => n + Number(r.count), 0), receivables: customers.results.reduce((n, r) => n + Number(r.outstanding), 0), payables: suppliers.results.reduce((n, r) => n + Number(r.outstanding), 0), customers: customers.results.slice(0, 5), suppliers: suppliers.results.slice(0, 5), trend: [...buckets.values()], recent: recent.results, alerts: [...alerts.values()].slice(0, 8), low: low.length, near: near.length, expired: expired.length, stockCost: saleable.reduce((n, p) => n + p.stock * p.purchaseRate, 0), stockMrp: saleable.reduce((n, p) => n + p.stock * p.mrp, 0) }, { headers });
    }
    catch {
        return NextResponse.json({ error: 'Unable to load dashboard. Please retry.' }, { status: 500, headers });
    }
}
