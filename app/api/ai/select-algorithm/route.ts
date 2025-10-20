/**
 * Natural Language Algorithm Selection API
 * Uses OpenRouter AI to recommend algorithms based on user descriptions
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    const systemPrompt = `You are an expert in chip design algorithms with knowledge of 70+ algorithms covering all major techniques from research literature. Given a user's natural language description, recommend the most appropriate algorithm(s).

Available categories and algorithms (70+ total):

PLACEMENT (7 algorithms):
- simulated_annealing: Probabilistic optimization with temperature cooling, escapes local minima
- genetic: Evolution-based with crossover/mutation, maintains population of solutions
- force_directed: Physics simulation with spring forces, natural wirelength minimization
- analytical: Modern RePlAce/DREAMPlace style, quadratic optimization + density spreading, best for large designs
- min_cut: Recursive partitioning minimizing cut edges, top-down approach
- gordian: Classic quadratic placement, fast linear system solving
- fastplace: Cell shifting with hybrid net model, production-quality

ROUTING (8 algorithms):
- maze_routing: Lee BFS algorithm, guaranteed shortest path, grid-based wave propagation
- a_star: Heuristic search with Manhattan distance, faster than maze routing
- global_routing: Coarse-grained planning, divides chip into regions, congestion-aware
- flute: Industry-standard Steiner tree (Fast Lookup Table), near-optimal with microsecond speed
- left_edge: Classic channel routing, assigns nets to horizontal tracks
- channel_routing: Manhattan routing in channels between cell rows
- detailed_routing: GridGraph fine-grained routing with exact DRC compliance
- pathfinder: Rip-up & reroute with negotiation, resolves congestion iteratively

FLOORPLANNING (6 algorithms):
- slicing_tree: Recursive binary partitioning, simple H/V cuts
- sequence_pair: Two sequences encode positions, more flexible than slicing
- b_star_tree: Most efficient non-slicing representation (1000+ citations), binary tree with ordered children
- o_tree: Ordered tree representation, horizontal contour-based
- corner_block_list: List-based representation using corner block concept
- tcg: Transitive Closure Graph, two directed graphs encode constraints

SYNTHESIS (6 algorithms):
- logic_optimization: Boolean minimization, constant propagation, dead code elimination
- technology_mapping: Maps generic logic to cell library, pattern matching
- abc: Berkeley ABC (industry standard), AIG-based with rewriting/refactoring/balancing
- espresso: Classic two-level minimization, sum-of-products optimization
- aig: And-Inverter Graph representation, structural hashing
- sat_based: Boolean satisfiability-based synthesis, finds optimal solutions

TIMING_ANALYSIS (2 algorithms):
- static_timing_analysis: Comprehensive path delay analysis without simulation
- critical_path: Finds longest delay path, determines max frequency

POWER_OPTIMIZATION (3 algorithms):
- clock_gating: Disables clocks to idle circuits, reduces dynamic power
- voltage_scaling: DVFS for power-performance tradeoff
- power_gating: Cuts power supply to unused blocks, eliminates leakage

CLOCK_TREE (4 algorithms):
- h_tree: Symmetric H-shaped, zero-skew distribution
- x_tree: Diagonal branches, compact layout
- mesh_clock: Grid structure, robust with redundancy
- mmm_algorithm: DME (Deferred-Merge Embedding) algorithm

PARTITIONING (6 algorithms):
- kernighan_lin: Classic iterative bisection, minimizes cut edges
- fiduccia_mattheyses: Linear-time FM refinement with gain buckets, faster than KL
- multilevel: Coarsening + partitioning + refinement, best for very large circuits
- spectral: Eigenvalue-based using Fiedler vector, natural clustering
- ratio_cut: Minimizes cut ratio for balanced partitions
- normalized_cut: Spectral clustering, minimizes normalized association

DRC_LVS (3 algorithms):
- design_rule_check: Verifies manufacturing constraints (width, spacing)
- layout_vs_schematic: Matches physical layout to logical netlist
- electrical_rule_check: Connectivity and electrical rules verification

REINFORCEMENT_LEARNING (5 algorithms):
- dqn_floorplanning: Deep Q-Network learns value functions for block placement
- ppo_floorplanning: Proximal Policy Optimization for stable policy learning
- q_learning_placement: Q-learning for cell placement decisions
- policy_gradient_placement: Policy gradient methods for placement
- actor_critic_routing: Actor-Critic for wire routing optimization

LEGALIZATION (3 algorithms - NEW):
- tetris: Row-by-row legalization like Tetris game, fast single-pass
- abacus: Dynamic programming for optimal single-row legalization
- flow_based: Min-cost flow for globally optimal cell-to-site assignment

BUFFER_INSERTION (3 algorithms - NEW):
- van_ginneken: Classic optimal buffer insertion (2000+ citations), DP on routing tree
- buffer_tree: Builds buffered tree considering slew and capacitance
- timing_driven: Inserts buffers to meet timing constraints on critical paths

CONGESTION_ESTIMATION (3 algorithms - NEW):
- rudy: RUDY (Rectangular Uniform wire DensitY), fast O(n) probabilistic estimation, industry standard
- probabilistic: Statistical modeling considering routing uncertainty
- grid_based: Discrete grid with resource usage tracking

SIGNAL_INTEGRITY (3 algorithms - NEW):
- crosstalk_analysis: Detects coupling noise between adjacent wires, victim/aggressor pairs
- noise_analysis: Signal quality analysis, noise margins, SNR computation
- coupling_capacitance: Extracts parasitic coupling between nets

IR_DROP (3 algorithms - NEW):
- power_grid_analysis: Simulates voltage drop across power network, modified nodal analysis
- voltage_drop: Calculates static/dynamic voltage drop, Ohm's law on power grid
- decap_placement: Optimally places decoupling capacitors to reduce IR drop

LITHOGRAPHY (3 algorithms - NEW):
- opc: Optical Proximity Correction, pre-distorts mask for sub-10nm manufacturing
- phase_shift_masking: Phase-shifting for enhanced resolution
- sraf: Sub-Resolution Assist Features for process window enlargement

CMP (3 algorithms - NEW):
- dummy_fill: Inserts dummy metal for uniform CMP polishing
- cmp_aware_routing: Routes considering CMP effects for better planarity
- density_balancing: Balances metal density across chip for uniform CMP

Respond with JSON in this exact format (no markdown, no code blocks):
{
  "recommendations": [
    {
      "category": "PLACEMENT",
      "algorithm": "simulated_annealing",
      "confidence": 0.9,
      "reasoning": "Why this algorithm fits the user's needs"
    }
  ],
  "summary": "Brief explanation of why these recommendations were made"
}`;

    const prompt = `User query: "${query}"

Analyze this request and recommend the best algorithm(s). Consider:
1. Keywords in the query (placement, routing, optimization, power, timing, etc.)
2. Quality vs speed tradeoffs mentioned
3. Problem size hints (small, large, complex)
4. Specific requirements (low power, fast runtime, etc.)

Return ONLY valid JSON, no markdown formatting.`;

    // Call OpenRouter
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
          model: 'anthropic/claude-3-haiku', // Fast and cheap
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1000,
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
      // Remove markdown code blocks if present
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
    console.error('Algorithm selection error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
