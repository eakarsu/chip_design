/**
 * Smart Recommendations API
 * Uses OpenRouter AI to analyze historical data and suggest optimizations
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEvents } from '@/lib/analytics';

export async function POST(request: NextRequest) {
  try {
    const { currentParams, category, algorithm } = await request.json();

    if (!currentParams || !category || !algorithm) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get historical data from analytics
    const events = getEvents();
    const historicalRuns = events
      .filter((e) => e.type === 'algorithm_run' && e.algorithm === algorithm)
      .map((e) => ({
        params: e.metadata?.parameters || {},
        runtime: (e.metadata?.runtime as number) || 0,
        success: e.metadata?.success !== false,
        cellCount: e.metadata?.cellCount as number | undefined,
        netCount: e.metadata?.netCount as number | undefined,
      }))
      .slice(-20); // Last 20 runs

    const systemPrompt = `You are an AI optimization expert for chip design algorithms. Analyze historical performance data and current parameters to suggest improvements.

Consider:
1. Success patterns in historical data
2. Runtime vs quality tradeoffs
3. Parameter correlations and scaling laws
4. Problem size impact on performance

Respond with JSON in this exact format (no markdown, no code blocks):
{
  "recommendations": [
    {
      "parameter": "iterations",
      "currentValue": 500,
      "suggestedValue": 750,
      "improvement": "Expected improvement description",
      "reasoning": "Why this change will help based on data",
      "confidence": 0.85
    }
  ],
  "insights": [
    "Key finding from historical data analysis"
  ],
  "estimatedImprovement": "Overall expected improvement summary",
  "riskLevel": "low|medium|high"
}`;

    let prompt = `Algorithm: ${algorithm} (Category: ${category})

Current parameters:
${JSON.stringify(currentParams, null, 2)}
`;

    if (historicalRuns.length > 0) {
      const successRate = (historicalRuns.filter(h => h.success).length / historicalRuns.length * 100).toFixed(1);
      const avgRuntime = (historicalRuns.reduce((sum, h) => sum + (h.runtime || 0), 0) / historicalRuns.length).toFixed(2);

      prompt += `
Historical performance data (${historicalRuns.length} runs):
- Success rate: ${successRate}%
- Average runtime: ${avgRuntime}ms

Sample runs:
${JSON.stringify(historicalRuns.slice(0, 5), null, 2)}

Based on this historical data, recommend parameter optimizations that will improve performance.`;
    } else {
      prompt += `
No historical data available for this algorithm.

Provide general best-practice recommendations for these parameters based on:
- Problem size (cellCount: ${currentParams.cellCount}, netCount: ${currentParams.netCount})
- Chip dimensions (${currentParams.chipWidth}x${currentParams.chipHeight})
- Algorithm characteristics`;
    }

    prompt += `\n\nReturn ONLY valid JSON, no markdown formatting.`;

    // Call OpenRouter with Claude Sonnet for analysis
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
          model: 'anthropic/claude-3.5-sonnet',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 2000,
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

    // Add metadata about data source
    result.dataSource = historicalRuns.length > 0 ? 'historical' : 'best-practices';
    result.sampleSize = historicalRuns.length;

    return NextResponse.json(result);
  } catch (error) {
    console.error('Smart recommendations error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
