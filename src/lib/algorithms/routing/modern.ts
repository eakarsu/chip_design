import { Cell, Net } from '@/types/algorithms';

interface RoutingResult {
  routes: Array<{ netId: string; path: Array<{ x: number; y: number; layer: number }> }>;
  metrics: {
    totalWirelength: number;
    viaCount: number;
    overflowCount: number;
    executionTime: number;
    convergence: number;
  };
}

export type { RoutingResult };

// Helper to get cell positions from net pins
function getCellsFromNet(net: Net, cells: Cell[]): Cell[] {
  const connectedCells: Cell[] = [];
  for (const pinId of net.pins) {
    const cell = cells.find(c => c.pins.some(p => p.id === pinId));
    if (cell && !connectedCells.find(c => c.id === cell.id)) {
      connectedCells.push(cell);
    }
  }
  return connectedCells;
}

/**
 * TritonRoute - Industry-standard detailed router from OpenROAD
 * Features: DRC-driven, track assignment, via minimization
 * Reference: "TritonRoute: An Initial Detailed Router" (ICCAD 2019)
 */
export function runTritonRoute(
  cells: Cell[],
  nets: Net[],
  chipWidth: number,
  chipHeight: number,
  options: {
    numLayers?: number;
    trackPitch?: number;
    viaCost?: number;
    drcIterations?: number;
  } = {}
): RoutingResult {
  const {
    numLayers = 6,
    trackPitch = 0.5,
    viaCost = 1.5,
    drcIterations = 10,
  } = options;

  const startTime = performance.now();
  const routes: Array<{ netId: string; path: Array<{ x: number; y: number; layer: number }> }> = [];

  // Create routing grid
  const gridWidth = Math.ceil(chipWidth / trackPitch);
  const gridHeight = Math.ceil(chipHeight / trackPitch);

  // Track assignment data structure
  const trackUsage: Map<string, Set<number>> = new Map();

  let totalWirelength = 0;
  let totalVias = 0;
  let drcViolations = 0;

  // Phase 1: Initial track assignment
  nets.forEach((net) => {
    const route: Array<{ x: number; y: number; layer: number }> = [];

    const cellPositions = getCellsFromNet(net, cells);

    if (cellPositions.length < 2) {
      routes.push({ netId: net.id, path: route });
      return;
    }

    // Find bounding box
    const minX = Math.min(...cellPositions.map(c => c.position?.x || 0));
    const maxX = Math.max(...cellPositions.map(c => (c.position?.x || 0) + c.width));
    const minY = Math.min(...cellPositions.map(c => c.position?.y || 0));
    const maxY = Math.max(...cellPositions.map(c => (c.position?.y || 0) + c.height));

    // Steiner tree construction with layer assignment
    const steinerPoints = generateSteinerTree(cellPositions, minX, maxX, minY, maxY);

    // Assign to routing tracks with via minimization
    let currentLayer = 1;
    for (let i = 0; i < steinerPoints.length; i++) {
      const point = steinerPoints[i];

      // Check track availability
      const trackKey = `${Math.floor(point.x / trackPitch)}_${Math.floor(point.y / trackPitch)}`;
      if (!trackUsage.has(trackKey)) {
        trackUsage.set(trackKey, new Set());
      }

      // Via minimization: change layer only when necessary
      const usedLayers = trackUsage.get(trackKey)!;
      if (usedLayers.size >= numLayers - 1) {
        // Need to find alternative layer
        currentLayer = findLeastCongestedLayer(usedLayers, numLayers);
      }

      usedLayers.add(currentLayer);

      route.push({ x: point.x, y: point.y, layer: currentLayer });

      // Add via cost if layer changed
      if (i > 0 && route[i].layer !== route[i - 1].layer) {
        totalVias++;
      }
    }

    // Calculate wirelength
    for (let i = 1; i < route.length; i++) {
      const dx = route[i].x - route[i - 1].x;
      const dy = route[i].y - route[i - 1].y;
      totalWirelength += Math.sqrt(dx * dx + dy * dy);
      if (route[i].layer !== route[i - 1].layer) {
        totalWirelength += viaCost;
      }
    }

    routes.push({ netId: net.id, path: route });
  });

  // Phase 2: DRC-driven refinement iterations
  for (let iter = 0; iter < drcIterations; iter++) {
    const violations = detectDRCViolations(routes, trackPitch);
    drcViolations = violations.length;

    if (violations.length === 0) break;

    // Rip-up and reroute violating segments
    violations.forEach(violation => {
      ripUpAndReroute(routes, violation, trackUsage, numLayers, trackPitch);
    });
  }

  const endTime = performance.now();

  return {
    routes,
    metrics: {
      totalWirelength,
      viaCount: totalVias,
      overflowCount: drcViolations,
      executionTime: endTime - startTime,
      convergence: drcViolations === 0 ? 1.0 : 1.0 - (drcViolations / nets.length),
    },
  };
}

