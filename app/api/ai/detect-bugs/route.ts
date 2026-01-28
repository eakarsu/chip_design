/**
 * AI-Powered Bug Detection
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { algorithm, result } = await request.json();

    const systemPrompt = `You are a chip design verification expert. Proactively detect bugs, violations, and potential issues before they cause failures.

Check for:
- Design rule violations (DRC)
- Timing issues
- Signal integrity problems
- Power integrity issues
- Routing congestion
- Placement overlaps
- Clock tree skew`;

    const prompt = `Analyze this design for potential bugs:

Algorithm: ${algorithm}
Result: ${JSON.stringify(result, null, 2)}

Respond with JSON:
{
  "bugs": [
    {
      "severity": "critical|warning|info",
      "type": "DRC|timing|signal_integrity|power|...",
      "description": "...",
      "location": "coordinates or component",
      "fix": "suggested fix",
      "confidence": 0-1
    }
  ],
  "summary": "overall assessment",
  "riskScore": 0-100
}`;

    const response = await fetch(`${process.env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'NeuralChip - Bug Detection',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    const result_parsed = JSON.parse(content.replace(/```json\n?/g, '').replace(/```/g, '').trim());

    return NextResponse.json(result_parsed);
  } catch (error) {
    console.error('Bug detection error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
