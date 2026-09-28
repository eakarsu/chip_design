/**
 * Demo data for the Analog Power Design Studio and the ML predictor.
 *
 * Seeds at least 15 rows per persistent table:
 *   analog_projects, analog_runs, ml_samples, ml_models
 *
 * Analog projects are computed with the real design/tuning/simulation code
 * (ngspice when available); ML samples are clearly labelled synthetic demo
 * rows and the model is trained from them. Everything is idempotent and
 * refuses to run in production. Fictional demo content only — no real
 * hardware was designed or measured.
 *
 * Usage: npm run demo-data:load [-- --verify]
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), false);

import { getRawDb, ensureTables } from '../src/lib/db/connection';
import { ensureAnalogSchema } from '../src/lib/analog/store';
import { ensureMlSchema, saveModel, saveSamples } from '../src/lib/ml/store';
import { reviewRequirements } from '../src/lib/analog/requirements';
import { designBuck, selectBuckIcs } from '../src/lib/analog/design';
import { runAcSimulation, runTransientSimulation, simulatorAvailability, tuneCompensator, withCompensation } from '../src/lib/analog/simulation';
import { defaultPcbChecklist } from '../src/lib/analog/pcb';
import { extractFeatures, trainRidge } from '../src/lib/ml/surrogate';

const DEMO_NOTE = 'DEMO — fictional evaluation data. No real hardware was designed, ordered, simulated on a bench or reviewed by a human.';

interface Spec {
  name: string;
  vinNominal: number;
  vinMin: number;
  vinMax: number;
  vout: number;
  ioutMax: number;
  ioutMin: number;
  rippleMv: number;
  transientDeviationMv: number;
  efficiencyTargetPct: number;
  ambientC: number;
}

const SPECS: Spec[] = [
  { name: 'Demo 12 V → 5 V / 1 A buck', vinNominal: 12, vinMin: 8, vinMax: 16, vout: 5, ioutMax: 1, ioutMin: 0.1, rippleMv: 30, transientDeviationMv: 150, efficiencyTargetPct: 85, ambientC: 40 },
  { name: 'Demo 24 V → 12 V / 2 A buck', vinNominal: 24, vinMin: 18, vinMax: 30, vout: 12, ioutMax: 2, ioutMin: 0.2, rippleMv: 60, transientDeviationMv: 250, efficiencyTargetPct: 90, ambientC: 45 },
  { name: 'Demo 9 V → 3.3 V / 1.5 A buck', vinNominal: 9, vinMin: 7, vinMax: 12, vout: 3.3, ioutMax: 1.5, ioutMin: 0.15, rippleMv: 33, transientDeviationMv: 165, efficiencyTargetPct: 88, ambientC: 40 },
  { name: 'Demo 48 V → 24 V / 1 A buck', vinNominal: 48, vinMin: 36, vinMax: 60, vout: 24, ioutMax: 1, ioutMin: 0.1, rippleMv: 120, transientDeviationMv: 480, efficiencyTargetPct: 92, ambientC: 50 },
  { name: 'Demo 5 V → 1.8 V / 1 A buck', vinNominal: 5, vinMin: 4.5, vinMax: 5.5, vout: 1.8, ioutMax: 1, ioutMin: 0.1, rippleMv: 18, transientDeviationMv: 90, efficiencyTargetPct: 85, ambientC: 40 },
  { name: 'Demo 12 V → 3.3 V / 2 A buck', vinNominal: 12, vinMin: 9, vinMax: 18, vout: 3.3, ioutMax: 2, ioutMin: 0.2, rippleMv: 33, transientDeviationMv: 165, efficiencyTargetPct: 88, ambientC: 45 },
  { name: 'Demo 20 V → 5 V / 2.5 A buck', vinNominal: 20, vinMin: 15, vinMax: 28, vout: 5, ioutMax: 2.5, ioutMin: 0.25, rippleMv: 50, transientDeviationMv: 250, efficiencyTargetPct: 90, ambientC: 45 },
  { name: 'Demo 36 V → 12 V / 1.5 A buck', vinNominal: 36, vinMin: 24, vinMax: 42, vout: 12, ioutMax: 1.5, ioutMin: 0.15, rippleMv: 60, transientDeviationMv: 300, efficiencyTargetPct: 91, ambientC: 50 },
  { name: 'Demo 15 V → 1.2 V / 1 A buck', vinNominal: 15, vinMin: 10, vinMax: 18, vout: 1.2, ioutMax: 1, ioutMin: 0.1, rippleMv: 12, transientDeviationMv: 60, efficiencyTargetPct: 82, ambientC: 40 },
  { name: 'Demo 28 V → 7 V / 2 A buck', vinNominal: 28, vinMin: 20, vinMax: 36, vout: 7, ioutMax: 2, ioutMin: 0.2, rippleMv: 35, transientDeviationMv: 175, efficiencyTargetPct: 90, ambientC: 45 },
  { name: 'Demo 18 V → 9 V / 1.5 A buck', vinNominal: 18, vinMin: 12, vinMax: 24, vout: 9, ioutMax: 1.5, ioutMin: 0.15, rippleMv: 45, transientDeviationMv: 225, efficiencyTargetPct: 90, ambientC: 45 },
  { name: 'Demo 60 V → 36 V / 0.5 A buck', vinNominal: 60, vinMin: 50, vinMax: 60, vout: 36, ioutMax: 0.5, ioutMin: 0.05, rippleMv: 180, transientDeviationMv: 720, efficiencyTargetPct: 92, ambientC: 55 },
  { name: 'Demo 10 V → 2.5 V / 1.2 A buck', vinNominal: 10, vinMin: 8, vinMax: 14, vout: 2.5, ioutMax: 1.2, ioutMin: 0.12, rippleMv: 25, transientDeviationMv: 125, efficiencyTargetPct: 87, ambientC: 40 },
  { name: 'Demo 32 V → 15 V / 1.8 A buck', vinNominal: 32, vinMin: 24, vinMax: 40, vout: 15, ioutMax: 1.8, ioutMin: 0.18, rippleMv: 75, transientDeviationMv: 375, efficiencyTargetPct: 91, ambientC: 50 },
  { name: 'Demo 7 V → 3.3 V / 0.8 A buck', vinNominal: 7, vinMin: 5.5, vinMax: 10, vout: 3.3, ioutMax: 0.8, ioutMin: 0.08, rippleMv: 33, transientDeviationMv: 165, efficiencyTargetPct: 85, ambientC: 40 },
];

const ML_CONFIGS = Array.from({ length: 15 }, (_, index) => ({
  CLOCK_PERIOD: 8 + index,
  FP_CORE_UTIL: 35 + (index % 6) * 5,
  PL_TARGET_DENSITY: 0.5 + (index % 5) * 0.05,
  DIE_AREA_X: 800 + index * 120,
  DIE_AREA_Y: 700 + index * 90,
  CELL_COUNT: 4000 + index * 850,
  NET_COUNT: 5200 + index * 1100,
  RT_MAX_LAYER: 4 + (index % 3),
  SYNTH_STRATEGY: index % 2 === 0 ? 'AREA 0' : 'DELAY 0',
  PDK: 'sky130A',
}));

function mlLabel(index: number): number {
  const cells = 4000 + index * 850;
  const util = 35 + (index % 6) * 5;
  const density = 0.5 + (index % 5) * 0.05;
  // Deterministic synthetic target: cell area grows with cells and density.
  return Math.round((cells * 0.42 + util * 130 + density * 26000) * 100) / 100;
}

function seedAnalog(db: ReturnType<typeof getRawDb>): { projects: number; runs: number } {
  db.prepare("DELETE FROM analog_projects WHERE id LIKE 'demo-analog-%'").run();
  db.prepare("DELETE FROM analog_runs WHERE id LIKE 'demo-analog-%'").run();
  const simulator = simulatorAvailability();
  const now = new Date().toISOString();
  let projects = 0;
  let runs = 0;
  const insertProject = db.prepare(
    `INSERT OR REPLACE INTO analog_projects
      (id, tenant_id, name, status, requirements_json, selected_ic_json, design_json, transient_json, ac_json, pcb_json, review_json, created_at, updated_at)
     VALUES (?, 'local', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  );
  const insertRun = db.prepare(
    `INSERT OR REPLACE INTO analog_runs (id, project_id, tenant_id, kind, model, cost_usd, summary_json, created_at)
     VALUES (?, ?, 'local', ?, NULL, NULL, ?, ?)`,
  );

  SPECS.forEach((spec, index) => {
    const id = `demo-analog-${String(index + 1).padStart(3, '0')}`;
    try {
      const review = reviewRequirements(spec);
      const selection = selectBuckIcs(review.requirements);
      const ic = selection.recommended?.entry;
      if (!ic) {
        console.warn(`  skip ${spec.name}: no eligible IC in the curated catalog`);
        return;
      }
      const base = designBuck(review.requirements, ic);
      let design = base;
      let transient = null as ReturnType<typeof runTransientSimulation> | null;
      let ac = null as ReturnType<typeof runAcSimulation> | null;
      let status = 'designed';
      if (simulator.available) {
        const tuning = tuneCompensator(review.requirements, base, { maxIterations: 4 });
        design = withCompensation(base, tuning.compensator);
        transient = runTransientSimulation(review.requirements, design);
        ac = runAcSimulation(review.requirements, design);
        status = 'simulated';
        insertRun.run(`${id}-run-tuning`, id, 'tuning', JSON.stringify({ tuned: tuning.tuned, iterations: tuning.iterations, crossoverHz: tuning.crossoverHz, phaseMarginDeg: tuning.phaseMarginDeg }), now);
        runs += 1;
      }
      const pcb = defaultPcbChecklist(design);
      insertProject.run(
        id,
        spec.name,
        status,
        JSON.stringify({ ...spec, notes: DEMO_NOTE }),
        JSON.stringify(ic),
        JSON.stringify(design),
        transient ? JSON.stringify(transient) : null,
        ac ? JSON.stringify(ac) : null,
        JSON.stringify(pcb),
        now,
        now,
      );
      projects += 1;
      insertRun.run(`${id}-run-design`, id, 'design', JSON.stringify({ fswHz: design.fswHz, inductanceH: design.inductanceH, rippleMv: design.estimatedRippleMv, efficiencyPct: design.losses.efficiencyPct, bomRows: design.billOfMaterials.length, calculationRows: design.calculations.length }), now);
      runs += 1;
      if (transient) {
        insertRun.run(`${id}-run-transient`, id, 'transient', JSON.stringify(transient.measurements), now);
        runs += 1;
      }
      if (ac) {
        insertRun.run(`${id}-run-ac`, id, 'ac', JSON.stringify(ac.measurements), now);
        runs += 1;
      }
      console.log(`  ${id}: ${ic.part} ${spec.vout} V / ${spec.ioutMax} A → ${status}${transient ? ` (vout ${transient.measurements.voutAverageV?.toFixed(3)} V, PM ${ac?.measurements.phaseMarginDeg?.toFixed(1)}°)` : ''}`);
    } catch (error) {
      console.warn(`  skip ${spec.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  return { projects, runs };
}

const ML_TARGETS = [
  'area',
  'power',
  'slack',
  'critical_path',
  'wirelength',
  'runtime_ms',
  'drc_violations',
  'clock_skew',
  'power_density',
  'cell_density',
  'net_length',
  'via_count',
  'utilization',
  'temperature_rise',
  'yield_estimate',
] as const;

const ML_TARGET_FACTORS: Record<(typeof ML_TARGETS)[number], number> = {
  area: 1,
  power: 0.0012,
  slack: 0.0002,
  critical_path: 0.00004,
  wirelength: 0.01,
  runtime_ms: 0.5,
  drc_violations: 0.0001,
  clock_skew: 0.00002,
  power_density: 0.0000008,
  cell_density: 0.000001,
  net_length: 0.002,
  via_count: 0.0005,
  utilization: 0.0002,
  temperature_rise: 0.00002,
  yield_estimate: 0.00001,
};

function seedRunHistory(db: ReturnType<typeof getRawDb>): { designs: number; runs: number } {
  db.prepare("DELETE FROM algorithm_runs WHERE id LIKE 'demo-run-%'").run();
  db.prepare("DELETE FROM openlane_runs WHERE id LIKE 'demo-openlane-run-%'").run();
  db.prepare("DELETE FROM openlane_designs WHERE id LIKE 'demo-openlane-design-%'").run();
  const now = new Date().toISOString();
  const insertDesign = db.prepare(
    `INSERT INTO openlane_designs (id, name, rtl, ports_json, clocks_json, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertOpenlaneRun = db.prepare(
    `INSERT INTO openlane_runs (id, design_id, tag, status, config_json, stages_json, metrics_json, layout_json, total_runtime_ms, started_at, finished_at)
     VALUES (?, ?, ?, 'finished', ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertAlgorithmRun = db.prepare(
    `INSERT INTO algorithm_runs (id, design_id, user_id, category, algorithm, parameters_json, result_json, runtime_ms, success, created_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 1, ?)`,
  );
  const categories = ['placement', 'routing', 'synthesis', 'floorplanning', 'timing'];
  const algorithms: Record<string, string> = {
    placement: 'quadratic-placement',
    routing: 'maze-router',
    synthesis: 'abc-synthesis',
    floorplanning: 'sequence-pair',
    timing: 'structural-sta',
  };
  for (let i = 0; i < 15; i++) {
    const designId = `demo-openlane-design-${String(i + 1).padStart(3, '0')}`;
    const config = ML_CONFIGS[i];
    insertDesign.run(
      designId,
      `Demo design ${i + 1}`,
      `module demo_${i + 1}(input clk, output reg q); always @(posedge clk) q <= ~q; endmodule`,
      JSON.stringify([{ name: 'clk', direction: 'input' }, { name: 'q', direction: 'output' }]),
      JSON.stringify([{ name: 'clk', periodNs: config.CLOCK_PERIOD }]),
      JSON.stringify({ ...config, DEMO: true }),
      now,
      now,
    );
    const runtimeMs = 45_000 + i * 3_500;
    // Metric keys use the real OpenLane metric naming the trainer reads.
    const metrics = {
      'synthesis__area': 12_000 + i * 900,
      'synthesis__power': 18 + i * 1.6,
      'synthesis__critical_path_ns': 2.4 + i * 0.12,
      'sta_pre__clock_period_ns': config.CLOCK_PERIOD,
      'sta_post__wns__corner:tt_025C_1v80': 0.35 - i * 0.02,
      'routing__wirelength': 210_000 + i * 8_500,
      'placement__wirelength_detailed': 195_000 + i * 8_000,
      'floorplan__die_area': 780_000 + i * 22_000,
      'drc_violations': i % 5,
      'DEMO': true,
    };
    const layout = {
      chipWidth: config.DIE_AREA_X,
      chipHeight: config.DIE_AREA_Y,
      cells: Array.from({ length: 24 }, (_, cell) => ({ id: `demo_cell_${cell}`, x: cell * 12, y: (cell % 6) * 10 })),
    };
    insertOpenlaneRun.run(
      `demo-openlane-run-${String(i + 1).padStart(3, '0')}`,
      designId,
      `demo-tag-${i + 1}`,
      JSON.stringify(config),
      JSON.stringify([{ name: 'synthesis', status: 'complete' }, { name: 'floorplan', status: 'complete' }, { name: 'place', status: 'complete' }, { name: 'route', status: 'complete' }]),
      JSON.stringify(metrics),
      JSON.stringify(layout),
      runtimeMs,
      now,
      now,
    );
    const category = categories[i % categories.length];
    insertAlgorithmRun.run(
      `demo-run-${String(i + 1).padStart(3, '0')}`,
      designId,
      category,
      algorithms[category],
      JSON.stringify({ seed: i, DEMO: true }),
      JSON.stringify({
        wirelength: 210_000 + i * 8_500,
        wns: 0.35 - i * 0.02,
        area: 12_000 + i * 900,
        metrics: { hpwl: 200_000 + i * 7_500, overflow: i % 4 },
        assumptions: ['DEMO — synthetic algorithm run for workspace demonstration.'],
      }),
      runtimeMs,
      now,
    );
  }
  return { designs: 15, runs: 15 };
}

function seedMl(): { samples: number; models: number } {  const db = getRawDb();
  db.prepare("DELETE FROM ml_samples WHERE source = 'demo'").run();
  db.prepare("DELETE FROM ml_models WHERE source = 'demo'").run();
  const created = new Date().toISOString();
  let samplesWritten = 0;
  for (const target of ML_TARGETS) {
    const modelId = `demo-${target}-model`;
    const factor = ML_TARGET_FACTORS[target];
    const samples = ML_CONFIGS.map((config, index) => ({
      target,
      features: extractFeatures({ config }),
      label: Math.round(mlLabel(index) * factor * 1e6) / 1e6,
      modelId,
      source: 'demo',
      sourceId: `demo-${target}-config-${String(index + 1).padStart(3, '0')}`,
    }));
    const model = trainRidge(samples.map((sample) => ({ features: sample.features, label: sample.label })), { target, seed: 42 });
    saveModel({
      ...model,
      id: modelId,
      name: `DEMO ${target} model (synthetic samples)`,
      target,
      createdAt: created,
      createdBy: 'demo-data-loader',
      source: 'demo',
    });
    samplesWritten += saveSamples(samples);
  }
  return { samples: samplesWritten, models: ML_TARGETS.length };
}

function counts() {
  const db = getRawDb();
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    analog_projects: one('SELECT COUNT(*) AS n FROM analog_projects'),
    analog_runs: one('SELECT COUNT(*) AS n FROM analog_runs'),
    ml_samples: one('SELECT COUNT(*) AS n FROM ml_samples'),
    ml_models: one('SELECT COUNT(*) AS n FROM ml_models'),
    openlane_runs: one('SELECT COUNT(*) AS n FROM openlane_runs'),
    algorithm_runs: one('SELECT COUNT(*) AS n FROM algorithm_runs'),
  };
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo loading refuses to run in production');
  const db = getRawDb();
  ensureTables(db);
  ensureAnalogSchema(db);
  ensureMlSchema(db);

  if (process.argv.includes('--verify')) {
    const result = counts();
    console.log(JSON.stringify(result, null, 2));
    const under = Object.entries(result).filter(([, value]) => value < 15);
    if (under.length) throw new Error(`Tables below 15 rows: ${under.map(([table, value]) => `${table}=${value}`).join(', ')}`);
    console.log('All persistent demo tables have at least 15 rows.');
    return;
  }

  console.log('Seeding analog demo projects (real design + ngspice simulation)…');
  const analog = seedAnalog(db);
  console.log(`  analog: ${analog.projects} projects, ${analog.runs} runs`);

  console.log('Seeding OpenLane run history and algorithm runs…');
  const history = seedRunHistory(db);
  console.log(`  history: ${history.designs} OpenLane designs, ${history.runs} algorithm runs`);

  console.log('Seeding ML demo samples and model…');
  const ml = seedMl();
  console.log(`  ml: ${ml.samples} samples, ${ml.models} models`);

  const result = counts();
  console.log(JSON.stringify(result, null, 2));
  const under = Object.entries(result).filter(([, value]) => value < 15);
  if (under.length) throw new Error(`Tables below 15 rows: ${under.map(([table, value]) => `${table}=${value}`).join(', ')}`);
  console.log('All persistent demo tables have at least 15 rows.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
