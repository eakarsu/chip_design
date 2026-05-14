/**
 * AI-Powered Documentation Generator
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';

// Apply pass 5: rate-limit added (mechanical, matches /api/ai pattern)
function getClientId(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
  return ip;
}

export async function POST(request: NextRequest) {
  try {
    const clientId = getClientId(request);
    const rateLimitResult = rateLimit(`generate-docs:${clientId}`, { windowMs: 60000, maxRequests: 10 });
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', message: 'Too many requests. Please try again later.', retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000) },
        { status: 429, headers: { 'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': rateLimitResult.remaining.toString(), 'X-RateLimit-Reset': rateLimitResult.resetAt.toString(), 'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString() } }
      );
    }
    const { designData, format = 'markdown' } = await request.json();

    const systemPrompt = `You are a technical documentation generator for chip designs. Create comprehensive, professional documentation.`;

    const prompt = `Generate ${format} documentation for this chip design:

Design Data:
${JSON.stringify(designData, null, 2)}

Include:
1. Executive Summary
2. Design Specifications
3. Algorithm Decisions with Justifications
4. Performance Analysis
5. Results & Metrics
6. Recommendations

Format: Professional ${format}`;

    const response = await fetch(`${process.env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'NeuralChip - Docs Generator',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 3000,
      }),
    });

    const data = await response.json();
    const documentation = data.choices[0]?.message?.content || '';

    return NextResponse.json({ documentation, format });
  } catch (error) {
    console.error('Documentation generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
