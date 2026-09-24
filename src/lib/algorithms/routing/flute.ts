/**
 * FLUTE: Fast Lookup Table based Wirelength Estimation and Steiner Tree Construction
 *
 * Reference: "FLUTE: Fast Lookup Table Based Rectilinear Steiner Minimal Tree Algorithm
 * for VLSI Design" by Chris Chu (Iowa State University, TCAD 2008)
 *
 * FLUTE is one of the most efficient Steiner tree algorithms used in modern EDA tools.
 * It uses precomputed lookup tables for small pin counts and a heuristic for larger nets.
 *
 * Features:
 * - Exact for 2- and 3-pin nets (analytic L-shape / median Steiner point)
 * - Near-optimal for larger pin counts (MST + 1-Steiner Hanan-grid improvement)
 * - Extremely fast (microseconds per net)
 *
 * Note: the production FLUTE tables cover up to 9 pins; we do not ship the
 * lookup tables here, so nets of 4+ pins use the improvement heuristic rather
 * than the provably optimal topology.
 */

import { Cell, Net, Point, Wire, RoutingResult } from '@/types/algorithms';

export interface FLUTEParams {
  chipWidth: number;
  chipHeight: number;
  cells: Cell[];
  nets: Net[];
  accuracy?: number; // 1-10, higher = better quality but slower
}

interface Edge {
  from: Point;
  to: Point;
  layer: number;
}

export function fluteRouting(params: FLUTEParams): RoutingResult {
  const startTime = performance.now();
  const { chipWidth, chipHeight, cells, nets, accuracy = 3 } = params;

  const wires: Wire[] = [];
  let totalWirelength = 0;
  let viaCount = 0;
  const unroutedNets: string[] = [];

  try {
    // Route each net using FLUTE algorithm
    for (const net of nets) {
      const pins = getPinLocations(net, cells);

      if (pins.length < 2) {
        unroutedNets.push(net.id);
        continue;
      }

      // Construct Steiner tree
      const steinerTree = pins.length <= 9
        ? fluteOptimal(pins, accuracy)
        : fluteHeuristic(pins, accuracy);

      // Convert tree to wires
      const netWires = treeToWires(steinerTree, net.id);

      wires.push(...netWires);
      totalWirelength += calculateTreeLength(steinerTree);
      viaCount += countVias(netWires);
    }

    // Calculate congestion
    const congestion = estimateCongestion(wires, chipWidth, chipHeight);

    const runtime = performance.now() - startTime;

    return {
      success: true,
      wires,
      totalWirelength,
      viaCount,
      congestion,
      runtime,
      unroutedNets,
    };
  } catch (error) {
    const runtime = performance.now() - startTime;
    return {
      success: false,
      wires: [],
      totalWirelength: 0,
      viaCount: 0,
      congestion: 0,
      runtime,
      unroutedNets: nets.map((n) => n.id),
    };
  }
}

function getPinLocations(net: Net, cells: Cell[]): Point[] {
  const pins: Point[] = [];

  for (const pinId of net.pins) {
    for (const cell of cells) {
      const pin = cell.pins.find((p) => p.id === pinId);
      if (pin && cell.position) {
        pins.push({
          x: cell.position.x + pin.position.x,
          y: cell.position.y + pin.position.y,
        });
        break;
      }
    }
  }

  return pins;
}

/**
 * Small net cases solved analytically. 4-9 pin nets have no lookup table in
 * this build, so they fall through to the same MST + 1-Steiner heuristic the
 * large nets use.
 */
function fluteOptimal(pins: Point[], accuracy: number): Edge[] {
  if (pins.length === 2) {
    // Two pins: simple L-shaped routing
    return createLRoute(pins[0], pins[1]);
  }

  if (pins.length === 3) {
    // Three pins: analytic rectilinear Steiner point (Hanan-grid median)
    return createTriangleSteiner(pins);
  }

  return fluteHeuristic(pins, accuracy);
}

/**
 * Heuristic for larger pin counts: rectilinear MST followed by 1-Steiner
 * improvement over the Hanan grid (Hwang-Richards style).
 */
function fluteHeuristic(pins: Point[], accuracy: number): Edge[] {
  if (pins.length < 2) return [];

  const mst = buildRectilinearMST(pins);
  return improveWithSteinerPoints(pins, mst, accuracy);
}

/** Prim's MST on rectilinear distance. */
function buildRectilinearMST(pts: Point[]): Edge[] {
  const inTree = new Set<number>([0]);
  const edges: Edge[] = [];

  while (inTree.size < pts.length) {
    let bestCost = Infinity;
    let bestFrom = -1;
    let bestTo = -1;

    for (const i of inTree) {
      for (let j = 0; j < pts.length; j++) {
        if (inTree.has(j)) continue;
        const d = manhattanDistance(pts[i], pts[j]);
        if (d < bestCost) {
          bestCost = d;
          bestFrom = i;
          bestTo = j;
        }
      }
    }

    if (bestTo < 0) break;
    // Emit the MST edge as an L-shape: a straight pin-to-pin segment would be
    // diagonal whenever the pins differ in both coordinates.
    edges.push(...createLRoute(pts[bestFrom], pts[bestTo]));
    inTree.add(bestTo);
  }

  return edges;
}

