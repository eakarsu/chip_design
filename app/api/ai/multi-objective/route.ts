/**
 * Multi-Objective Optimization
 */

import { NextRequest, NextResponse } from 'next/server';

// Extract the first top-level JSON value from a string. Haiku often appends
// prose after the JSON object ("Here's how the Pareto frontier was derived…"),
// which trips JSON.parse with "Unexpected non-whitespace character after JSON".
// Scan for the first `{` or `[` and walk forward tracking brace/bracket depth
// while respecting string literals and escapes.
function extractFirstJson(raw: string): string {
  const start = raw.search(/[{[]/);
  if (start < 0) return raw;
  const open = raw[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (inStr) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return raw.slice(start);
}

export async function POST(request: NextRequest) {
  try {
    const { objectives, constraints, numPoints = 5 } = await request.json();

    const systemPrompt = `You are a multi-objective optimization engine. Generate Pareto-optimal design points exploring tradeoffs between competing objectives.

Common objectives: power, performance, area, cost, reliability
Generate diverse solutions spanning the Pareto frontier.

Output strict JSON only. No prose before or after the JSON. No markdown fences. No comments. No JS literals like 'undefined' — use null for unknown values.`;

    const prompt = `Generate ${numPoints} Pareto-optimal design configurations:

Objectives: ${JSON.stringify(objectives)}
Constraints: ${JSON.stringify(constraints)}

For each point, provide:
- Algorithm selections
- Parameter configurations
- Predicted metrics for each objective
- Tradeoff explanation

Return ONLY valid JSON in this shape:
{
  "points": [
    {
      "id": 1,
      "name": "Power-Optimized",
      "algorithms": {},
      "parameters": {},
      "predicted": {
        "power": 0,
        "performance": 0,
        "area": 0
      },
      "tradeoffs": "...",
      "recommended": false
    }
  ],
  "paretoFront": "explanation of tradeoff space"
}`;

    const response = await fetch(`${process.env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'NeuralChip - Multi-Objective Optimization',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 3000,
      }),
    });

    // Surface upstream errors instead of swallowing them into a generic 500.
    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: 'AI service error', upstreamStatus: response.status, upstreamBody: text.slice(0, 500) },
        { status: 502 },
      );
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';

    // Clean up cosmetic issues Haiku emits: markdown fences, trailing prose
    // after the JSON object, JS `undefined` literals, trailing commas.
    const fenceless = content.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    const jsonOnly = extractFirstJson(fenceless);
    const cleaned = jsonOnly
      .replace(/:\s*undefined\b/g, ': null')
      .replace(/,\s*([}\]])/g, '$1')
      .trim();

    try {
      const result = JSON.parse(cleaned);
      return NextResponse.json(result);
    } catch (parseErr) {
      return NextResponse.json(
        { error: 'Could not parse AI response as JSON', raw: cleaned.slice(0, 2000) },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error('Multi-objective optimization error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
