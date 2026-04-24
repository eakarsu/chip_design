#!/usr/bin/env node
/**
 * chip-design CLI.
 *
 * Standalone entry point for invoking the EDA algorithm modules from the
 * terminal — no Next.js boot required. Useful for benchmarking, scripted
 * sweeps, and CI smoke tests.
 *
 * Usage:
 *   chip-design <category> <algorithm> --params '<json>'
 *   chip-design <category> <algorithm> --params-file params.json
 *   chip-design list                                          # list categories
 *   chip-design list <category>                               # list algorithms
 *
 * Examples:
 *   chip-design placement simulated_annealing --params '{
 *     "algorithm":"simulated_annealing","chipWidth":500,"chipHeight":500,
 *     "cells":[{"id":"c0","name":"c0","width":20,"height":20,"pins":[],"type":"standard"}],
 *     "nets":[],"iterations":50
 *   }'
 *   chip-design list placement
 */

import { readFileSync } from 'fs';
import { runPlacement } from '../src/lib/algorithms/placement';
import { runRouting } from '../src/lib/algorithms/routing';
import { runFloorplanning } from '../src/lib/algorithms/floorplanning';
import { runSynthesis } from '../src/lib/algorithms/synthesis';
import { runTiming } from '../src/lib/algorithms/timing';
import { runPower } from '../src/lib/algorithms/power';
import { runClockTree } from '../src/lib/algorithms/clocktree';
import { runPartitioning } from '../src/lib/algorithms/partitioning';
import { runVerification } from '../src/lib/algorithms/verification';
import { runDft } from '../src/lib/algorithms/dft';
import { runThermal } from '../src/lib/algorithms/thermal';
import { runDrc } from '../src/lib/algorithms/drc_ruledeck';

type Runner = (params: any) => any;

const dispatch: Record<string, Runner> = {
  placement:      runPlacement,
  routing:        runRouting,
  floorplanning:  runFloorplanning,
  synthesis:      runSynthesis,
  timing:         runTiming,
  power:          runPower,
  clocktree:      runClockTree,
  partitioning:   runPartitioning,
  verification:   runVerification,
  dft:            runDft,
  thermal:        runThermal,
  drc:            (p: any) => runDrc(p.deck, p.geometries ?? []),
};

const algorithmsByCategory: Record<string, string[]> = {
  placement:      ['simulated_annealing', 'genetic', 'force_directed', 'analytical', 'gordian',
                   'quadratic', 'min_cut', 'fastplace', 'replace', 'dreamplace'],
  routing:        ['maze_routing', 'global_routing', 'a_star', 'flute', 'pathfinder'],
  floorplanning:  ['slicing_tree', 'sequence_pair', 'b_star_tree'],
  synthesis:      ['logic_optimization', 'technology_mapping'],
  timing:         ['static_timing_analysis', 'critical_path', 'mmmc_sta'],
  power:          ['clock_gating', 'voltage_scaling', 'power_gating'],
  clocktree:      ['h_tree', 'x_tree', 'mesh_clock', 'mmm_algorithm'],
  partitioning:   ['kernighan_lin', 'fiduccia_mattheyses', 'multilevel'],
  verification:   ['design_rule_check', 'layout_vs_schematic', 'electrical_rule_check'],
  dft:            ['scan_chain_insertion'],
  thermal:        ['thermal_rc'],
  drc:            ['rule_deck'],
};

function usage(): never {
  process.stderr.write(`Usage:
  chip-design <category> <algorithm> --params '<json>'
  chip-design <category> <algorithm> --params-file <path>
  chip-design list [category]

Categories: ${Object.keys(dispatch).join(', ')}
`);
  process.exit(2);
}

function parseFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return argv[i + 1];
}

function main(argv: string[]) {
  const [cmd, ...rest] = argv;
  if (!cmd) usage();

  if (cmd === 'list') {
    const cat = rest[0];
    if (!cat) {
      for (const c of Object.keys(dispatch)) process.stdout.write(`${c}\n`);
      return;
    }
    const list = algorithmsByCategory[cat];
    if (!list) {
      process.stderr.write(`Unknown category: ${cat}\n`);
      process.exit(2);
    }
    for (const a of list) process.stdout.write(`${a}\n`);
    return;
  }

  const category = cmd;
  const algorithm = rest[0];
  if (!algorithm) usage();

  const runner = dispatch[category];
  if (!runner) {
    process.stderr.write(`Unknown category: ${category}\n`);
    process.exit(2);
  }

  const inlineJson = parseFlag(rest, 'params');
  const file = parseFlag(rest, 'params-file');
  let params: any;
  if (inlineJson) {
    params = JSON.parse(inlineJson);
  } else if (file) {
    params = JSON.parse(readFileSync(file, 'utf8'));
  } else {
    process.stderr.write('Missing --params or --params-file\n');
    process.exit(2);
  }
  // Make sure the algorithm name is propagated to the runner.
  if (params && typeof params === 'object' && !params.algorithm) {
    params.algorithm = algorithm;
  }

  const t0 = Date.now();
  const result = runner(params);
  const runtimeMs = Date.now() - t0;
  process.stdout.write(JSON.stringify({
    success: true,
    category,
    algorithm,
    runtimeMs,
    result,
  }, null, 2));
  process.stdout.write('\n');
}

try {
  main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
