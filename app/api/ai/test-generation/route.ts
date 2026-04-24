/**
 * Automated Testing & Validation
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Accept the UI's richer shape (module description + multiple test types)
    // as well as the legacy {algorithm, parameters, testType} shape so existing
    // callers don't break. Coerce everything into the same prompt below.
    const body = await request.json();
    const moduleDescription: string | undefined = body.moduleDescription;
    const testTypes: string[] | undefined = Array.isArray(body.testTypes) ? body.testTypes : undefined;
    const language: string = body.language || 'systemverilog';
    const algorithm: string | undefined = body.algorithm;
    const parameters: Record<string, unknown> | undefined = body.parameters;
    const legacyType: string | undefined = body.testType;

    const types = testTypes && testTypes.length > 0
      ? testTypes
      : (legacyType ? [legacyType] : ['functional']);

    const target = moduleDescription
      ? `Module/Design: ${moduleDescription}`
      : `Algorithm: ${algorithm ?? 'unspecified'}\nParameters: ${parameters ? JSON.stringify(parameters) : 'n/a'}`;

    const systemPrompt = `You are a test generation expert. Create comprehensive test cases for chip design modules and algorithms.

Test types:
- functional: correctness tests
- corner: edge cases and boundary conditions
- performance: runtime and quality benchmarks
- regression: ensure no breaking changes

Output strict JSON only — no markdown fences, no comments, no JS literals like 'undefined'. Use null for unknown values.`;

    const prompt = `Generate ${types.join(', ')} tests (language: ${language}) for:
${target}

Return ONLY valid JSON in this shape:
{
  "tests": [
    {
      "name": "test name",
      "description": "what it tests",
      "type": "functional|corner|performance|regression",
      "input": {},
      "expectedOutput": {},
      "assertions": ["..."],
      "priority": "high|medium|low"
    }
  ],
  "coverage": {
    "scenarios": 0,
    "edgeCases": 0,
    "expectedCoverage": "string%"
  },
  "summary": "one-paragraph overview"
}`;

    const response = await fetch(`${process.env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'NeuralChip - Test Generation',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2500,
      }),
    });

    // Surface the upstream error instead of swallowing it into a 500. Without
    // this, a 404/401/429 from OpenRouter just becomes a cryptic parse crash.
    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: 'AI service error', upstreamStatus: response.status, upstreamBody: text.slice(0, 500) },
        { status: 502 },
      );
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';

    // Strip markdown fences + normalize common non-JSON tokens the model
    // emits (JS `undefined`, trailing commas) so JSON.parse doesn't die on
    // cosmetic issues.
    const cleaned = content
      .replace(/```json\n?/g, '')
      .replace(/```/g, '')
      .replace(/:\s*undefined\b/g, ': null')
      .replace(/,\s*([}\]])/g, '$1')
      .trim();

    try {
      const result = JSON.parse(cleaned);
      return NextResponse.json(result);
    } catch (parseErr) {
      // Don't black-hole the model output — return it so the UI can render
      // something useful and we can see what the model actually produced.
      return NextResponse.json(
        { error: 'Could not parse AI response as JSON', raw: cleaned.slice(0, 2000) },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error('Test generation error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
