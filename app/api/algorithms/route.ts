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
import { runRL } from '@/lib/algorithms/reinforcement';
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

export async function POST(request: NextRequest) {
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
        result = runTiming(parameters as TimingParams);
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
        result = runVerification(parameters as DRCLVSParams);
        break;

      case AlgorithmCategory.REINFORCEMENT_LEARNING:
        result = runRL(parameters as RLParams);
        break;

      default:
        return NextResponse.json(
          { error: 'Unsupported algorithm category' },
          { status: 400 }
        );
    }

    return NextResponse.json({
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
    });
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
  // Return only fully implemented algorithms
  return NextResponse.json({
    categories: {
      placement: [
        'simulated_annealing',
        'genetic',
        'force_directed',
      ],
      routing: [
        'maze_routing',
        'global_routing',
        'a_star',
      ],
      floorplanning: [
        'slicing_tree',
        'sequence_pair',
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
    },
  });
}
