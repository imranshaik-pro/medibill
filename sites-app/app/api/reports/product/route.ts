import { NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { reportProduct } from '@/lib/pharma-report-data';
export async function GET(r: Request) { const headers = { 'Cache-Control': 'private, no-store' }; const u = await getChatGPTUser(); if (!u)
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401, headers }); try {
    const row = await reportProduct(u.userId, new URL(r.url).searchParams.get('id') || '');
    return NextResponse.json(row ? { product: row } : { error: 'Product not found.' }, { status: row ? 200 : 404, headers });
}
catch {
    return NextResponse.json({ error: 'Unable to load product details.' }, { status: 403, headers });
} }