/**
 * BoxRouter - Modern global router with box expansion
 * Features: Monotonic routing, pattern routing, congestion-aware
 * Reference: OpenROAD flow
 */
export function runBoxRouter(
  cells: Cell[],
  nets: Net[],
  chipWidth: number,
  chipHeight: number,
  options: {
    gcellSize?: number;
    expansionFactor?: number;
    congestionWeight?: number;
  } = {}
): RoutingResult {
  const {
    gcellSize = 10,
    expansionFactor = 1.5,
    congestionWeight = 2.0,
  } = options;

  const startTime = performance.now();
  const routes: Array<{ netId: string; path: Array<{ x: number; y: number; layer: number }> }> = [];

  // Create global cell grid
  const numGCellsX = Math.ceil(chipWidth / gcellSize);
  const numGCellsY = Math.ceil(chipHeight / gcellSize);

  // Congestion map
  const congestionMap: number[][] = Array(numGCellsY)
    .fill(0)
    .map(() => Array(numGCellsX).fill(0));

  let totalWirelength = 0;
  let totalVias = 0;
  let overflows = 0;

  // Sort nets by criticality (approximated by bounding box)
  const sortedNets = [...nets].sort((a, b) => {
    const aBox = getNetBoundingBox(a, cells);
    const bBox = getNetBoundingBox(b, cells);
    return (aBox.width * aBox.height) - (bBox.width * bBox.height);
  });

  sortedNets.forEach((net) => {
    const route: Array<{ x: number; y: number; layer: number }> = [];

    const cellPositions = getCellsFromNet(net, cells);

    if (cellPositions.length === 0) {
      routes.push({ netId: net.id, path: route });
      return;
    }

    // Box expansion from source
    const source = cellPositions[0];
    const targets = cellPositions.slice(1);

    let currentBox = {
      minX: source.position?.x || 0,
      maxX: (source.position?.x || 0) + source.width,
      minY: source.position?.y || 0,
      maxY: (source.position?.y || 0) + source.height,
    };

    targets.forEach(target => {
      // Expand box to include target with congestion awareness
      const targetCenter = { x: (target.position?.x || 0) + target.width / 2, y: (target.position?.y || 0) + target.height / 2 };

      // Pattern routing: L-shape or Z-shape based on congestion
      const path = findPatternRoute(
        { x: (currentBox.minX + currentBox.maxX) / 2, y: (currentBox.minY + currentBox.maxY) / 2 },
        targetCenter,
        congestionMap,
        gcellSize,
        congestionWeight
      );

      path.forEach(point => {
        route.push({ x: point.x, y: point.y, layer: point.layer });

        // Update congestion
        const gcellX = Math.floor(point.x / gcellSize);
        const gcellY = Math.floor(point.y / gcellSize);
        if (gcellX >= 0 && gcellX < numGCellsX && gcellY >= 0 && gcellY < numGCellsY) {
          congestionMap[gcellY][gcellX]++;
          if (congestionMap[gcellY][gcellX] > 10) overflows++;
        }
      });

      // Expand bounding box
      currentBox = {
        minX: Math.min(currentBox.minX, target.position?.x || 0),
        maxX: Math.max(currentBox.maxX, (target.position?.x || 0) + target.width),
        minY: Math.min(currentBox.minY, target.position?.y || 0),
        maxY: Math.max(currentBox.maxY, (target.position?.y || 0) + target.height),
      };
    });

    // Calculate metrics
    for (let i = 1; i < route.length; i++) {
      const dx = route[i].x - route[i - 1].x;
      const dy = route[i].y - route[i - 1].y;
      totalWirelength += Math.sqrt(dx * dx + dy * dy);
      if (route[i].layer !== route[i - 1].layer) {
        totalVias++;
      }
    }

    routes.push({ netId: net.id, path: route });
  });

  const endTime = performance.now();

  return {
    routes,
    metrics: {
      totalWirelength,
      viaCount: totalVias,
      overflowCount: overflows,
      executionTime: endTime - startTime,
      convergence: overflows === 0 ? 1.0 : Math.max(0, 1.0 - overflows / 100),
    },
  };
}

