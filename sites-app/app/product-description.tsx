"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
export function ProductDescription({ id }: {
    id: string;
}) {
    const [open, setOpen] = useState(false), [data, setData] = useState<Record<string, unknown> | null>(null), [error, setError] = useState('');
    async function show() { setOpen(true); setData(null); setError(''); try {
        const r = await fetch('/api/reports/product?id=' + encodeURIComponent(id), { cache: 'no-store' });
        const out = await r.json() as {
            product?: Record<string, unknown>;
            error?: string;
        };
        if (!r.ok || !out.product)
            throw new Error(out.error || 'Unable to load product');
        setData(out.product);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load product');
    } }
    return <><Button type="button" variant="outline" size="sm" onClick={show}>Product Description</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Product Description</DialogTitle><DialogDescription>Current recorded specifications. Historical invoice values remain in the report.</DialogDescription></DialogHeader>{error ? <p role="alert">{error}</p> : data ? <dl style={{ maxHeight: '60vh', overflow: 'auto' }}>{Object.entries(data).map(([k, v]) => <div key={k} style={{ padding: 8 }}><dt><b>{k}</b></dt><dd style={{ whiteSpace: 'pre-wrap' }}>{String(v ?? '').trim() || 'Not recorded'}</dd></div>)}</dl> : <p role="status">Loading…</p>}</DialogContent></Dialog></>;
}
