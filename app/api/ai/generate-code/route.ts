/**
 * Code Generation from Specifications
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { specification, language = 'verilog', style = 'rtl' } = await request.json();

    const systemPrompt = `You are an expert HDL code generator. Generate syntactically correct, synthesizable ${language.toUpperCase()} code from specifications.

Follow best practices:
- Clear module/entity definitions
- Proper signal declarations
- Synthesizable constructs
- Comments explaining functionality
- Testbench hints if requested`;

    const prompt = `Generate ${language.toUpperCase()} code for:

${specification}

Style: ${style}

Provide complete, synthesizable code with comments.`;

    const response = await fetch(`${process.env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'NeuralChip - Code Generation',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    const data = await response.json();
    const code = data.choices[0]?.message?.content || '';

    return NextResponse.json({ code, language, style });
  } catch (error) {
    console.error('Code generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