/**
 * NCTU-GR - Negotiation-based global router
 * Features: Rip-up and reroute, history-based cost, multi-source
 * Reference: "NCTU-GR: Efficient Simulated Evolution-Based Rerouting" (TCAD 2008)
 */
export function runNCTUGR(
  cells: Cell[],
  nets: Net[],
  chipWidth: number,
  chipHeight: number,
  options: {
    iterations?: number;
    historyFactor?: number;
    presentCongestionCost?: number;
  } = {}
): RoutingResult {
  const {
    iterations = 20,
    historyFactor = 0.5,
    presentCongestionCost = 1.0,
  } = options;

  const startTime = performance.now();
  const routes: Array<{ netId: string; path: Array<{ x: number; y: number; layer: number }> }> = [];

  const gcellSize = 10;
  const numGCellsX = Math.ceil(chipWidth / gcellSize);
  const numGCellsY = Math.ceil(chipHeight / gcellSize);

  // Historical congestion
  const historyCost: number[][] = Array(numGCellsY)
    .fill(0)
    .map(() => Array(numGCellsX).fill(0));

  const presentCost: number[][] = Array(numGCellsY)
    .fill(0)
    .map(() => Array(numGCellsX).fill(0));

  let bestRoutes = [...routes];
  let bestOverflow = Infinity;
  let totalWirelength = 0;
  let totalVias = 0;

  // Negotiation-based routing iterations
  for (let iter = 0; iter < iterations; iter++) {
    const currentRoutes: typeof routes = [];

    // Reset present cost
    presentCost.forEach(row => row.fill(0));

    let iterWirelength = 0;
    let iterVias = 0;
    let overflow = 0;

    nets.forEach((net) => {
      const route: Array<{ x: number; y: number; layer: number }> = [];

      const cellPositions = getCellsFromNet(net, cells);

      if (cellPositions.length < 2) {
        currentRoutes.push({ netId: net.id, path: route });
        return;
      }

      // Multi-source maze routing with cost function
      const path = multiSourceMazeRouting(
        cellPositions,
        historyCost,
        presentCost,
        historyFactor,
        presentCongestionCost,
        gcellSize,
        numGCellsX,
        numGCellsY
      );

      path.forEach(point => {
        route.push(point);

        const gcellX = Math.floor(point.x / gcellSize);
        const gcellY = Math.floor(point.y / gcellSize);
        if (gcellX >= 0 && gcellX < numGCellsX && gcellY >= 0 && gcellY < numGCellsY) {
          presentCost[gcellY][gcellX]++;
          if (presentCost[gcellY][gcellX] > 5) {
            overflow++;
          }
        }
      });

      // Calculate metrics
      for (let i = 1; i < route.length; i++) {
        const dx = route[i].x - route[i - 1].x;
        const dy = route[i].y - route[i - 1].y;
        iterWirelength += Math.sqrt(dx * dx + dy * dy);
        if (route[i].layer !== route[i - 1].layer) {
          iterVias++;
        }
      }

      currentRoutes.push({ netId: net.id, path: route });
    });

    // Update history cost
    for (let y = 0; y < numGCellsY; y++) {
      for (let x = 0; x < numGCellsX; x++) {
        if (presentCost[y][x] > 5) {
          historyCost[y][x] += historyFactor;
        }
      }
    }

    // Track best solution
    if (overflow < bestOverflow) {
      bestOverflow = overflow;
      bestRoutes = currentRoutes;
      totalWirelength = iterWirelength;
      totalVias = iterVias;
    }
  }

  const endTime = performance.now();

  return {
    routes: bestRoutes,
    metrics: {
      totalWirelength,
      viaCount: totalVias,
      overflowCount: bestOverflow,
      executionTime: endTime - startTime,
      convergence: bestOverflow === 0 ? 1.0 : Math.max(0, 1.0 - bestOverflow / 100),
    },
  };
}

