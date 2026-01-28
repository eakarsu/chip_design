/**
 * Multi-Objective Optimization
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { objectives, constraints, numPoints = 5 } = await request.json();

    const systemPrompt = `You are a multi-objective optimization engine. Generate Pareto-optimal design points exploring tradeoffs between competing objectives.

Common objectives: power, performance, area, cost, reliability
Generate diverse solutions spanning the Pareto frontier.`;

    const prompt = `Generate ${numPoints} Pareto-optimal design configurations:

Objectives: ${JSON.stringify(objectives)}
Constraints: ${JSON.stringify(constraints)}

For each point, provide:
- Algorithm selections
- Parameter configurations
- Predicted metrics for each objective
- Tradeoff explanation

Respond with JSON:
{
  "points": [
    {
      "id": 1,
      "name": "Power-Optimized",
      "algorithms": {...},
      "parameters": {...},
      "predicted": {
        "power": value,
        "performance": value,
        "area": value
      },
      "tradeoffs": "...",
      "recommended": boolean
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
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    const result = JSON.parse(content.replace(/```json\n?/g, '').replace(/```/g, '').trim());

    return NextResponse.json(result);
  } catch (error) {
    console.error('Multi-objective optimization error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
