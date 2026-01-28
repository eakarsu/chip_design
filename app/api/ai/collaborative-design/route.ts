/**
 * Collaborative Design with AI
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { action, designs, conflictData } = await request.json();

    let systemPrompt = '';
    let userPrompt = '';

    switch (action) {
      case 'merge':
        systemPrompt = `You are a design merge coordinator. Intelligently merge multiple chip designs, resolving conflicts and preserving the best aspects of each.`;
        userPrompt = `Merge these designs:
${JSON.stringify(designs, null, 2)}

Provide a merged design with:
- Conflict resolution strategy
- Best practices from each design
- Unified parameter set
- Justifications for choices`;
        break;

      case 'review':
        systemPrompt = `You are a design reviewer. Provide constructive feedback on chip designs, identifying strengths and improvement opportunities.`;
        userPrompt = `Review this design:
${JSON.stringify(designs[0], null, 2)}

Provide:
- Strengths
- Issues/concerns
- Improvement suggestions
- Best practice recommendations`;
        break;

      case 'resolve_conflict':
        systemPrompt = `You are a conflict resolution expert. When multiple designers make different choices, recommend the best approach.`;
        userPrompt = `Resolve this conflict:
${JSON.stringify(conflictData, null, 2)}

Choose the best option and explain why.`;
        break;
    }

    const response = await fetch(`${process.env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'NeuralChip - Collaborative Design',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 2500,
      }),
    });

    const data = await response.json();
    const result = data.choices[0]?.message?.content || '';

    return NextResponse.json({ result, action });
  } catch (error) {
    console.error('Collaborative design error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
