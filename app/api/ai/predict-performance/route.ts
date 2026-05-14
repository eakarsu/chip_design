/**
 * Predictive Performance Modeling
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEvents } from '@/lib/analytics';
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
    const rateLimitResult = rateLimit(`predict-performance:${clientId}`, { windowMs: 60000, maxRequests: 10 });
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', message: 'Too many requests. Please try again later.', retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000) },
        { status: 429, headers: { 'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': rateLimitResult.remaining.toString(), 'X-RateLimit-Reset': rateLimitResult.resetAt.toString(), 'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString() } }
      );
    }
    const { algorithm, parameters } = await request.json();

    // Get historical data
    const events = getEvents();
    const historicalRuns = events
      .filter((e) => e.type === 'algorithm_run' && e.algorithm === algorithm)
      .map((e) => ({
        params: e.metadata?.parameters || {},
        runtime: e.metadata?.runtime || 0,
        quality: e.metadata?.quality || 0,
        success: e.metadata?.success !== false,
      }))
      .slice(-50);

    const systemPrompt = `You are a performance prediction ML model. Predict algorithm runtime and quality before execution based on historical data and parameters.`;

    const prompt = `Algorithm: ${algorithm}
Parameters: ${JSON.stringify(parameters)}
Historical data: ${JSON.stringify(historicalRuns.slice(0, 10))}

Predict:
{
  "estimatedRuntime": milliseconds,
  "estimatedQuality": 0-100,
  "successProbability": 0-1,
  "confidence": 0-1,
  "reasoning": "why these predictions",
  "warnings": ["potential issues"],
  "recommendations": ["suggestions to improve"]
}`;

    const response = await fetch(`${process.env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'NeuralChip - Performance Prediction',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1000,
      }),
    });

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    const result = JSON.parse(content.replace(/```json\n?/g, '').replace(/```/g, '').trim());

    return NextResponse.json({ ...result, sampleSize: historicalRuns.length });
  } catch (error) {
    console.error('Performance prediction error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
