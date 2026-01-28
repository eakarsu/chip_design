/**
 * Automated Design Flow Generation
 * Generates complete multi-step design flows from requirements
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const flowRequestSchema = z.object({
  requirements: z.string(),
  designSpecs: z.object({
    chipType: z.string().optional(), // IoT, GPU, CPU, ASIC
    gateCount: z.number().optional(),
    powerBudget: z.number().optional(), // mW
    frequency: z.number().optional(), // MHz
    area: z.number().optional(), // mm²
    priority: z.enum(['speed', 'power', 'area', 'balanced']).optional(),
  }).optional(),
  generateAlternatives: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requirements, designSpecs, generateAlternatives } = flowRequestSchema.parse(body);

    const systemPrompt = `You are an expert chip design automation system. Generate complete design flows from requirements.

Available Algorithm Categories & Key Algorithms:

1. SYNTHESIS: logic_optimization, technology_mapping, abc, espresso
2. FLOORPLANNING: b_star_tree, sequence_pair, slicing_tree
3. PLACEMENT: analytical, simulated_annealing, genetic, force_directed
4. CLOCK_TREE: h_tree, mesh_clock, mmm_algorithm
5. ROUTING: flute, pathfinder, detailed_routing, global_routing
6. LEGALIZATION: abacus, tetris, flow_based
7. BUFFER_INSERTION: van_ginneken, timing_driven
8. POWER_OPTIMIZATION: clock_gating, voltage_scaling, power_gating
9. TIMING_ANALYSIS: static_timing_analysis, critical_path
10. CONGESTION_ESTIMATION: rudy, probabilistic
11. SIGNAL_INTEGRITY: crosstalk_analysis, noise_analysis
12. IR_DROP: power_grid_analysis, decap_placement
13. DRC_LVS: design_rule_check, layout_vs_schematic

Design Flow Structure:
Each step should have:
- step: number (execution order)
- category: algorithm category
- algorithm: specific algorithm name
- parameters: recommended parameters (with values)
- reason: why this algorithm/parameter choice
- estimatedTime: rough runtime estimate
- dependencies: which steps must complete first

Respond with JSON in this format (no markdown):
{
  "flow": {
    "name": "Low-Power IoT Design Flow",
    "description": "Complete flow optimized for low power consumption",
    "totalSteps": 10,
    "estimatedDuration": "15-20 minutes",
    "steps": [
      {
        "step": 1,
        "category": "SYNTHESIS",
        "algorithm": "abc",
        "parameters": {
          "optimizationGoal": "area",
          "iterations": 100
        },
        "reason": "ABC provides excellent area optimization for small designs",
        "estimatedTime": "30s",
        "dependencies": []
      }
    ]
  },
  ${generateAlternatives ? '"alternatives": [...],' : ''}
  "insights": [
    "Key decisions and tradeoffs"
  ]
}`;

    const prompt = `Generate a complete chip design flow for:

Requirements: ${requirements}

${designSpecs ? `Design Specifications:
- Chip Type: ${designSpecs.chipType || 'Not specified'}
- Gate Count: ${designSpecs.gateCount || 'Not specified'}
- Power Budget: ${designSpecs.powerBudget ? `${designSpecs.powerBudget}mW` : 'Not specified'}
- Target Frequency: ${designSpecs.frequency ? `${designSpecs.frequency}MHz` : 'Not specified'}
- Area Constraint: ${designSpecs.area ? `${designSpecs.area}mm²` : 'Not specified'}
- Priority: ${designSpecs.priority || 'balanced'}
` : ''}

${generateAlternatives ? 'Generate 3 alternative flows with different tradeoffs (speed-optimized, power-optimized, balanced).' : 'Generate one optimal flow.'}

Include all necessary steps from synthesis to verification. Recommend specific parameters for each algorithm based on the requirements.

Return ONLY valid JSON, no markdown.`;

    const openrouterResponse = await fetch(
      `${process.env.OPENROUTER_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
          'X-Title': 'NeuralChip AI Platform - Flow Generation',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3.5-sonnet',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.5,
          max_tokens: 4000,
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
        { error: 'Invalid AI response format', rawResponse: content },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Flow generation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
