/**
 * Intelligent Error Diagnosis API
 * Uses OpenRouter AI to diagnose algorithm errors and suggest fixes
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { error, algorithm, category, parameters, context } = await request.json();

    if (!error || !algorithm || !category) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const systemPrompt = `You are a chip design debugging expert. Analyze errors from chip design algorithms and provide actionable solutions.

Your responses should:
1. Identify the root cause clearly
2. Provide specific, actionable fixes
3. Explain why each solution works
4. Include prevention tips

Respond with JSON in this exact format (no markdown, no code blocks):
{
  "diagnosis": "Clear explanation of what went wrong",
  "rootCause": "The underlying reason for the error",
  "solutions": [
    {
      "fix": "Specific action to take (e.g., 'Increase iterations to 1000')",
      "explanation": "Why this will help solve the problem",
      "difficulty": "easy|medium|hard"
    }
  ],
  "preventionTips": ["Tip to avoid this error in the future"],
  "severity": "low|medium|high|critical"
}`;

    const prompt = `Algorithm: ${algorithm} (Category: ${category})

Error message: ${error}

${parameters ? `Current parameters:\n${JSON.stringify(parameters, null, 2)}` : ''}

${context ? `Additional context: ${context}` : ''}

Analyze this error and provide:
1. What went wrong
2. Why it happened
3. How to fix it
4. How to prevent it

Return ONLY valid JSON, no markdown formatting.`;

    // Call OpenRouter with Claude Sonnet for better diagnosis
    const openrouterResponse = await fetch(
      `${process.env.OPENROUTER_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
          'X-Title': 'NeuralChip AI Platform',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3.5-sonnet', // Smarter model for diagnosis
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2, // Lower for more consistent diagnosis
          max_tokens: 1500,
        }),
      }
    );

    if (!openrouterResponse.ok) {
      const errorText = await openrouterResponse.text();
      console.error('OpenRouter error:', errorText);
      return NextResponse.json(
        { error: 'AI service error' },
        { status: 500 }
      );
    }

    const data = await openrouterResponse.json();
    const content = data.choices[0]?.message?.content || '';

    // Parse JSON from response
    let result;
    try {
      const jsonStr = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      result = JSON.parse(jsonStr);
    } catch (error) {
      console.error('Failed to parse AI response:', content);
      return NextResponse.json(
        { error: 'Invalid AI response format' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error diagnosis error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
