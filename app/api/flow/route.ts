/**
 * RTL → GDS flow API.
 *
 * Chains the existing single-stage algorithms into one end-to-end pipeline:
 *
 *   Verilog → Synthesis → Floorplanning → Quadratic Placement →
 *   Tetris Legalization → Clock Tree → FLUTE Routing → MMMC STA →
 *   DRC Rule Deck → Scan-Chain Insertion → Thermal RC Solve
 *
 * Each stage's output (where applicable) feeds the next; per-stage
 * status, runtime, and key metrics are returned so the UI can render a
 * stage-by-stage report.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runSynthesis } from '@/lib/algorithms/synthesis';
import { runFloorplanning } from '@/lib/algorithms/floorplanning';
import { quadraticPlacement } from '@/lib/algorithms/placement_analytical';
import { tetrisLegalization } from '@/lib/algorithms/legalization';
import { runClockTree } from '@/lib/algorithms/clocktree';
import { runRouting } from '@/lib/algorithms/routing';
import { runMMMC, defaultCorners } from '@/lib/algorithms/mmmc_sta';
import { runDft } from '@/lib/algorithms/dft';
import { runThermal } from '@/lib/algorithms/thermal';
import type { Cell, Net } from '@/types/algorithms';

interface FlowRequest {
  /** Verilog source (only the synthesis stage actually parses it). */
  netlist?: string;
  /** Synthetic problem size when no real netlist is provided. */
  cellCount?: number;
  netCount?: number;
  chipWidth?: number;
  chipHeight?: number;
}

interface StageReport {
  stage: string;
  ok: boolean;
  runtimeMs: number;
  /** Stage-specific summary numbers — wirelength, slack, hotspot count, etc. */
  metrics: Record<string, number | string | boolean>;
  /** Optional human note (warning, fallback used). */
  note?: string;
}

function makeCells(n: number): Cell[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: i % 7 === 0 ? `DFF_${i}` : `cell_${i}`,
    width: 20 + (i % 5) * 4,
    height: 20 + (i % 3) * 4,
    pins: [
      { id: `c${i}_in`, name: 'A', position: { x: 0, y: 10 }, direction: 'input' },
      { id: `c${i}_out`, name: 'Y', position: { x: 20, y: 10 }, direction: 'output' },
    ],
    type: 'standard',
  }));
}

