// // === Batch 09 Gaps & Frontend Mounts ===
// Gap-nonai endpoint: Enterprise SSO (SAML)
import { NextRequest, NextResponse } from 'next/server';

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

let _persistInit = false;
async function persist(feature: string, input: any, output: any) {
  try {
    // @ts-ignore
    const mod = await import('@prisma/client').catch(() => null);
    if (!mod) return;
    // @ts-ignore
    const p = new mod.PrismaClient();
    if (!_persistInit) {
      await p.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS gap_features (id SERIAL PRIMARY KEY, feature TEXT, input JSONB, output JSONB, created_at TIMESTAMPTZ DEFAULT NOW())');
      _persistInit = true;
    }
    await p.$executeRawUnsafe('INSERT INTO gap_features(feature, input, output) VALUES ($1, $2::jsonb, $3::jsonb)', feature, JSON.stringify(input || {}), JSON.stringify(output || {}));
  } catch {}
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENROUTER_API_KEY) return NextResponse.json({ error: 'OPENROUTER_API_KEY missing' }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const r = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      body: JSON.stringify({ model: OPENROUTER_MODEL, messages: [
        { role: 'system', content: 'You are an expert assistant. Reply concisely in JSON.' },
        { role: 'user', content: `Feature: Enterprise SSO (SAML)\nContext: ${JSON.stringify(body)}\nReturn JSON {"summary":"","key_points":[""],"recommendations":[""]}` }
      ], max_tokens: 1500, temperature: 0.4 })
    });
    if (!r.ok) return NextResponse.json({ error: `AI ${r.status}` }, { status: 502 });
    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || '';
    let parsed: any = null;
    try { const m = content.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch {}
    const out = { raw: content, parsed, model: data?.model };
    await persist('enterprise-sso-saml', body, out);
    return NextResponse.json({ feature: 'enterprise-sso-saml', title: 'Enterprise SSO (SAML)', result: out });
  } catch (err: any) { return NextResponse.json({ error: err?.message || 'error' }, { status: 500 }); }
}
