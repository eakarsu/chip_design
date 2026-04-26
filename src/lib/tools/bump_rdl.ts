/**
 * Flip-chip bump array + simple RDL fanout planner.
 *
 * Given a die size, a desired bump pitch and diameter, and a list of
 * peripheral I/O pads, we emit:
 *
 *   - **bumps** — a regular hex or grid array centered on the die, with an
 *     optional keep-out border (mm-edge exclusion), and
 *   - **RDL traces** — an L-shaped Manhattan route from each pad to the
 *     nearest unassigned bump.
 *
 * This is a planner, not a router: it does not check trace-trace spacing
 * across more than one neighbour, but it gives you a useful first-cut bump
 * map and a sense of which I/Os are stranded.
 *
 * All coordinates are microns.
 */

export interface BumpRdlSpec {
  /** Die rectangle. */
  die: { xl: number; yl: number; xh: number; yh: number };
  /** Bump centre-to-centre pitch (μm). */
  pitch: number;
  /** Bump diameter (μm). */
  diameter: number;
  /** Edge keep-out from the die boundary to first bump centre (μm). */
  edgeKeepout: number;
  /** Array pattern. */
  pattern: 'grid' | 'hex';
  /** I/O pads to fan out. Each is a point on the die periphery. */
  pads: { name: string; x: number; y: number }[];
}

export interface Bump {
  name: string;
  x: number;
  y: number;
  diameter: number;
  /** Connected pad name, if any. */
  pad?: string;
}

export interface RdlTrace {
  pad: string;
  bump: string;
  /** Polyline waypoints (μm) — pad → corner → bump. */
  points: { x: number; y: number }[];
  /** Manhattan length (μm). */
  length: number;
}

export interface BumpRdlResult {
  bumps: Bump[];
  traces: RdlTrace[];
  unassigned: string[];
  totalLength: number;
  /** Useful aggregate metrics. */
  bumpCount: number;
  assigned: number;
  warnings: string[];
}

export function planBumps(spec: BumpRdlSpec): BumpRdlResult {
  if (spec.pitch <= 0) throw new Error('pitch must be positive');
  if (spec.diameter <= 0) throw new Error('diameter must be positive');
  if (spec.diameter >= spec.pitch) {
    throw new Error('diameter must be smaller than pitch');
  }
  const { die, pitch, diameter, edgeKeepout, pattern, pads } = spec;
  if (die.xh <= die.xl || die.yh <= die.yl) {
    throw new Error('die has non-positive area');
  }

  const bumps: Bump[] = [];
  const warnings: string[] = [];

  const xLo = die.xl + edgeKeepout;
  const xHi = die.xh - edgeKeepout;
  const yLo = die.yl + edgeKeepout;
  const yHi = die.yh - edgeKeepout;

  if (xHi < xLo || yHi < yLo) {
    warnings.push('edgeKeepout exceeds half the die — no bumps placed');
  } else {
    let id = 0;
    if (pattern === 'grid') {
      for (let y = yLo; y <= yHi + 1e-9; y += pitch) {
        for (let x = xLo; x <= xHi + 1e-9; x += pitch) {
          bumps.push({ name: `B${id++}`, x, y, diameter });
        }
      }
    } else {
      const dy = pitch * Math.sqrt(3) / 2;
      let row = 0;
      for (let y = yLo; y <= yHi + 1e-9; y += dy) {
        const xOff = row % 2 === 0 ? 0 : pitch / 2;
        for (let x = xLo + xOff; x <= xHi + 1e-9; x += pitch) {
          bumps.push({ name: `B${id++}`, x, y, diameter });
        }
        row++;
      }
    }
  }

  // Greedy nearest-bump assignment (Manhattan).
  const free = bumps.map((_, i) => i);
  const traces: RdlTrace[] = [];
  const unassigned: string[] = [];
  let totalLength = 0;
  for (const pad of pads) {
    let bestIdx = -1, bestDist = Infinity;
    for (const i of free) {
      const b = bumps[i];
      const d = Math.abs(b.x - pad.x) + Math.abs(b.y - pad.y);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx === -1) { unassigned.push(pad.name); continue; }
    const bump = bumps[bestIdx];
    bump.pad = pad.name;
    free.splice(free.indexOf(bestIdx), 1);
    // L-shape: horizontal first, then vertical.
    traces.push({
      pad: pad.name, bump: bump.name,
      points: [
        { x: pad.x, y: pad.y },
        { x: bump.x, y: pad.y },
        { x: bump.x, y: bump.y },
      ],
      length: bestDist,
    });
    totalLength += bestDist;
  }

  return {
    bumps, traces, unassigned, totalLength,
    bumpCount: bumps.length,
    assigned: traces.length,
    warnings,
  };
}