/**
 * Congestion-map-guided heuristic router.
 *
 * The historical name is kept for API compatibility (`routing.ts` and the
 * API routes dispatch to it as "gnn_routing"), but no graph neural network is
 * built, trained or evaluated here — the previous revision generated random
 * "embeddings" and a stub "A*" that ignored them. This version:
 *
 *   1. builds a deterministic RUDY-style congestion-demand map from each
 *      net's bounding box,
 *   2. routes every net as a staircase of gcell steps, picking the least-used
 *      / least-congested layer at each step (with a small via penalty),
 *   3. runs `iterations` greedy rip-up passes that move over-capacity steps
 *      onto a less-used layer,
 *   4. reports the measured wirelength, via count and gcell overflow.
 *
 * `embeddingDim` and `usePretrained` are accepted for API compatibility and
 * ignored: there are no embeddings and no pretrained model.
 */
export function runGNNRouting(
  cells: Cell[],
  nets: Net[],
  chipWidth: number,
  chipHeight: number,
  options: {
    gnnLayers?: number;
    embeddingDim?: number;
    iterations?: number;
    usePretrained?: boolean;
  } = {}
): RoutingResult {
  const { gnnLayers = 3, iterations = 15 } = options;
  const startTime = performance.now();
  const routes: Array<{ netId: string; path: Array<{ x: number; y: number; layer: number }> }> = [];

  const gcellSize = 10;
  const numGCellsX = Math.max(1, Math.ceil(chipWidth / gcellSize));
  const numGCellsY = Math.max(1, Math.ceil(chipHeight / gcellSize));
  const numLayers = Math.max(1, Math.min(8, Math.floor(gnnLayers)));
  const gcellCapacity = 1;

  const toGcell = (v: number, limit: number) =>
    Math.max(0, Math.min(limit - 1, Math.floor(v / gcellSize)));

  // RUDY-style demand: spread each net's pin count over the gcells in its
  // bounding box. Independent of routing order, so the map is deterministic.
  const demand: number[][] = Array.from({ length: numGCellsY }, () =>
    new Array<number>(numGCellsX).fill(0)
  );
  for (const net of nets) {
    const members = getCellsFromNet(net, cells);
    if (members.length < 2) continue;
    const minX = Math.min(...members.map((c) => c.position?.x ?? 0));
    const maxX = Math.max(...members.map((c) => (c.position?.x ?? 0) + c.width));
    const minY = Math.min(...members.map((c) => c.position?.y ?? 0));
    const maxY = Math.max(...members.map((c) => (c.position?.y ?? 0) + c.height));
    const gx0 = toGcell(minX, numGCellsX);
    const gx1 = toGcell(maxX, numGCellsX);
    const gy0 = toGcell(minY, numGCellsY);
    const gy1 = toGcell(maxY, numGCellsY);
    const gcellCount = Math.max(1, (gx1 - gx0 + 1) * (gy1 - gy0 + 1));
    const share = net.pins.length / gcellCount;
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        demand[gy][gx] += share;
      }
    }
  }

  // usage[layer][gy][gx]: number of routed steps through a gcell on a layer.
  const usage: number[][][] = Array.from({ length: numLayers + 1 }, () =>
    Array.from({ length: numGCellsY }, () => new Array<number>(numGCellsX).fill(0))
  );

  let totalWirelength = 0;
  let totalVias = 0;

  for (const net of nets) {
    const members = getCellsFromNet(net, cells);
    const route: Array<{ x: number; y: number; layer: number }> = [];

    if (members.length >= 2) {
      const points = members
        .map((c) => ({
          x: (c.position?.x ?? 0) + c.width / 2,
          y: (c.position?.y ?? 0) + c.height / 2,
        }))
        .sort((a, b) => a.x - b.x || a.y - b.y);

      const chooseLayer = (px: number, py: number, prevLayer: number): number => {
        const gx = toGcell(px, numGCellsX);
        const gy = toGcell(py, numGCellsY);
        let best = 1;
        let bestCost = Infinity;
        for (let layer = 1; layer <= numLayers; layer++) {
          const cost =
            usage[layer][gy][gx] * 10 + demand[gy][gx] + (layer === prevLayer ? 0 : 0.25);
          if (cost < bestCost) {
            bestCost = cost;
            best = layer;
          }
        }
        return best;
      };

      const pushPoint = (px: number, py: number) => {
        const prev = route[route.length - 1];
        const layer = chooseLayer(px, py, prev ? prev.layer : 1);
        const gx = toGcell(px, numGCellsX);
        const gy = toGcell(py, numGCellsY);
        usage[layer][gy][gx] += 1;
        if (prev) {
          totalWirelength += Math.hypot(px - prev.x, py - prev.y);
          if (prev.layer !== layer) totalVias++;
        }
        route.push({ x: px, y: py, layer });
      };

      const first = points[0];
      pushPoint(first.x, first.y);
      for (let i = 1; i < points.length; i++) {
        const from = route[route.length - 1];
        const to = points[i];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const xSteps = Math.ceil(Math.abs(dx) / gcellSize);
        const ySteps = Math.ceil(Math.abs(dy) / gcellSize);
        for (let s = 1; s <= xSteps; s++) {
          pushPoint(from.x + (dx * s) / xSteps, from.y);
        }
        for (let s = 1; s <= ySteps; s++) {
          pushPoint(to.x, from.y + (dy * s) / ySteps);
        }
      }
    }

    routes.push({ netId: net.id, path: route });
  }

  // Greedy rip-up: move steps sitting on over-capacity gcells onto the layer
  // with the fewest wires through that gcell.
  const passes = Math.max(0, Math.floor(iterations));
  for (let pass = 0; pass < passes; pass++) {
    let reassigned = 0;
    for (const route of routes) {
      for (const point of route.path) {
        const gx = toGcell(point.x, numGCellsX);
        const gy = toGcell(point.y, numGCellsY);
        if (usage[point.layer][gy][gx] <= gcellCapacity) continue;
        let bestLayer = point.layer;
        let bestUse = usage[point.layer][gy][gx];
        for (let layer = 1; layer <= numLayers; layer++) {
          if (usage[layer][gy][gx] < bestUse) {
            bestUse = usage[layer][gy][gx];
            bestLayer = layer;
          }
        }
        if (bestLayer !== point.layer) {
          usage[point.layer][gy][gx] -= 1;
          usage[bestLayer][gy][gx] += 1;
          point.layer = bestLayer;
          reassigned++;
        }
      }
    }
    if (reassigned === 0) break;
  }

  // Recompute vias and count gcell overflows from the measured usage map.
  totalVias = 0;
  let pathPoints = 0;
  for (const route of routes) {
    pathPoints += route.path.length;
    for (let i = 1; i < route.path.length; i++) {
      if (route.path[i].layer !== route.path[i - 1].layer) totalVias++;
    }
  }
  let overflowCount = 0;
  for (let layer = 1; layer <= numLayers; layer++) {
    for (let gy = 0; gy < numGCellsY; gy++) {
      for (let gx = 0; gx < numGCellsX; gx++) {
        if (usage[layer][gy][gx] > gcellCapacity) overflowCount++;
      }
    }
  }

  const endTime = performance.now();

  return {
    routes,
    metrics: {
      totalWirelength,
      viaCount: totalVias,
      overflowCount,
      executionTime: endTime - startTime,
      convergence:
        overflowCount === 0 ? 1 : Math.max(0, 1 - overflowCount / Math.max(1, pathPoints)),
    },
  };
}

