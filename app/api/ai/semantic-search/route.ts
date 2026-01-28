/**
 * Intelligent Semantic Search
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { query, context = 'all' } = await request.json();

    const systemPrompt = `You are a semantic search engine for chip design. Find relevant algorithms, documentation, and resources based on user intent, not just keywords.

Available content:
- 80+ algorithms across 17 categories
- Documentation articles
- Templates and examples
- Past designs

Return results ranked by relevance with explanations.`;

    const prompt = `Search query: "${query}"
Context: ${context}

Respond with JSON:
{
  "results": [
    {
      "type": "algorithm|doc|template",
      "title": "...",
      "category": "...",
      "relevance": 0.95,
      "reason": "why this matches",
      "link": "/path"
    }
  ],
  "suggestions": ["related search suggestions"]
}`;

    const response = await fetch(`${process.env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'NeuralChip - Semantic Search',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    const result = JSON.parse(content.replace(/```json\n?/g, '').replace(/```/g, '').trim());

    return NextResponse.json(result);
  } catch (error) {
    console.error('Semantic search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
