/**
 * AI-Generated Tutorials & Learning Paths
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { topic, userLevel = 'beginner', learningGoal } = await request.json();

    const systemPrompt = `You are an educational content generator for chip design. Create personalized, interactive tutorials.

Teaching style:
- Start with concepts, then practical examples
- Use analogies for complex topics
- Include hands-on exercises
- Progressive difficulty
- Real-world applications`;

    const prompt = `Create a tutorial for: ${topic}

User level: ${userLevel}
Goal: ${learningGoal || 'understand and apply this concept'}

Generate a structured tutorial with:
1. Learning objectives
2. Prerequisites
3. Concept explanation (with analogies)
4. Step-by-step examples
5. Interactive exercises
6. Quiz questions
7. Further reading

Format as JSON:
{
  "title": "...",
  "duration": "estimated time",
  "objectives": ["..."],
  "prerequisites": ["..."],
  "sections": [
    {
      "title": "...",
      "content": "markdown content",
      "exercises": [{
        "prompt": "...",
        "solution": "...",
        "hints": ["..."]
      }]
    }
  ],
  "quiz": [
    {
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "correct": 0,
      "explanation": "..."
    }
  ],
  "nextSteps": ["..."]
}`;

    const response = await fetch(`${process.env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'NeuralChip - Tutorial Generation',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 4000,
      }),
    });

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    const tutorial = JSON.parse(content.replace(/```json\n?/g, '').replace(/```/g, '').trim());

    return NextResponse.json(tutorial);
  } catch (error) {
    console.error('Tutorial generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
