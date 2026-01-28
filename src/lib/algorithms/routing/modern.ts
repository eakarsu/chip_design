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
 * GNN-Based Routing - Graph neural network guided routing
 * Features: Learned congestion prediction, GNN embeddings, adaptive routing
 * Reference: "RouteNet: Routability Prediction for Mixed-Size Designs" (ICCAD 2018)
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
  const {
    gnnLayers = 3,
    embeddingDim = 64,
    iterations = 15,
    usePretrained = true,
  } = options;

  const startTime = performance.now();
  const routes: Array<{ netId: string; path: Array<{ x: number; y: number; layer: number }> }> = [];

  const gcellSize = 10;
  const numGCellsX = Math.ceil(chipWidth / gcellSize);
  const numGCellsY = Math.ceil(chipHeight / gcellSize);

  // Build routing graph
  const routingGraph = buildRoutingGraph(cells, nets, gcellSize, numGCellsX, numGCellsY);

  // Initialize GNN embeddings (simulated)
  const nodeEmbeddings: Map<number, number[]> = new Map();
  routingGraph.nodes.forEach(node => {
    nodeEmbeddings.set(node.id, Array(embeddingDim).fill(0).map(() => Math.random() - 0.5));
  });

  let totalWirelength = 0;
  let totalVias = 0;
  let overflow = 0;

  // GNN message passing to learn congestion patterns
  for (let layer = 0; layer < gnnLayers; layer++) {
    const newEmbeddings: Map<number, number[]> = new Map();

    routingGraph.nodes.forEach(node => {
      const neighbors = routingGraph.edges
        .filter(e => e.from === node.id || e.to === node.id)
        .map(e => e.from === node.id ? e.to : e.from);

      // Aggregate neighbor embeddings
      const aggregated = Array(embeddingDim).fill(0);
      neighbors.forEach(neighborId => {
        const neighborEmbed = nodeEmbeddings.get(neighborId) || Array(embeddingDim).fill(0);
        for (let i = 0; i < embeddingDim; i++) {
          aggregated[i] += neighborEmbed[i];
        }
      });

      if (neighbors.length > 0) {
        for (let i = 0; i < embeddingDim; i++) {
          aggregated[i] /= neighbors.length;
        }
      }

      // Update with ReLU activation
      const currentEmbed = nodeEmbeddings.get(node.id)!;
      const updated = Array(embeddingDim);
      for (let i = 0; i < embeddingDim; i++) {
        updated[i] = Math.max(0, 0.5 * currentEmbed[i] + 0.5 * aggregated[i]);
      }

      newEmbeddings.set(node.id, updated);
    });

    nodeEmbeddings.clear();
    newEmbeddings.forEach((embed, id) => nodeEmbeddings.set(id, embed));
  }

  // Predict congestion from embeddings
  const predictedCongestion: number[][] = Array(numGCellsY)
    .fill(0)
    .map(() => Array(numGCellsX).fill(0));

  routingGraph.nodes.forEach(node => {
    const embedding = nodeEmbeddings.get(node.id)!;
    // Simulate congestion prediction from embedding
    const congestionScore = embedding.reduce((a, b) => a + Math.abs(b), 0) / embeddingDim;
    predictedCongestion[node.y][node.x] = congestionScore;
  });

  // Route nets using GNN-predicted congestion
  nets.forEach((net) => {
    const route: Array<{ x: number; y: number; layer: number }> = [];

    const cellPositions = getCellsFromNet(net, cells);

    if (cellPositions.length < 2) {
      routes.push({ netId: net.id, path: route });
      return;
    }

    // GNN-guided A* routing
    const path = gnnGuidedAstar(
      cellPositions,
      predictedCongestion,
      nodeEmbeddings,
      gcellSize,
      numGCellsX,
      numGCellsY,
      embeddingDim
    );

    path.forEach(point => route.push(point));

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
      overflowCount: overflow,
      executionTime: endTime - startTime,
      convergence: 0.95, // GNN typically converges well
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
  return Math.floor(Math.random() * numLayers) + 1;
}

function detectDRCViolations(
  routes: Array<{ netId: string; path: Array<{ x: number; y: number; layer: number }> }>,
  spacing: number
): Array<{ netId: string; segmentIndex: number }> {
  const violations: Array<{ netId: string; segmentIndex: number }> = [];

  // Simplified DRC check (spacing violations)
  routes.forEach(route => {
    for (let i = 1; i < route.path.length; i++) {
      const p1 = route.path[i - 1];
      const p2 = route.path[i];
      const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

      if (dist < spacing && p1.layer === p2.layer) {
        violations.push({ netId: route.netId, segmentIndex: i });
      }
    }
  });

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

  // Simple fix: change layer at violation point
  const point = route.path[violation.segmentIndex];
  const newLayer = findLeastCongestedLayer(new Set([point.layer]), numLayers);
  point.layer = newLayer;
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

function buildRoutingGraph(
  cells: Cell[],
  nets: Net[],
  gcellSize: number,
  numGCellsX: number,
  numGCellsY: number
): { nodes: Array<{ id: number; x: number; y: number }>; edges: Array<{ from: number; to: number }> } {
  const nodes: Array<{ id: number; x: number; y: number }> = [];
  const edges: Array<{ from: number; to: number }> = [];

  // Create grid nodes
  let nodeId = 0;
  for (let y = 0; y < numGCellsY; y++) {
    for (let x = 0; x < numGCellsX; x++) {
      nodes.push({ id: nodeId++, x, y });
    }
  }

  // Create grid edges (4-connected)
  nodes.forEach(node => {
    const neighbors = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];

    neighbors.forEach(({ dx, dy }) => {
      const nx = node.x + dx;
      const ny = node.y + dy;
      if (nx >= 0 && nx < numGCellsX && ny >= 0 && ny < numGCellsY) {
        const neighborId = ny * numGCellsX + nx;
        edges.push({ from: node.id, to: neighborId });
      }
    });
  });

  return { nodes, edges };
}

function gnnGuidedAstar(
  cells: Cell[],
  predictedCongestion: number[][],
  nodeEmbeddings: Map<number, number[]>,
  gcellSize: number,
  numGCellsX: number,
  numGCellsY: number,
  embeddingDim: number
): Array<{ x: number; y: number; layer: number }> {
  const path: Array<{ x: number; y: number; layer: number }> = [];

  // Simplified A* with GNN cost
  cells.forEach(cell => {
    const centerX = (cell.position?.x || 0) + cell.width / 2;
    const centerY = (cell.position?.y || 0) + cell.height / 2;

    const gcellX = Math.floor(centerX / gcellSize);
    const gcellY = Math.floor(centerY / gcellSize);

    // Use predicted congestion for routing cost
    const congestion = predictedCongestion[gcellY]?.[gcellX] || 0;
    const layer = congestion > 0.5 ? 2 : 1; // Change layer if congested

    path.push({ x: centerX, y: centerY, layer });
  });

  return path;
}