// ============ Helper Functions ============

function generateSteinerTree(
  cells: Cell[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];

  cells.forEach(cell => {
    points.push({ x: (cell.position?.x || 0) + cell.width / 2, y: (cell.position?.y || 0) + cell.height / 2 });
  });

  // Simplified Steiner tree (actually a star connection to center)
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const tree: Array<{ x: number; y: number }> = [];
  points.forEach(point => {
    tree.push(point);
    tree.push({ x: centerX, y: centerY });
  });

  return tree;
}

function findLeastCongestedLayer(usedLayers: Set<number>, numLayers: number): number {
  for (let layer = 1; layer <= numLayers; layer++) {
    if (!usedLayers.has(layer)) return layer;
  }
  // Every layer is in use: cycle deterministically through the layers instead
  // of drawing a random one (this helper must be reproducible).
  if (numLayers <= 0) return 1;
  let maxUsed = 1;
  for (const layer of usedLayers) {
    if (layer > maxUsed) maxUsed = layer;
  }
  return ((maxUsed - 1) % numLayers) + 1;
}

/** Squared distance from `p` to segment `[a,b]`. */
function pointSegDist2(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const abx = b.x - a.x, aby = b.y - a.y;
  const apx = p.x - a.x, apy = p.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 <= 0) return apx * apx + apy * apy;
  let t = (apx * abx + apy * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = apx - t * abx, dy = apy - t * aby;
  return dx * dx + dy * dy;
}

