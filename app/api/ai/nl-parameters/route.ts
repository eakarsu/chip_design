/**
 * Natural Language Parameter Configuration
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
    const rateLimitResult = rateLimit(`nl-parameters:${clientId}`, { windowMs: 60000, maxRequests: 10 });
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', message: 'Too many requests. Please try again later.', retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000) },
        { status: 429, headers: { 'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': rateLimitResult.remaining.toString(), 'X-RateLimit-Reset': rateLimitResult.resetAt.toString(), 'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString() } }
      );
    }
    const { nlCommand, algorithm, category, currentParams } = await request.json();

    const systemPrompt = `You are a parameter configuration assistant. Convert natural language commands to algorithm parameters.

Examples:
- "make it fast" → reduce iterations, increase grid size
- "high quality" → increase iterations, finer grid
- "very aggressive" → high temperature, more exploration
- "low power mode" → enable clock gating, reduce voltage

Respond with JSON:
{
  "parameters": { "param": value },
  "changes": ["explanation of each change"],
  "tradeoffs": "speed vs quality explanation"
}`;

    const prompt = `Algorithm: ${algorithm} (${category})
Current parameters: ${JSON.stringify(currentParams)}
Command: "${nlCommand}"

Convert this to parameter changes.`;

    const response = await fetch(`${process.env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'NeuralChip - NL Parameters',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3-haiku',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    const result = JSON.parse(content.replace(/```json\n?/g, '').replace(/```/g, '').trim());

    return NextResponse.json(result);
  } catch (error) {
    console.error('NL parameters error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
