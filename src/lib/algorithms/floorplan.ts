/**
 * Floorplan model + helpers.
 *
 * A floorplan is a die rectangle, a core area inside it, optional rows/sites,
 * and a list of placeable macros. We keep the geometry in microns at this
 * layer — the DEF emitter handles DBU conversion.
 *
 * The editor uses these helpers to:
 *   - validate that every macro lies inside the core and respects its halo;
 *   - emit a minimal DEF the rest of the flow can ingest;
 *   - persist/restore as JSON.
 */

import type {
  DefDesign, DefDieArea, DefComponent, DefRow,
} from '@/lib/parsers/def';

export interface FpRect { xl: number; yl: number; xh: number; yh: number; }

export interface FpMacro {
  /** Instance name in the netlist — also DEF component name. */
  name: string;
  /** Cell/master name from the LEF library. */
  master: string;
  /** Lower-left corner in microns. */
  x: number;
  y: number;
  /** Width / height of the macro footprint in microns. */
  width: number;
  height: number;
  /** Halo expressed as a uniform margin (microns). 0 = no halo. */
  halo: number;
  /** Orientation as a DEF string. */
  orient: 'N' | 'S' | 'E' | 'W' | 'FN' | 'FS' | 'FE' | 'FW';
  /** Whether the macro is FIXED. PLACED is the default for soft macros. */
  fixed: boolean;
}

export interface Floorplan {
  designName: string;
  /** dbuPerMicron — only used when emitting DEF. */
  dbu: number;
  die: FpRect;
  core: FpRect;
  /** Optional standard-cell rows. Filled by `generateRows()`. */
  rows: { name: string; site: string; x: number; y: number; orient: string;
          numX: number; numY: number; stepX: number; stepY: number }[];
  macros: FpMacro[];
}

// --------------------------------------------------------------------------
// Validation
// --------------------------------------------------------------------------

export interface FpIssue {
  severity: 'error' | 'warning';
  message: string;
  /** Names of the macros involved (if any). */
  macros?: string[];
}

export function validateFloorplan(fp: Floorplan): FpIssue[] {
  const issues: FpIssue[] = [];

  if (fp.core.xl < fp.die.xl || fp.core.yl < fp.die.yl ||
      fp.core.xh > fp.die.xh || fp.core.yh > fp.die.yh) {
    issues.push({ severity: 'error', message: 'core area extends outside the die' });
  }
  if (fp.core.xh - fp.core.xl <= 0 || fp.core.yh - fp.core.yl <= 0) {
    issues.push({ severity: 'error', message: 'core area has non-positive size' });
  }

  for (const m of fp.macros) {
    const r = macroRect(m);
    if (r.xl < fp.core.xl || r.yl < fp.core.yl ||
        r.xh > fp.core.xh || r.yh > fp.core.yh) {
      issues.push({
        severity: 'error',
        message: `macro "${m.name}" extends outside the core area`,
        macros: [m.name],
      });
    }
  }

  // Halo overlap check — pairwise.
  for (let i = 0; i < fp.macros.length; i++) {
    const a = fp.macros[i];
    const ah = expand(macroRect(a), a.halo);
    for (let j = i + 1; j < fp.macros.length; j++) {
      const b = fp.macros[j];
      const bh = expand(macroRect(b), b.halo);
      if (rectsOverlap(ah, bh)) {
        const sev: 'error' | 'warning' =
          rectsOverlap(macroRect(a), macroRect(b)) ? 'error' : 'warning';
        issues.push({
          severity: sev,
          message: sev === 'error'
            ? `macros "${a.name}" and "${b.name}" overlap`
            : `halo of "${a.name}" and "${b.name}" overlap`,
          macros: [a.name, b.name],
        });
      }
    }
  }

  return issues;
}

export function macroRect(m: FpMacro): FpRect {
  return { xl: m.x, yl: m.y, xh: m.x + m.width, yh: m.y + m.height };
}

function expand(r: FpRect, m: number): FpRect {
  return { xl: r.xl - m, yl: r.yl - m, xh: r.xh + m, yh: r.yh + m };
}

