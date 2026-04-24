import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runPlacement } from '@/lib/algorithms/placement';
import { runRouting } from '@/lib/algorithms/routing';
import { runFloorplanning } from '@/lib/algorithms/floorplanning';
import { runSynthesis } from '@/lib/algorithms/synthesis';
import { runTiming } from '@/lib/algorithms/timing';
import { runPower } from '@/lib/algorithms/power';
import { runClockTree } from '@/lib/algorithms/clocktree';
import { runPartitioning } from '@/lib/algorithms/partitioning';
import { runVerification } from '@/lib/algorithms/verification';
import {
  runSignalIntegrity, runIRDrop, runLithography, runCMP,
} from '@/lib/algorithms/manufacturing';
import { runRL } from '@/lib/algorithms/reinforcement';
import { paretoFrontier, bestByWeights, hypervolume, toVizPoints } from '@/lib/algorithms/pareto';
import { applyEcoOperations } from '@/lib/algorithms/eco_flow';
import { runMMMC, defaultCorners } from '@/lib/algorithms/mmmc_sta';
import { runDrc } from '@/lib/algorithms/drc_ruledeck';
import { runDft } from '@/lib/algorithms/dft';
import { runThermal } from '@/lib/algorithms/thermal';
import { algorithmRuns } from '@/lib/db';
import { randomUUID } from 'crypto';
import { rateLimit } from '@/lib/rateLimit';
import {
  AlgorithmCategory,
  PlacementParams,
  RoutingParams,
  FloorplanningParams,
  SynthesisParams,
  TimingParams,
  PowerParams,
  ClockTreeParams,
  PartitioningParams,
  DRCLVSParams,
  RLParams,
} from '@/types/algorithms';

// Validation schema
const algorithmRequestSchema = z.object({
  category: z.nativeEnum(AlgorithmCategory),
  algorithm: z.string(),
  parameters: z.any(), // Will be validated based on category
});

// Rate limit per client. The compare page's "run all → top 3" mode fires one
// POST per (category, algorithm) in a tight loop — currently ~100 total — so
// the ceiling needs to absorb a full catalog run without throttling legit UI
// traffic. 300/min keeps us protective against actual abuse (sustained load
// is still impossible) while letting the compare page complete end-to-end.
const ALGORITHM_RATE = { windowMs: 60_000, maxRequests: 300 };

function clientId(request: NextRequest): string {
  // Trust the first X-Forwarded-For IP when behind a proxy; fall back to
  // the cookie (so logged-in users share a bucket across IPs) and then
  // to a coarse "global" bucket. Good enough for abuse deterrence — not
  // a substitute for per-user quota accounting.
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return `ip:${fwd.split(',')[0].trim()}`;
  const real = request.headers.get('x-real-ip');
  if (real) return `ip:${real}`;
  const token = request.cookies.get('auth-token')?.value;
  if (token) return `sess:${token.slice(0, 24)}`;
  return 'anon:global';
}

