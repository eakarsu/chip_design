/**
 * AI Chip Design Copilot
 * Conversational assistant for chip design guidance
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const copilotRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    })
  ),
  designContext: z.object({
    currentAlgorithm: z.string().optional(),
    currentParams: z.record(z.any()).optional(),
    lastResult: z.any().optional(),
    history: z.array(z.any()).optional(),
  }).optional(),
  stream: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, designContext, stream } = copilotRequestSchema.parse(body);

    // Build enhanced system prompt with design context
    const systemPrompt = `You are an expert AI chip design assistant embedded in the NeuralChip AI Platform. You help users design chips through natural conversation.

Available capabilities:
- 80+ algorithms across 17 categories (placement, routing, floorplanning, synthesis, timing, power, clock tree, partitioning, DRC/LVS, RL, legalization, buffer insertion, congestion, signal integrity, IR drop, lithography, CMP)
- Real-time algorithm execution and visualization
- Parameter tuning and optimization
- Design flow generation and automation

${designContext ? `
Current Design Context:
- Algorithm: ${designContext.currentAlgorithm || 'None'}
- Parameters: ${JSON.stringify(designContext.currentParams || {}, null, 2)}
- Last Result: ${designContext.lastResult ? 'Available' : 'None'}
- History: ${designContext.history?.length || 0} previous actions
` : ''}

Your role:
1. Understand user's design intent and requirements
2. Recommend appropriate algorithms and parameters
3. Explain results and suggest optimizations
4. Guide users through complete design flows
5. Answer questions about chip design concepts
6. Provide code examples when relevant

Communication style:
- Be concise and actionable
- Use technical terms but explain when needed
- Provide specific recommendations with reasoning
- Ask clarifying questions when requirements are unclear
- Reference actual algorithm names from the platform

When suggesting algorithms, use this format:
"I recommend [algorithm_name] from [category] because [reason]"

When suggesting parameters, provide actual values and explain why.`;

    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    // Call OpenRouter
    const openrouterResponse = await fetch(
      `${process.env.OPENROUTER_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
          'X-Title': 'NeuralChip AI Platform - Copilot',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3.5-sonnet',
          messages: allMessages,
          temperature: 0.7,
          max_tokens: 2000,
          stream,
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

    if (stream) {
      // Return streaming response
      return new NextResponse(openrouterResponse.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    const data = await openrouterResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Copilot error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