function segsIntersect(
  a: { x: number; y: number }, b: { x: number; y: number },
  c: { x: number; y: number }, d: { x: number; y: number },
): boolean {
  const cross = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** Minimum distance between two 2-D segments. */
function segSegDist(
  a: { x: number; y: number }, b: { x: number; y: number },
  c: { x: number; y: number }, d: { x: number; y: number },
): number {
  if (segsIntersect(a, b, c, d)) return 0;
  return Math.sqrt(Math.min(
    pointSegDist2(a, c, d), pointSegDist2(b, c, d),
    pointSegDist2(c, a, b), pointSegDist2(d, a, b),
  ));
}

function detectDRCViolations(
  routes: Array<{ netId: string; path: Array<{ x: number; y: number; layer: number }> }>,
  spacing: number
): Array<{ netId: string; segmentIndex: number }> {
  const violations: Array<{ netId: string; segmentIndex: number }> = [];

  // Spacing DRC compares shapes belonging to *different* nets on the same
  // layer. Consecutive points of one route are the same signal (and meet at a
  // shared endpoint), so measuring them against the spacing rule flagged every
  // ordinary bend while never catching a real inter-net violation.
  const segs: Array<{ netId: string; index: number; layer: number; a: { x: number; y: number }; b: { x: number; y: number } }> = [];
  for (const route of routes) {
    for (let i = 1; i < route.path.length; i++) {
      const p1 = route.path[i - 1];
      const p2 = route.path[i];
      if (p1.x === p2.x && p1.y === p2.y) continue; // degenerate
      segs.push({ netId: route.netId, index: i, layer: p1.layer, a: p1, b: p2 });
    }
  }

  const seen = new Set<string>();
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s1 = segs[i], s2 = segs[j];
      if (s1.netId === s2.netId) continue;
      if (s1.layer !== s2.layer) continue;
      if (segSegDist(s1.a, s1.b, s2.a, s2.b) < spacing) {
        for (const s of [s1, s2]) {
          const key = `${s.netId}#${s.index}`;
          if (!seen.has(key)) {
            seen.add(key);
            violations.push({ netId: s.netId, segmentIndex: s.index });
          }
        }
      }
    }
  }

  return violations;
}