export async function POST(request: NextRequest) {
  const t0 = performance.now();
  const rl = rateLimit(`algorithms:${clientId(request)}`, ALGORITHM_RATE);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: 'Algorithm run rate limit exceeded. Try again later.',
        resetAt: new Date(rl.resetAt).toISOString(),
      },
      {
        status: 429,
        headers: {
          'Retry-After': Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)).toString(),
          'X-RateLimit-Limit': ALGORITHM_RATE.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(rl.resetAt / 1000).toString(),
        },
      },
    );
  }

  try {
    const body = await request.json();
    const { category, algorithm, parameters } = algorithmRequestSchema.parse(body);

    let result;
    const timestamp = new Date().toISOString();

    switch (category) {
      case AlgorithmCategory.PLACEMENT:
        result = runPlacement(parameters as PlacementParams);
        break;

      case AlgorithmCategory.ROUTING:
        result = runRouting(parameters as RoutingParams);
        break;

      case AlgorithmCategory.FLOORPLANNING:
        result = runFloorplanning(parameters as FloorplanningParams);
        break;

      case AlgorithmCategory.SYNTHESIS:
        result = runSynthesis(parameters as SynthesisParams);
        break;

      case AlgorithmCategory.TIMING_ANALYSIS:
        if (algorithm === 'mmmc_sta') {
          // parameters: { paths, corners?, opts? }
          const p = parameters as any;
          const corners = p.corners ?? defaultCorners();
          result = runMMMC(corners, p.paths ?? [], p.opts ?? {}) as any;
        } else {
          result = runTiming(parameters as TimingParams);
        }
        break;

      case AlgorithmCategory.POWER_OPTIMIZATION:
        result = runPower(parameters as PowerParams);
        break;

      case AlgorithmCategory.CLOCK_TREE:
        result = runClockTree(parameters as ClockTreeParams);
        break;

      case AlgorithmCategory.PARTITIONING:
        result = runPartitioning(parameters as PartitioningParams);
        break;

      case AlgorithmCategory.DRC_LVS:
        if (algorithm === 'rule_deck') {
          // parameters: { deck: RuleDeck, geometries: Geometry[] }
          const p = parameters as any;
          const report = runDrc(p.deck, p.geometries ?? []);
          result = {
            success: report.violations.length === 0,
            violations: report.violations,
            geometryCount: report.geometryCount,
            runtime: report.runtimeMs,
          } as any;
        } else {
          result = runVerification(parameters as DRCLVSParams);
        }
        break;

      case AlgorithmCategory.REINFORCEMENT_LEARNING:
        result = runRL(parameters as RLParams);
        break;

      // Categories that still dispatch to a related existing implementation.
      case AlgorithmCategory.LEGALIZATION:
        // Use placement as approximation
        console.log('Legalization: Using placement approximation');
        result = runPlacement(parameters as PlacementParams);
        break;

      case AlgorithmCategory.BUFFER_INSERTION:
      case AlgorithmCategory.CONGESTION_ESTIMATION:
        // Interconnect-related; until we have a dedicated buffer-insertion
        // / congestion-estimation module these still route.
        console.log(`${category}: Using routing approximation`);
        result = runRouting(parameters as RoutingParams);
        break;

      // Real implementations — no more DRC/routing fallback.
      case AlgorithmCategory.SIGNAL_INTEGRITY:
        result = runSignalIntegrity(parameters as DRCLVSParams);
        break;

      case AlgorithmCategory.IR_DROP:
        result = runIRDrop(parameters as DRCLVSParams);
        break;

      case AlgorithmCategory.LITHOGRAPHY:
        result = runLithography(parameters as DRCLVSParams);
        break;

      case AlgorithmCategory.CMP:
        result = runCMP(parameters as DRCLVSParams);
        break;

      case AlgorithmCategory.MULTI_OBJECTIVE: {
        // parameters: { candidates: [{id, objectives, meta?}], weights?, reference? }
        const p = parameters as any;
        const cands = p.candidates ?? [];
        const front = paretoFrontier(cands);
        const best = p.weights ? bestByWeights(cands, p.weights) : undefined;
        const hv = p.reference ? hypervolume(front.frontier, p.reference) : undefined;
        const viz = toVizPoints(cands, front);
        result = {
          success: true,
          frontier: front.frontier,
          dominated: front.dominated,
          dominanceCount: front.dominanceCount,
          best,
          hypervolume: hv,
          vizPoints: viz,
          runtime: 0,
        } as any;
        break;
      }

      case AlgorithmCategory.ECO: {
        // parameters: { snapshot, operations, atomic? }
        const p = parameters as any;
        const eco = applyEcoOperations(p.snapshot, p.operations ?? [], { atomic: !!p.atomic });
        result = {
          success: eco.ok,
          before: eco.before,
          after: eco.after,
          ops: eco.ops,
          diff: eco.diff,
          runtime: 0,
        } as any;
        break;
      }

      case AlgorithmCategory.DFT:
        result = runDft(parameters as any) as any;
        break;

      case AlgorithmCategory.THERMAL:
        result = runThermal(parameters as any) as any;
        break;

      default:
        return NextResponse.json(
          { error: 'Unsupported algorithm category' },
          { status: 400 }
        );
    }

    const runtimeMs = Math.round(performance.now() - t0);

    // Persist run history (best-effort — never fail the request).
    try {
      // Strip large arrays so the row stays small; keep top-level summary keys.
      const summary: Record<string, any> = {};
      if (result && typeof result === 'object') {
        for (const [k, v] of Object.entries(result as any)) {
          if (Array.isArray(v)) summary[`${k}Count`] = v.length;
          else if (v !== null && typeof v === 'object') summary[k] = '[object]';
          else summary[k] = v;
        }
      }
      algorithmRuns.create({
        id: randomUUID(),
        category,
        algorithm,
        parameters: parameters && typeof parameters === 'object'
          ? Object.fromEntries(Object.entries(parameters as any).filter(([, v]) => !Array.isArray(v)))
          : {},
        result: summary,
        runtimeMs,
        success: true,
      });
    } catch (e) {
      console.warn('Failed to persist algorithm run:', e);
    }

    return NextResponse.json(
      {
        success: true,
        category,
        algorithm,
        result,
        metadata: {
          timestamp,
          version: '1.0.0',
          runtime: 'runtime' in result ? result.runtime :
                   ('trainingTime' in result ? result.trainingTime : 0),
        },
      },
      {
        headers: {
          'X-RateLimit-Limit': ALGORITHM_RATE.maxRequests.toString(),
          'X-RateLimit-Remaining': rl.remaining.toString(),
          'X-RateLimit-Reset': Math.ceil(rl.resetAt / 1000).toString(),
        },
      },
    );
  } catch (error) {
    console.error('Algorithm execution error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          message: 'Request validation failed',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Algorithm execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Full catalog of everything the /api/algorithms POST handler can dispatch.
  // Note: not every entry below is a polished implementation — some dispatch
  // to approximations or share a backend. See the audit notes in the repo.
  return NextResponse.json({
    categories: {
      placement: [
        'simulated_annealing',
        'genetic',
        'force_directed',
        'quadratic',
        'analytical',
        'deepplace',
        'gnn_placement',
        'rl_placement',
        'transformer_placement',
        'eplace',
        'ntuplace',
        'multilevel',
        'capo',
        'gordian',
        'min_cut',
        'fastplace',
        'replace',
        'dreamplace',
        'tetris',
        'abacus',
      ],
      routing: [
        'maze_routing',
        'global_routing',
        'a_star',
        'flute',
        'steiner_tree',
        'pathfinder',
        'left_edge',
        'channel_routing',
        'detailed_routing',
        'van_ginneken',
        'buffer_tree',
        'timing_driven',
        'rudy',
        'probabilistic',
        'grid_based',
        'tritonroute',
        'boxrouter',
        'nctugr',
        'gnn_routing',
      ],
      floorplanning: [
        'slicing_tree',
        'sequence_pair',
        'b_star_tree',
        'o_tree',
        'corner_block_list',
        'tcg',
        'fixed_outline',
      ],
      synthesis: [
        'logic_optimization',
        'technology_mapping',
      ],
      timing_analysis: [
        'static_timing_analysis',
        'critical_path',
      ],
      power_optimization: [
        'clock_gating',
        'voltage_scaling',
        'power_gating',
        'multi_vdd',
        'leakage_reduction',
        'power_grid_analysis',
        'voltage_drop',
        'decap_placement',
      ],
      clock_tree: [
        'h_tree',
        'x_tree',
        'mesh_clock',
        'mmm_algorithm',
      ],
      partitioning: [
        'kernighan_lin',
        'fiduccia_mattheyses',
        'multilevel',
      ],
      drc_lvs: [
        'design_rule_check',
        'layout_vs_schematic',
        'electrical_rule_check',
      ],
      reinforcement_learning: [
        'dqn_floorplanning',
        'ppo_floorplanning',
        'q_learning_placement',
        'policy_gradient_placement',
        'actor_critic_routing',
      ],
      // Newly exposed categories — all backed by real implementations in
      // manufacturing.ts / thermal.ts / dft.ts / pareto.ts / eco_flow.ts.
      signal_integrity: [
        'crosstalk_analysis',
        'coupling_capacitance',
        'noise_analysis',
      ],
      ir_drop: [
        'ir_drop',
      ],
      lithography: [
        'opc',
        'phase_shift_masking',
        'sraf',
      ],
      cmp: [
        'dummy_fill',
        'density_balancing',
        'cmp_aware_routing',
      ],
      thermal: [
        'hotspot_detection',
        'thermal_rc',
      ],
      dft: [
        'scan_chain_insertion',
        'atpg_basic',
      ],
      multi_objective: [
        'pareto_frontier',
        'weighted_best',
      ],
      eco: [
        'cell_move',
        'buffer_insert',
        'gate_resize',
        'cell_swap',
        'pin_swap',
      ],
      // Approximation-only categories (dispatch to placement/routing).
      legalization: [
        'tetris',
        'abacus',
      ],
      buffer_insertion: [
        'van_ginneken',
        'buffer_tree',
      ],
      congestion_estimation: [
        'rudy',
        'probabilistic',
      ],
    },
  });
}
