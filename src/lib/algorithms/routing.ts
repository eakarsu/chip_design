import {
  RoutingParams,
  RoutingResult,
  RoutingAlgorithm,
  Cell,
  Net,
  Wire,
  Point,
} from '@/types/algorithms';
import { clipWiresToBoundary } from './boundaryUtils';

// Grid-based routing representation
interface GridCell {
  x: number;
  y: number;
  layer: number;
  occupied: boolean;
  cost: number;
}

// Priority queue for A* algorithm
class PriorityQueue<T> {
  private items: { element: T; priority: number }[] = [];

  enqueue(element: T, priority: number) {
    this.items.push({ element, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }

  dequeue(): T | undefined {
    return this.items.shift()?.element;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}

// Helper: Get Manhattan distance
function manhattanDistance(p1: Point, p2: Point): number {
  return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
}

// Helper: Create 3D grid
function createGrid(
  width: number,
  height: number,
  layers: number,
  gridSize: number
): GridCell[][][] {
  const grid: GridCell[][][] = [];
  const cols = Math.ceil(width / gridSize);
  const rows = Math.ceil(height / gridSize);

  for (let layer = 0; layer < layers; layer++) {
    grid[layer] = [];
    for (let y = 0; y < rows; y++) {
      grid[layer][y] = [];
      for (let x = 0; x < cols; x++) {
        grid[layer][y][x] = {
          x,
          y,
          layer,
          occupied: false,
          cost: 1,
        };
      }
    }
  }

  return grid;
}

// Maze Routing (Lee's Algorithm)
export function mazeRouting(params: RoutingParams): RoutingResult {
  const startTime = performance.now();
  const {
    chipWidth,
    chipHeight,
    cells,
    nets,
    layers,
    gridSize = 10,
    viaWeight = 2,
  } = params;

  const grid = createGrid(chipWidth, chipHeight, layers, gridSize);
  const wires: Wire[] = [];
  const unroutedNets: string[] = [];
  let totalWirelength = 0;
  let viaCount = 0;

  // Route each net
  for (const net of nets) {
    if (net.pins.length < 2) continue;

    // Get source and target positions
    const pinPositions: Point[] = [];
    for (const pinId of net.pins) {
      for (const cell of cells) {
        const pin = cell.pins.find((p) => p.id === pinId);
        if (pin && cell.position) {
          pinPositions.push({
            x: Math.floor((cell.position.x + pin.position.x) / gridSize),
            y: Math.floor((cell.position.y + pin.position.y) / gridSize),
          });
        }
      }
    }

    if (pinPositions.length < 2) continue;

    // Route from first pin to all others using 2D BFS
    const source = pinPositions[0];
    const targets = pinPositions.slice(1);

    for (const target of targets) {
      const queue: { x: number; y: number; layer: number; cost: number }[] = [
        { x: source.x, y: source.y, layer: 0, cost: 0 },
      ];
      const visited = new Set<string>();
      const parent = new Map<string, { x: number; y: number; layer: number }>();

      visited.add(`${source.x},${source.y},0`);
      let found = false;

      while (queue.length > 0) {
        const current = queue.shift()!;
        const key = `${current.x},${current.y},${current.layer}`;

        if (current.x === target.x && current.y === target.y) {
          found = true;

          // Backtrack to create wire
          const wirePoints: Point[] = [];
          let curr = current;
          let currentLayer = current.layer;

          while (curr) {
            wirePoints.unshift({ x: curr.x * gridSize, y: curr.y * gridSize });
            if (curr.layer !== currentLayer) {
              viaCount++;
              currentLayer = curr.layer;
            }

            const parentKey = `${curr.x},${curr.y},${curr.layer}`;
            const p = parent.get(parentKey);
            if (!p) break;
            curr = { ...p, cost: 0 };
          }

          wires.push({
            id: `wire_${wires.length}`,
            netId: net.id,
            points: wirePoints,
            layer: current.layer,
            width: 1,
          });

          totalWirelength += wirePoints.length - 1;

          // Mark grid as occupied
          for (const point of wirePoints) {
            const gx = Math.floor(point.x / gridSize);
            const gy = Math.floor(point.y / gridSize);
            if (
              grid[current.layer] &&
              grid[current.layer][gy] &&
              grid[current.layer][gy][gx]
            ) {
              grid[current.layer][gy][gx].occupied = true;
            }
          }

          break;
        }

        // Explore neighbors (4-connected + layer changes)
        const directions = [
          { dx: 1, dy: 0, dl: 0 },
          { dx: -1, dy: 0, dl: 0 },
          { dx: 0, dy: 1, dl: 0 },
          { dx: 0, dy: -1, dl: 0 },
        ];

        // Add layer changes
        if (current.layer > 0) {
          directions.push({ dx: 0, dy: 0, dl: -1 });
        }
        if (current.layer < layers - 1) {
          directions.push({ dx: 0, dy: 0, dl: 1 });
        }

        for (const dir of directions) {
          const nx = current.x + dir.dx;
          const ny = current.y + dir.dy;
          const nl = current.layer + dir.dl;

          // Check bounds properly
          if (
            nx >= 0 && ny >= 0 &&
            nl >= 0 && nl < layers &&
            grid[nl] && ny < grid[nl].length &&
            grid[nl][ny] && nx < grid[nl][ny].length &&
            !grid[nl][ny][nx].occupied
          ) {
            const nkey = `${nx},${ny},${nl}`;
            if (!visited.has(nkey)) {
              visited.add(nkey);
              parent.set(nkey, { x: current.x, y: current.y, layer: current.layer });
              const viaCost = dir.dl !== 0 ? viaWeight : 1;
              queue.push({ x: nx, y: ny, layer: nl, cost: current.cost + viaCost });
            }
          }
        }
      }

      if (!found) {
        unroutedNets.push(net.id);
      }
    }
  }

  const runtime = performance.now() - startTime;

  return {
    success: unroutedNets.length === 0,
    wires,
    totalWirelength,
    viaCount,
    congestion: 0,
    runtime,
    unroutedNets,
  };
}

// A* Routing Algorithm
export function aStarRouting(params: RoutingParams): RoutingResult {
  const startTime = performance.now();
  const {
    chipWidth,
    chipHeight,
    cells,
    nets,
    layers,
    gridSize = 10,
    viaWeight = 2,
    bendWeight = 1.5,
  } = params;

  const grid = createGrid(chipWidth, chipHeight, layers, gridSize);
  const wires: Wire[] = [];
  const unroutedNets: string[] = [];
  let totalWirelength = 0;
  let viaCount = 0;

  for (const net of nets) {
    if (net.pins.length < 2) continue;

    const pinPositions: Point[] = [];
    for (const pinId of net.pins) {
      for (const cell of cells) {
        const pin = cell.pins.find((p) => p.id === pinId);
        if (pin && cell.position) {
          pinPositions.push({
            x: Math.floor((cell.position.x + pin.position.x) / gridSize),
            y: Math.floor((cell.position.y + pin.position.y) / gridSize),
          });
          break; // Found the pin, no need to check other cells
        }
      }
    }

    if (pinPositions.length < 2) {
      unroutedNets.push(net.id);
      continue;
    }

    const source = pinPositions[0];
    const targets = pinPositions.slice(1);

    for (const target of targets) {
      const openSet = new PriorityQueue<{
        x: number;
        y: number;
        layer: number;
      }>();
      const closedSet = new Set<string>();
      const gScore = new Map<string, number>();
      const fScore = new Map<string, number>();
      const cameFrom = new Map<
        string,
        { x: number; y: number; layer: number }
      >();

      const startKey = `${source.x},${source.y},0`;
      gScore.set(startKey, 0);
      fScore.set(
        startKey,
        manhattanDistance(source, target)
      );
      openSet.enqueue({ x: source.x, y: source.y, layer: 0 }, fScore.get(startKey)!);

      let found = false;

      while (!openSet.isEmpty()) {
        const current = openSet.dequeue()!;
        const currentKey = `${current.x},${current.y},${current.layer}`;

        // Skip if already processed
        if (closedSet.has(currentKey)) continue;
        closedSet.add(currentKey);

        if (current.x === target.x && current.y === target.y) {
          found = true;

          // Reconstruct path
          const wirePoints: Point[] = [];
          let curr = current;
          let currentLayer = current.layer;

          while (curr) {
            wirePoints.unshift({ x: curr.x * gridSize, y: curr.y * gridSize });
            if (curr.layer !== currentLayer) {
              viaCount++;
              currentLayer = curr.layer;
            }

            const p = cameFrom.get(`${curr.x},${curr.y},${curr.layer}`);
            if (!p) break;
            curr = p;
          }

          wires.push({
            id: `wire_${wires.length}`,
            netId: net.id,
            points: wirePoints,
            layer: current.layer,
            width: 1,
          });

          totalWirelength += wirePoints.length - 1;
          break;
        }

        const directions = [
          { dx: 1, dy: 0, dl: 0 },
          { dx: -1, dy: 0, dl: 0 },
          { dx: 0, dy: 1, dl: 0 },
          { dx: 0, dy: -1, dl: 0 },
        ];

        if (current.layer > 0) directions.push({ dx: 0, dy: 0, dl: -1 });
        if (current.layer < layers - 1) directions.push({ dx: 0, dy: 0, dl: 1 });

        for (const dir of directions) {
          const nx = current.x + dir.dx;
          const ny = current.y + dir.dy;
          const nl = current.layer + dir.dl;

          // Check bounds properly
          if (
            nx >= 0 && ny >= 0 &&
            nl >= 0 && nl < layers &&
            grid[nl] && ny < grid[nl].length &&
            grid[nl][ny] && nx < grid[nl][ny].length &&
            !grid[nl][ny][nx].occupied
          ) {
            const neighborKey = `${nx},${ny},${nl}`;
            const viaCost = dir.dl !== 0 ? viaWeight : 1;
            const bendCost = bendWeight; // Could calculate actual bend penalty
            const currentGScore = gScore.get(currentKey);
            const tentativeGScore =
              (currentGScore !== undefined ? currentGScore : Infinity) + viaCost * bendCost;

            const neighborGScore = gScore.get(neighborKey);
            if (tentativeGScore < (neighborGScore !== undefined ? neighborGScore : Infinity)) {
              cameFrom.set(neighborKey, current);
              gScore.set(neighborKey, tentativeGScore);
              const heuristic = manhattanDistance({ x: nx, y: ny }, target);
              fScore.set(neighborKey, tentativeGScore + heuristic);
              openSet.enqueue({ x: nx, y: ny, layer: nl }, fScore.get(neighborKey)!);
            }
          }
        }
      }

      if (!found) {
        unroutedNets.push(net.id);
      }
    }
  }

  const runtime = performance.now() - startTime;

  return {
    success: unroutedNets.length === 0,
    wires,
    totalWirelength,
    viaCount,
    congestion: 0,
    runtime,
    unroutedNets,
  };
}

// Global Routing (simplified grid-based)
export function globalRouting(params: RoutingParams): RoutingResult {
  const startTime = performance.now();
  const {
    chipWidth,
    chipHeight,
    nets,
    cells,
    layers,
    gridSize = 50, // Larger grid for global routing
  } = params;

  const wires: Wire[] = [];
  const unroutedNets: string[] = [];
  let totalWirelength = 0;

  // Create coarse grid
  const cols = Math.ceil(chipWidth / gridSize);
  const rows = Math.ceil(chipHeight / gridSize);
  const capacity: number[][] = Array(rows)
    .fill(0)
    .map(() => Array(cols).fill(10));

  for (const net of nets) {
    if (net.pins.length < 2) continue;

    const pinPositions: Point[] = [];
    for (const pinId of net.pins) {
      for (const cell of cells) {
        const pin = cell.pins.find((p) => p.id === pinId);
        if (pin && cell.position) {
          pinPositions.push({
            x: Math.floor((cell.position.x + pin.position.x) / gridSize),
            y: Math.floor((cell.position.y + pin.position.y) / gridSize),
          });
        }
      }
    }

    if (pinPositions.length < 2) continue;

    // Use L-shaped routing for global
    const source = pinPositions[0];
    const target = pinPositions[1];

    const wirePoints: Point[] = [
      { x: source.x * gridSize, y: source.y * gridSize },
      { x: target.x * gridSize, y: source.y * gridSize },
      { x: target.x * gridSize, y: target.y * gridSize },
    ];

    wires.push({
      id: `wire_${wires.length}`,
      netId: net.id,
      points: wirePoints,
      layer: 0,
      width: 2,
    });

    totalWirelength += Math.abs(target.x - source.x) + Math.abs(target.y - source.y);
  }

  const runtime = performance.now() - startTime;

  return {
    success: true,
    wires,
    totalWirelength,
    viaCount: 0,
    congestion: 0,
    runtime,
    unroutedNets,
  };
}

// Main routing dispatcher
export function runRouting(params: RoutingParams): RoutingResult {
  let result: RoutingResult;

  // Handle string algorithm names (from UI) or enum values
  const algorithm = typeof params.algorithm === 'string'
    ? params.algorithm.toLowerCase()
    : params.algorithm;

  switch (algorithm) {
    case RoutingAlgorithm.MAZE_ROUTING:
    case 'maze_routing':
      result = mazeRouting(params);
      break;
    case RoutingAlgorithm.A_STAR:
    case 'a_star':
      result = aStarRouting(params);
      break;
    case RoutingAlgorithm.GLOBAL_ROUTING:
    case 'global_routing':
      result = globalRouting(params);
      break;

    // New algorithms - for now, fall back to similar implementations
    case 'flute':
    case 'steiner_tree':
    case RoutingAlgorithm.STEINER_TREE:
    case RoutingAlgorithm.FLUTE:
    case RoutingAlgorithm.GEOSTEINER:
      // FLUTE is a Steiner tree algorithm - use A* as approximation
      console.log(`${algorithm}: Using A* approximation`);
      result = aStarRouting(params);
      break;

    case 'left_edge':
    case 'channel_routing':
    case 'detailed_routing':
    case 'pathfinder':
    case RoutingAlgorithm.LEFT_EDGE:
    case RoutingAlgorithm.CHANNEL_ROUTING:
    case RoutingAlgorithm.DETAILED_ROUTING:
    case RoutingAlgorithm.PATHFINDER:
    case RoutingAlgorithm.DOGLEG:
    case RoutingAlgorithm.SWITCHBOX:
    case RoutingAlgorithm.NEGOTIATION_BASED:
    case RoutingAlgorithm.GRIDGRAPH:
      // Use global routing as fallback for detailed routing algorithms
      console.log(`${algorithm}: Using global routing approximation`);
      result = globalRouting(params);
      break;

    // Buffer insertion algorithms
    case 'van_ginneken':
    case 'buffer_tree':
    case 'timing_driven':
      console.log(`${algorithm}: Using A* routing approximation`);
      result = aStarRouting(params);
      break;

    // Congestion estimation algorithms
    case 'rudy':
    case 'probabilistic':
    case 'grid_based':
      console.log(`${algorithm}: Using global routing approximation`);
      result = globalRouting(params);
      break;

    default:
      throw new Error(`Unsupported routing algorithm: ${algorithm}`);
  }

  // Ensure all wires stay within chip boundaries
  const fixedWires = clipWiresToBoundary(result.wires, params.chipWidth, params.chipHeight);

  return {
    ...result,
    wires: fixedWires,
  };
}
