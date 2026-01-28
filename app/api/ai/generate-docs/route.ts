/**
 * AI-Powered Documentation Generator
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
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
        model: 'anthropic/claude-3.5-sonnet',
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
