/**
 * Visual Design Understanding
 * Multimodal AI for analyzing chip layout images
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const layoutAnalysisSchema = z.object({
  image: z.string(), // base64 encoded
  question: z.string().optional(),
  analysisType: z.enum(['general', 'congestion', 'hotspots', 'violations', 'comparison']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image, question, analysisType = 'general' } = layoutAnalysisSchema.parse(body);

    const systemPrompt = `You are an expert chip design analyzer with computer vision capabilities. Analyze chip layout visualizations and provide actionable insights.

Your expertise includes:
- Identifying congestion hotspots
- Detecting design rule violations
- Analyzing routing quality
- Identifying power/thermal hotspots
- Comparing layouts
- Spotting placement issues
- Evaluating clock tree quality

Provide specific, actionable recommendations with coordinates when possible.`;

    let userPrompt = '';
    switch (analysisType) {
      case 'congestion':
        userPrompt = 'Analyze this chip layout for routing congestion. Identify congested regions and suggest improvements.';
        break;
      case 'hotspots':
        userPrompt = 'Identify power/thermal hotspots in this layout. Explain causes and mitigation strategies.';
        break;
      case 'violations':
        userPrompt = 'Check for design rule violations, overlaps, or spacing issues. List all problems found.';
        break;
      case 'comparison':
        userPrompt = 'Compare these layouts and explain key differences, advantages/disadvantages of each.';
        break;
      default:
        userPrompt = question || 'Analyze this chip layout and provide insights about quality, issues, and optimization opportunities.';
    }

    const openrouterResponse = await fetch(
      `${process.env.OPENROUTER_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
          'X-Title': 'NeuralChip AI Platform - Layout Analysis',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3.5-sonnet', // Vision model
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/png',
                    data: image.replace(/^data:image\/\w+;base64,/, ''),
                  },
                },
                {
                  type: 'text',
                  text: userPrompt,
                },
              ],
            },
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
        { error: 'AI service error', details: errorText },
        { status: 500 }
      );
    }

    const data = await openrouterResponse.json();
    const analysis = data.choices[0]?.message?.content || '';

    return NextResponse.json({
      analysis,
      analysisType,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Layout analysis error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
