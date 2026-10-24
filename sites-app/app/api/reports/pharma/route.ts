import { NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { pharmaReportData } from '@/lib/pharma-report-data';
export async function GET(r: Request) { const headers = { 'Cache-Control': 'private, no-store' }; const u = await getChatGPTUser(); if (!u)
    return NextResponse.json({ error: 'Sign in to view reports.' }, { status: 401, headers }); try {
    return NextResponse.json(await pharmaReportData(u.userId, new URL(r.url).searchParams), { headers });
}
catch (e) {
    const message = e instanceof Error ? e.message : '';
    const denied = message === 'REPORT_ACCESS_DENIED';
    return NextResponse.json({ error: denied ? 'Active workspace required.' : /^(Unknown report|Enter a valid|Start date)/.test(message) ? message : 'Unable to generate report. Please retry.' }, { status: denied ? 403 : 400, headers });
} }