function rectsOverlap(a: FpRect, b: FpRect): boolean {
  return !(a.xh <= b.xl || b.xh <= a.xl || a.yh <= b.yl || b.yh <= a.yl);
}

// --------------------------------------------------------------------------
// Row generation
// --------------------------------------------------------------------------

export interface RowOptions {
  site: string;
  /** Site width in microns (X step). */
  siteWidth: number;
  /** Row height in microns (Y step). */
  rowHeight: number;
  /** Site name prefix. */
  prefix?: string;
}

export function generateRows(fp: Floorplan, opts: RowOptions): Floorplan['rows'] {
  const rows: Floorplan['rows'] = [];
  const { site, siteWidth, rowHeight, prefix = 'ROW' } = opts;
  const cw = fp.core.xh - fp.core.xl;
  const numX = Math.max(0, Math.floor(cw / siteWidth));
  let i = 0;
  for (let y = fp.core.yl; y + rowHeight <= fp.core.yh + 1e-9; y += rowHeight, i++) {
    rows.push({
      name: `${prefix}_${i}`,
      site,
      x: fp.core.xl,
      y,
      orient: i % 2 === 0 ? 'N' : 'FS',
      numX, numY: 1,
      stepX: siteWidth, stepY: 0,
    });
  }
  return rows;
}

// --------------------------------------------------------------------------
// DEF emission
// --------------------------------------------------------------------------

/**
 * Build a minimal DefDesign from a Floorplan. The emitter does not invent
 * pins or nets — those come from the synth/place flow. This is enough DEF
 * to seed the placer with macro locations.
 */
export function floorplanToDef(fp: Floorplan): DefDesign {
  const dbu = fp.dbu;
  const die: DefDieArea = {
    points: [
      { x: round(fp.die.xl * dbu), y: round(fp.die.yl * dbu) },
      { x: round(fp.die.xh * dbu), y: round(fp.die.yh * dbu) },
    ],
  };

  const components: DefComponent[] = fp.macros.map(m => ({
    name: m.name,
    macro: m.master,
    placement: m.fixed ? 'FIXED' : 'PLACED',
    x: round(m.x * dbu),
    y: round(m.y * dbu),
    orient: m.orient,
  }));

  const rows: DefRow[] = fp.rows.map(r => ({
    name: r.name,
    site: r.site,
    x: round(r.x * dbu),
    y: round(r.y * dbu),
    orient: r.orient,
    numX: r.numX,
    numY: r.numY,
    stepX: round(r.stepX * dbu),
    stepY: round(r.stepY * dbu),
  }));

  return {
    version: '5.8',
    designName: fp.designName,
    units: { dbuPerMicron: dbu },
    dieArea: die,
    rows,
    tracks: [],
    components,
    pins: [],
    nets: [],
    specialNets: [],
    warnings: [],
  };
}

function round(n: number): number { return Math.round(n); }

// --------------------------------------------------------------------------
// Defaults
// --------------------------------------------------------------------------

export function blankFloorplan(): Floorplan {
  return {
    designName: 'TOP',
    dbu: 1000,
    die:  { xl: 0, yl: 0, xh: 1000, yh: 1000 },
    core: { xl: 50, yl: 50, xh: 950, yh: 950 },
    rows: [],
    macros: [],
  };
}

export function exampleFloorplan(): Floorplan {
  const fp = blankFloorplan();
  fp.designName = 'demo_chip';
  fp.macros = [
    { name: 'cpu',     master: 'CORE_BIG',  x: 100, y: 100, width: 300, height: 300, halo: 10, orient: 'N', fixed: true  },
    { name: 'sram_a',  master: 'SRAM_64K',  x: 500, y: 100, width: 200, height: 200, halo:  5, orient: 'N', fixed: false },
    { name: 'sram_b',  master: 'SRAM_64K',  x: 500, y: 350, width: 200, height: 200, halo:  5, orient: 'FS',fixed: false },
    { name: 'dsp',     master: 'DSP_CORE',  x: 100, y: 500, width: 250, height: 200, halo: 10, orient: 'N', fixed: false },
  ];
  return fp;
}