function makeNets(cellCount: number, netCount: number): Net[] {
  return Array.from({ length: netCount }, (_, i) => ({
    id: `n${i}`,
    name: `n${i}`,
    pins: [
      `c${i % cellCount}_out`,
      `c${(i + 1) % cellCount}_in`,
    ],
    weight: 1,
  }));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FlowRequest;
    const cellCount = body.cellCount ?? 30;
    const netCount = body.netCount ?? 40;
    const chipWidth = body.chipWidth ?? 1000;
    const chipHeight = body.chipHeight ?? 1000;

    const stages: StageReport[] = [];
    let cells = makeCells(cellCount);
    const nets = makeNets(cellCount, netCount);

    /* 1. Synthesis */
    {
      const t = performance.now();
      const r = runSynthesis({
        algorithm: 'logic_optimization',
        netlist: body.netlist ?? `module top();
  wire a, b, c, d;
  and(c, a, b); or(d, a, c);
endmodule`,
        targetLibrary: 'stdcell_lib',
        optimizationLevel: 'area' as const,
        clockPeriod: 10,
      } as any);
      stages.push({
        stage: 'synthesis',
        ok: !!(r as any).success,
        runtimeMs: performance.now() - t,
        metrics: {
          gateCount: (r as any).gateCount ?? cellCount,
          area: (r as any).area ?? 0,
        },
      });
    }

    /* 2. Floorplanning */
    {
      const t = performance.now();
      const r = runFloorplanning({
        algorithm: 'slicing_tree',
        chipWidth,
        chipHeight,
        blocks: cells,
        aspectRatioMin: 0.5,
        aspectRatioMax: 2.0,
        utilizationTarget: 0.8,
      } as any);
      // Floorplanning seeds initial cell positions on most algorithms.
      if ((r as any).blocks) cells = (r as any).blocks;
      stages.push({
        stage: 'floorplanning',
        ok: !!(r as any).success,
        runtimeMs: performance.now() - t,
        metrics: {
          area: (r as any).area ?? 0,
          aspectRatio: (r as any).aspectRatio ?? 0,
        },
      });
    }

    /* 3. Quadratic placement */
    {
      const t = performance.now();
      const r = quadraticPlacement({
        algorithm: 'analytical' as any,
        chipWidth, chipHeight, cells, nets,
        iterations: 0,
      } as any);
      cells = r.cells;
      stages.push({
        stage: 'placement_analytical',
        ok: r.success,
        runtimeMs: performance.now() - t,
        metrics: { wirelength: r.totalWirelength },
      });
    }

    /* 4. Legalization */
    {
      const t = performance.now();
      const r = tetrisLegalization({
        algorithm: 'tetris' as any,
        chipWidth, chipHeight, cells, nets,
        iterations: 0,
      } as any);
      cells = r.cells;
      stages.push({
        stage: 'legalization_tetris',
        ok: r.success,
        runtimeMs: performance.now() - t,
        metrics: { wirelength: r.totalWirelength, overlap: r.overlap ?? 0 },
      });
    }

    /* 5. Clock tree */
    {
      const t = performance.now();
      const sinks = cells
        .filter(c => c.name.includes('DFF'))
        .map(c => ({
          x: (c.position?.x ?? 0) + c.width / 2,
          y: (c.position?.y ?? 0) + c.height / 2,
        }));
      const r = runClockTree({
        algorithm: 'h_tree',
        clockSource: { x: chipWidth / 2, y: chipHeight / 2 },
        sinks: sinks.length > 0 ? sinks : [{ x: chipWidth / 4, y: chipHeight / 4 }],
        chipWidth, chipHeight,
        meshDensity: 4,
        maxSkew: 0.1,
      } as any);
      stages.push({
        stage: 'clock_tree',
        ok: !!(r as any).success,
        runtimeMs: performance.now() - t,
        metrics: {
          sinkCount: sinks.length,
          maxSkew: (r as any).maxSkew ?? 0,
          wirelength: (r as any).wirelength ?? 0,
        },
      });
    }

    /* 6. Routing (FLUTE Steiner trees) */
    {
      const t = performance.now();
      const r = runRouting({
        algorithm: 'flute' as any,
        chipWidth, chipHeight, cells, nets,
        layers: 3, gridSize: 20, viaWeight: 2, bendWeight: 1.5,
      } as any);
      stages.push({
        stage: 'routing_flute',
        ok: !!(r as any).success,
        runtimeMs: performance.now() - t,
        metrics: {
          wirelength: (r as any).totalWirelength ?? 0,
          unrouted: ((r as any).unroutedNets ?? []).length,
        },
      });
    }

    /* 7. MMMC STA */
    {
      const t = performance.now();
      const corners = defaultCorners();
      const paths = [
        {
          id: 'p1', required: 10000, launchDelay: 100, captureDelay: 100,
          arcs: [{ id: 'a1', delay: 4000, type: 'cell' as const, fromPin: 'q', toPin: 'd' }],
        },
        {
          id: 'p2', required: 10000, launchDelay: 100, captureDelay: 100,
          arcs: [{ id: 'a2', delay: 5500, type: 'cell' as const, fromPin: 'q', toPin: 'd' }],
        },
      ];
      const r = runMMMC(corners, paths as any, {});
      stages.push({
        stage: 'mmmc_sta',
        ok: true,
        runtimeMs: performance.now() - t,
        metrics: {
          corners: corners.length,
          worstSlack: (r as any).worstSlack ?? 0,
        },
      });
    }

    /* 8. DRC rule deck */
    {
      // NOTE: We intentionally only run width/area rules here. Spacing on
      // cell bboxes is a modeling artifact — abutted standard cells aren't
      // spacing violations, they're how std-cell rows are supposed to look.
      // A real spacing check belongs on router output (stage 6), which
      // currently returns aggregate wirelength rather than per-segment
      // geometry. Once the FLUTE router exposes per-segment rects, add a
      // second geom set with { layer: 'M1' | 'M2' ... } and re-enable
      // min_spacing against that.
      const t = performance.now();
      const geoms = cells.map(c => ({
        id: c.id,
        layer: 'M1',
        rect: {
          xl: c.position?.x ?? 0,
          yl: c.position?.y ?? 0,
          xh: (c.position?.x ?? 0) + c.width,
          yh: (c.position?.y ?? 0) + c.height,
        },
      }));
      const { runDrc } = await import('@/lib/algorithms/drc_ruledeck');
      const r = runDrc({
        name: 'demo', technology: 'demo7nm', rules: [
          { kind: 'min_width', layer: 'M1', min: 5 },
          { kind: 'min_area', layer: 'M1', min: 100 },
        ],
      }, geoms);
      stages.push({
        stage: 'drc_rule_deck',
        ok: r.violations.length === 0,
        runtimeMs: r.runtimeMs,
        metrics: {
          violations: r.violations.length,
          geometries: r.geometryCount,
        },
        note: r.violations.length > 0
          ? `${r.violations.length} DRC errors`
          : 'width/area rules only — routed-geometry spacing check pending',
      });
    }

    /* 9. DFT scan chain */
    {
      const t = performance.now();
      const r = runDft({ algorithm: 'scan_chain_insertion', cells } as any) as any;
      stages.push({
        stage: 'dft_scan_chain',
        ok: r.success,
        runtimeMs: performance.now() - t,
        metrics: {
          chains: r.chains?.length ?? 0,
          ffCount: r.ffCount,
          chainWirelength: r.chainWirelength,
        },
      });
    }

    /* 10. Thermal RC solve */
    {
      const t = performance.now();
      const r = runThermal({
        algorithm: 'thermal_rc',
        cells, chipWidth, chipHeight,
        tilePitch: 100,
        defaultPowerDensity: 0.005,
      } as any);
      stages.push({
        stage: 'thermal_rc',
        ok: r.success,
        runtimeMs: performance.now() - t,
        metrics: { peakTempRise: r.peak.toFixed(2), tiles: r.cols * r.rows },
      });
    }

    const totalRuntimeMs = stages.reduce((s, x) => s + x.runtimeMs, 0);
    const allOk = stages.every(s => s.ok);
    return NextResponse.json({
      success: allOk,
      stages,
      totalRuntimeMs,
      summary: {
        cellCount,
        netCount,
        chipWidth,
        chipHeight,
        stagesRun: stages.length,
      },
    });
  } catch (error) {
    console.error('Flow execution error:', error);
    return NextResponse.json(
      {
        error: 'Flow execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
