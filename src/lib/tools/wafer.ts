/**
 * Wafer / reticle planner.
 *
 * Two related calculators:
 *
 *   - **dies-per-wafer (DPW)**: how many rectangular dies fit on a circular
 *     wafer with a given edge-exclusion zone, scribe-lane width, and die
 *     size. We enumerate every (col, row) lattice position on the wafer
 *     plane that has all four corners inside the printable circle, and
 *     count the ones that fit.
 *   - **reticle packing**: pack one or more die types into a reticle
 *     window using a greedy shelf algorithm (next-fit decreasing-height).
 *
 * Yield: with a defect density D₀ (defects/cm²) and an effective die area
 * A (cm²), the Murphy yield model gives Y = ((1 - exp(-A·D₀)) / (A·D₀))².
 * We expose this both for the gross-die count and net-good-die count.
 *
 * Inputs are in millimetres unless noted.
 */

export interface WaferSpec {
  /** Wafer diameter (mm). 200, 300, 450 are typical. */
  waferDiameter: number;
  /** Edge-exclusion zone width (mm). */
  edgeExclusion: number;
  /** Die width and height (mm). */
  dieWidth: number;
  dieHeight: number;
  /** Width of the scribe lane (mm) — added to die pitch. */
  scribeWidth: number;
  /** Defect density (defects/cm²) for Murphy yield. */
  defectDensity?: number;
  /** Centre offset (mm) — usually 0. */
  centerOffsetX?: number;
  centerOffsetY?: number;
}

export interface WaferDie {
  col: number;
  row: number;
  /** Lower-left corner relative to wafer centre (mm). */
  x: number;
  y: number;
}

export interface WaferResult {
  dies: WaferDie[];
  grossDies: number;
  /** Murphy yield Y (0..1) per die. Undefined if defectDensity not given. */
  yieldPerDie?: number;
  /** Expected good dies per wafer. */
  goodDies?: number;
  /** Effective printable area inside edge exclusion (mm²). */
  printableArea: number;
  /** Die utilisation = (grossDies × dieArea) / printableArea. */
  utilisation: number;
  warnings: string[];
}

export function computeDiesPerWafer(spec: WaferSpec): WaferResult {
  if (spec.waferDiameter <= 0) throw new Error('waferDiameter must be positive');
  if (spec.dieWidth <= 0 || spec.dieHeight <= 0) {
    throw new Error('die dimensions must be positive');
  }
  if (spec.edgeExclusion < 0) throw new Error('edgeExclusion must be non-negative');
  const r = spec.waferDiameter / 2 - spec.edgeExclusion;
  if (r <= 0) {
    return {
      dies: [], grossDies: 0,
      printableArea: 0, utilisation: 0,
      warnings: ['edge exclusion exceeds wafer radius'],
    };
  }
  const ox = spec.centerOffsetX ?? 0;
  const oy = spec.centerOffsetY ?? 0;
  const stepX = spec.dieWidth + spec.scribeWidth;
  const stepY = spec.dieHeight + spec.scribeWidth;

  // Try the worst quadrant: enumerate all (col, row) where the die's
  // farthest corner lies within the printable circle.
  const dies: WaferDie[] = [];
  const colHi = Math.ceil(r / stepX) + 2;
  const rowHi = Math.ceil(r / stepY) + 2;
  for (let col = -colHi; col <= colHi; col++) {
    for (let row = -rowHi; row <= rowHi; row++) {
      const x = ox + col * stepX;
      const y = oy + row * stepY;
      // Die corners relative to wafer centre.
      const corners = [
        { x, y },
        { x: x + spec.dieWidth, y },
        { x, y: y + spec.dieHeight },
        { x: x + spec.dieWidth, y: y + spec.dieHeight },
      ];
      let inside = true;
      for (const c of corners) {
        if (c.x * c.x + c.y * c.y > r * r) { inside = false; break; }
      }
      if (inside) dies.push({ col, row, x, y });
    }
  }

  const printableArea = Math.PI * r * r;
  const dieArea = spec.dieWidth * spec.dieHeight;
  const utilisation = (dies.length * dieArea) / printableArea;

  let yieldPerDie: number | undefined;
  let goodDies: number | undefined;
  if (typeof spec.defectDensity === 'number' && spec.defectDensity >= 0) {
    // Convert die area mm² → cm².
    const aCm2 = dieArea / 100;
    const x = aCm2 * spec.defectDensity;
    if (x === 0) {
      yieldPerDie = 1;
    } else {
      const t = (1 - Math.exp(-x)) / x;
      yieldPerDie = t * t;
    }
    goodDies = dies.length * yieldPerDie;
  }

  const warnings: string[] = [];
  if (dies.length === 0) warnings.push('zero dies fit — die or exclusion too large');

  return {
    dies, grossDies: dies.length,
    yieldPerDie, goodDies,
    printableArea, utilisation, warnings,
  };
}

// ---------------------------------------------------------------------------
// Reticle packing (next-fit-decreasing-height shelf packer).
// ---------------------------------------------------------------------------

export interface ReticleDie {
  name: string;
  width: number;
  height: number;
}

export interface ReticleSpec {
  /** Reticle window in mm (typical: 26 × 33). */
  reticleWidth: number;
  reticleHeight: number;
  dies: ReticleDie[];
  /** Inter-die gap (mm). */
  gap: number;
}

export interface ReticlePlacement {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReticleResult {
  placements: ReticlePlacement[];
  unplaced: string[];
  occupied: number;
  utilisation: number;
}

export function packReticle(spec: ReticleSpec): ReticleResult {
  if (spec.reticleWidth <= 0 || spec.reticleHeight <= 0) {
    throw new Error('reticle window must have positive size');
  }
  // NFDH: sort by height desc, fill shelves left to right.
  const items = [...spec.dies].sort((a, b) => b.height - a.height);
  const placements: ReticlePlacement[] = [];
  const unplaced: string[] = [];
  let shelfY = 0, shelfX = 0, shelfH = 0;
  let occupied = 0;
  for (const d of items) {
    if (d.width > spec.reticleWidth || d.height > spec.reticleHeight) {
      unplaced.push(d.name); continue;
    }
    if (shelfX + d.width > spec.reticleWidth) {
      // New shelf.
      shelfY += shelfH + spec.gap;
      shelfX = 0;
      shelfH = 0;
    }
    if (shelfY + d.height > spec.reticleHeight) {
      unplaced.push(d.name); continue;
    }
    placements.push({
      name: d.name, x: shelfX, y: shelfY,
      width: d.width, height: d.height,
    });
    occupied += d.width * d.height;
    shelfX += d.width + spec.gap;
    if (d.height > shelfH) shelfH = d.height;
  }
  const utilisation = occupied / (spec.reticleWidth * spec.reticleHeight);
  return { placements, unplaced, occupied, utilisation };
}