/**
 * 1-Steiner improvement: greedily add the Hanan-grid point that most shortens
 * the tree, reconnect with an MST, repeat. `accuracy` (1-10) bounds how many
 * candidate Steiner points are examined — 10 = exhaustive grid search.
 *
 * A Steiner point can only shorten a net with ≥ 3 terminals, so this is the
 * only place Steiner insertion is valid (the old code looked for one between
 * two pins, where an L-shape is already minimal).
 */
function improveWithSteinerPoints(pins: Point[], edges: Edge[], accuracy: number): Edge[] {
  const xs = Array.from(new Set(pins.map((p) => p.x)));
  const ys = Array.from(new Set(pins.map((p) => p.y)));
  const isPin = new Set(pins.map((p) => `${p.x},${p.y}`));
  const candidates: Point[] = [];
  for (const x of xs) {
    for (const y of ys) {
      if (!isPin.has(`${x},${y}`)) candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return edges;

  const budget = Math.max(1, Math.round((candidates.length * accuracy) / 10));
  const stride = Math.max(1, Math.floor(candidates.length / budget));
  const sampled: Point[] = [];
  for (let i = 0; i < candidates.length && sampled.length < budget; i += stride) {
    sampled.push(candidates[i]);
  }

  let bestEdges = edges;
  let bestLen = calculateTreeLength(edges);
  const work = [...pins];

  for (const c of sampled) {
    const augmented = [...work, c];
    const tree = buildRectilinearMST(augmented);
    const len = calculateTreeLength(tree);
    if (len < bestLen - 1e-9) {
      bestLen = len;
      bestEdges = tree;
      work.push(c);
    }
  }

  return bestEdges;
}

function createLRoute(from: Point, to: Point): Edge[] {
  // Simple L-shaped route (horizontal then vertical). Degenerate halves are
  // dropped so we never emit zero-length wires.
  const corner: Point = { x: to.x, y: from.y };

  return [
    { from, to: corner, layer: 1 },
    { from: corner, to, layer: 1 },
  ].filter((e) => manhattanDistance(e.from, e.to) > 0);
}

/**
 * Exact rectilinear Steiner tree for 3 pins: the Steiner point sits at the
 * coordinate-wise median, which minimises Σ d(S, pi). Connections are emitted
 * as L-shapes so the geometry is rectilinear and matches the reported length.
 */
function createTriangleSteiner(pins: Point[]): Edge[] {
  const sortedX = [...pins].sort((a, b) => a.x - b.x);
  const sortedY = [...pins].sort((a, b) => a.y - b.y);

  const steiner: Point = {
    x: sortedX[1].x,
    y: sortedY[1].y,
  };

  return pins.flatMap((pin) => createLRoute(steiner, pin));
}

function manhattanDistance(p1: Point, p2: Point): number {
  return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
}

function calculateTreeLength(edges: Edge[]): number {
  return edges.reduce((sum, edge) => sum + manhattanDistance(edge.from, edge.to), 0);
}

function treeToWires(edges: Edge[], netId: string): Wire[] {
  return edges.map((edge, idx) => ({
    id: `${netId}_wire_${idx}`,
    netId,
    points: [edge.from, edge.to],
    layer: edge.layer,
    width: 1,
  }));
}

function countVias(wires: Wire[]): number {
  // A via is a layer change at a shared endpoint between two segments. The
  // previous version counted `points.length / 2` of each wire, which is 0 for
  // the 2-point wires this router produces and never looked at `layer`.
  const layersAt = new Map<string, Set<number>>();
  for (const wire of wires) {
    for (const p of wire.points) {
      const key = `${p.x},${p.y}`;
      let layers = layersAt.get(key);
      if (!layers) {
        layers = new Set<number>();
        layersAt.set(key, layers);
      }
      layers.add(wire.layer);
    }
  }

  let vias = 0;
  for (const layers of layersAt.values()) {
    vias += Math.max(0, layers.size - 1);
  }
  return vias;
}

function estimateCongestion(wires: Wire[], chipWidth: number, chipHeight: number): number {
  // Congestion = peak wire density over a regular grid. Every segment has to
  // be splatted into the cells it crosses — binning only the endpoints made
  // long wires invisible to the map.
  const gridSize = 50;
  const gridX = Math.max(1, Math.ceil(chipWidth / gridSize));
  const gridY = Math.max(1, Math.ceil(chipHeight / gridSize));
  const grid: number[][] = Array(gridY)
    .fill(0)
    .map(() => Array(gridX).fill(0));

  const bin = (point: Point) => {
    const gx = Math.min(Math.max(Math.floor(point.x / gridSize), 0), gridX - 1);
    const gy = Math.min(Math.max(Math.floor(point.y / gridSize), 0), gridY - 1);
    grid[gy][gx]++;
  };

  for (const wire of wires) {
    for (let i = 1; i < wire.points.length; i++) {
      const a = wire.points[i - 1];
      const b = wire.points[i];
      bin(a);
      bin(b);
      // Walk the segment at half-cell resolution so no cell it crosses is
      // skipped for long wires.
      const steps = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / (gridSize / 2));
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        bin({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
  }

  // Calculate max congestion
  return Math.max(0, ...grid.flat());
}