function ripUpAndReroute(
  routes: Array<{ netId: string; path: Array<{ x: number; y: number; layer: number }> }>,
  violation: { netId: string; segmentIndex: number },
  trackUsage: Map<string, Set<number>>,
  numLayers: number,
  trackPitch: number
): void {
  const route = routes.find(r => r.netId === violation.netId);
  if (!route) return;

  // Move the whole violating segment to a less congested layer (both of its
  // endpoints, so the segment itself — not just one end — leaves the crowded
  // layer). The joints become vias, which is what a rip-up is supposed to do.
  const i = violation.segmentIndex;
  if (i < 1 || i >= route.path.length) return;
  const usedLayers = new Set<number>();
  for (const p of route.path) usedLayers.add(p.layer);
  const newLayer = findLeastCongestedLayer(usedLayers, numLayers);
  route.path[i - 1].layer = newLayer;
  route.path[i].layer = newLayer;
}

function getNetBoundingBox(net: Net, cells: Cell[]): { width: number; height: number } {
  const cellPositions = getCellsFromNet(net, cells);

  if (cellPositions.length === 0) return { width: 0, height: 0 };

  const minX = Math.min(...cellPositions.map(c => c.position?.x || 0));
  const maxX = Math.max(...cellPositions.map(c => (c.position?.x || 0) + c.width));
  const minY = Math.min(...cellPositions.map(c => c.position?.y || 0));
  const maxY = Math.max(...cellPositions.map(c => (c.position?.y || 0) + c.height));

  return { width: maxX - minX, height: maxY - minY };
}

function findPatternRoute(
  source: { x: number; y: number },
  target: { x: number; y: number },
  congestionMap: number[][],
  gcellSize: number,
  congestionWeight: number
): Array<{ x: number; y: number; layer: number }> {
  const path: Array<{ x: number; y: number; layer: number }> = [];

  // Check L-shape vs Z-shape based on congestion
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;

  const gcellMidX = Math.floor(midX / gcellSize);
  const gcellMidY = Math.floor(midY / gcellSize);

  const midCongestion = congestionMap[gcellMidY]?.[gcellMidX] || 0;

  path.push({ x: source.x, y: source.y, layer: 1 });

  if (midCongestion > 5) {
    // L-shape to avoid congestion
    path.push({ x: target.x, y: source.y, layer: 1 });
  } else {
    // Z-shape through middle
    path.push({ x: midX, y: midY, layer: 1 });
  }

  path.push({ x: target.x, y: target.y, layer: 1 });

  return path;
}

function multiSourceMazeRouting(
  cells: Cell[],
  historyCost: number[][],
  presentCost: number[][],
  historyFactor: number,
  presentCongestionCost: number,
  gcellSize: number,
  numGCellsX: number,
  numGCellsY: number
): Array<{ x: number; y: number; layer: number }> {
  const path: Array<{ x: number; y: number; layer: number }> = [];

  // Simplified maze routing from first cell to others
  cells.forEach(cell => {
    const centerX = (cell.position?.x || 0) + cell.width / 2;
    const centerY = (cell.position?.y || 0) + cell.height / 2;
    path.push({ x: centerX, y: centerY, layer: 1 });
  });

  return path;
}

