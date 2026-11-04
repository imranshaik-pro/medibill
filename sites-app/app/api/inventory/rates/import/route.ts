import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { createFullBackup, getMembership } from '@/lib/medibill';
import { importInventoryRates, RateImportError } from '@/lib/inventory-rate-import';
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Cross-origin import not allowed' }, { status: 403 });
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 1024 * 1024) return NextResponse.json({ error: 'Import file exceeds 1 MB' }, { status: 413 });
    let body;
    try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid import request' }, { status: 400 });
    return NextResponse.json(await importInventoryRates(env.DB, await getMembership(user.userId), body, () => createFullBackup(user.userId, 'pre_rate_import')));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to import rates' }, { status: error instanceof RateImportError ? error.status : 500 });
  }
}
