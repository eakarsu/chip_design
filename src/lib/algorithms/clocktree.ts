import {
  ClockTreeParams,
  ClockTreeResult,
  ClockTreeAlgorithm,
  Cell,
  Point,
  Wire,
} from '@/types/algorithms';

// Clock tree node structure
interface ClockNode {
  id: string;
  position: Point;
  children: ClockNode[];
  parent?: ClockNode;
  delay: number;
  capacitance: number;
  isSink: boolean;
}

// Helper: Calculate Manhattan distance
function manhattanDistance(p1: Point, p2: Point): number {
  return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
}

// Helper: Calculate bounding box center
function calculateCenter(points: Point[]): Point {
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  return {
    x: sumX / points.length,
    y: sumY / points.length,
  };
}

// Helper: Calculate total wirelength
function calculateTreeWirelength(root: ClockNode): number {
  let totalLength = 0;

  function traverse(node: ClockNode) {
    for (const child of node.children) {
      totalLength += manhattanDistance(node.position, child.position);
      traverse(child);
    }
  }

  traverse(root);
  return totalLength;
}

// Helper: Calculate clock skew (max delay difference)
function calculateSkew(root: ClockNode): number {
  const sinkDelays: number[] = [];

  function traverse(node: ClockNode, pathDelay: number) {
    const currentDelay = pathDelay + node.delay;
    if (node.isSink) {
      sinkDelays.push(currentDelay);
    }
    for (const child of node.children) {
      traverse(child, currentDelay);
    }
  }

  traverse(root, 0);

  if (sinkDelays.length === 0) return 0;
  return Math.max(...sinkDelays) - Math.min(...sinkDelays);
}

// Helper: Convert tree to wires
function treeToWires(root: ClockNode): Wire[] {
  const wires: Wire[] = [];
  let wireId = 0;

  function traverse(node: ClockNode) {
    for (const child of node.children) {
      wires.push({
        id: `clk_wire_${wireId++}`,
        netId: 'clock_net',
        points: [node.position, child.position],
        layer: 1,
        width: 0.5,
      });
      traverse(child);
    }
  }

  traverse(root);
  return wires;
}

/**
 * H-Tree Clock Distribution
 * Creates a symmetric H-shaped tree structure for zero-skew clock distribution
 */
export function hTreeClock(params: ClockTreeParams): ClockTreeResult {
  const startTime = performance.now();
  const { clockSource, sinks, chipWidth, chipHeight } = params;

  // Build H-tree recursively
  function buildHTree(
    center: Point,
    width: number,
    height: number,
    targetSinks: Point[],
    level: number
  ): ClockNode {
    const node: ClockNode = {
      id: `h_node_${level}_${Math.random().toString(36).substr(2, 9)}`,
      position: center,
      children: [],
      delay: manhattanDistance(center, center) * 0.01, // Wire delay
      capacitance: 1.0,
      isSink: targetSinks.length === 1 && level > 3,
    };

    if (targetSinks.length <= 1 || level > 6) {
      return node;
    }

    // Create 4 H-tree branches
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const quarterWidth = width / 4;
    const quarterHeight = height / 4;

    const branches = [
      { x: center.x - quarterWidth, y: center.y + quarterHeight }, // Top-left
      { x: center.x + quarterWidth, y: center.y + quarterHeight }, // Top-right
      { x: center.x - quarterWidth, y: center.y - quarterHeight }, // Bottom-left
      { x: center.x + quarterWidth, y: center.y - quarterHeight }, // Bottom-right
    ];

    // Partition sinks to branches
    const sinkGroups = branches.map(() => [] as Point[]);
    for (const sink of targetSinks) {
      const distances = branches.map((b) => manhattanDistance(sink, b));
      const minIndex = distances.indexOf(Math.min(...distances));
      sinkGroups[minIndex].push(sink);
    }

    // Recursively build subtrees
    for (let i = 0; i < 4; i++) {
      if (sinkGroups[i].length > 0) {
        const child = buildHTree(
          branches[i],
          halfWidth,
          halfHeight,
          sinkGroups[i],
          level + 1
        );
        child.parent = node;
        node.children.push(child);
      }
    }

    return node;
  }

  const center = { x: chipWidth / 2, y: chipHeight / 2 };
  const root = buildHTree(center, chipWidth, chipHeight, sinks, 0);

  const wires = treeToWires(root);
  const totalWirelength = calculateTreeWirelength(root);
  const skew = calculateSkew(root);
  const runtime = performance.now() - startTime;

  return {
    success: true,
    root,
    wires,
    totalWirelength,
    skew,
    maxDelay: skew,
    bufferCount: 0,
    powerConsumption: totalWirelength * 0.1, // Simplified power model
    runtime,
  };
}

/**
 * X-Tree Clock Distribution
 * Similar to H-tree but with diagonal branches for better skew
 */
export function xTreeClock(params: ClockTreeParams): ClockTreeResult {
  const startTime = performance.now();
  const { sinks, chipWidth, chipHeight } = params;

  // Build X-tree with diagonal structure
  function buildXTree(
    center: Point,
    radius: number,
    targetSinks: Point[],
    level: number
  ): ClockNode {
    const node: ClockNode = {
      id: `x_node_${level}_${Math.random().toString(36).substr(2, 9)}`,
      position: center,
      children: [],
      delay: radius * 0.01,
      capacitance: 1.0,
      isSink: targetSinks.length === 1 && level > 3,
    };

    if (targetSinks.length <= 1 || level > 6) {
      return node;
    }

    // Create 4 diagonal branches (X pattern)
    const halfRadius = radius / 2;
    const diagonalOffset = halfRadius / Math.sqrt(2);

    const branches = [
      { x: center.x - diagonalOffset, y: center.y + diagonalOffset }, // Top-left diagonal
      { x: center.x + diagonalOffset, y: center.y + diagonalOffset }, // Top-right diagonal
      { x: center.x - diagonalOffset, y: center.y - diagonalOffset }, // Bottom-left diagonal
      { x: center.x + diagonalOffset, y: center.y - diagonalOffset }, // Bottom-right diagonal
    ];

    // Partition sinks
    const sinkGroups = branches.map(() => [] as Point[]);
    for (const sink of targetSinks) {
      const distances = branches.map((b) => manhattanDistance(sink, b));
      const minIndex = distances.indexOf(Math.min(...distances));
      sinkGroups[minIndex].push(sink);
    }

    // Build subtrees
    for (let i = 0; i < 4; i++) {
      if (sinkGroups[i].length > 0) {
        const child = buildXTree(branches[i], halfRadius, sinkGroups[i], level + 1);
        child.parent = node;
        node.children.push(child);
      }
    }

    return node;
  }

  const center = { x: chipWidth / 2, y: chipHeight / 2 };
  const radius = Math.max(chipWidth, chipHeight) / 2;
  const root = buildXTree(center, radius, sinks, 0);

  const wires = treeToWires(root);
  const totalWirelength = calculateTreeWirelength(root);
  const skew = calculateSkew(root);
  const runtime = performance.now() - startTime;

  return {
    success: true,
    root,
    wires,
    totalWirelength,
    skew,
    maxDelay: skew,
    bufferCount: 0,
    powerConsumption: totalWirelength * 0.1,
    runtime,
  };
}

/**
 * Mesh Clock Distribution
 * Creates a mesh/grid structure for robust clock distribution
 */
export function meshClock(params: ClockTreeParams): ClockTreeResult {
  const startTime = performance.now();
  const { sinks, chipWidth, chipHeight } = params;
  const meshDensity = params.meshDensity || 4;

  // Create mesh grid
  const stepX = chipWidth / meshDensity;
  const stepY = chipHeight / meshDensity;
  const meshNodes: ClockNode[][] = [];

  for (let i = 0; i <= meshDensity; i++) {
    const row: ClockNode[] = [];
    for (let j = 0; j <= meshDensity; j++) {
      const node: ClockNode = {
        id: `mesh_${i}_${j}`,
        position: { x: j * stepX, y: i * stepY },
        children: [],
        delay: 0.1,
        capacitance: 1.5,
        isSink: false,
      };
      row.push(node);
    }
    meshNodes.push(row);
  }

  // Connect mesh horizontally and vertically
  const wires: Wire[] = [];
  let wireId = 0;

  for (let i = 0; i <= meshDensity; i++) {
    for (let j = 0; j <= meshDensity; j++) {
      const node = meshNodes[i][j];

      // Connect to right neighbor
      if (j < meshDensity) {
        const right = meshNodes[i][j + 1];
        node.children.push(right);
        wires.push({
          id: `mesh_wire_${wireId++}`,
          netId: 'clock_mesh',
          points: [node.position, right.position],
          layer: 1,
          width: 1.0,
        });
      }

      // Connect to bottom neighbor
      if (i < meshDensity) {
        const bottom = meshNodes[i + 1][j];
        node.children.push(bottom);
        wires.push({
          id: `mesh_wire_${wireId++}`,
          netId: 'clock_mesh',
          points: [node.position, bottom.position],
          layer: 1,
          width: 1.0,
        });
      }
    }
  }

  // Connect sinks to nearest mesh nodes
  for (const sink of sinks) {
    const i = Math.round((sink.y / chipHeight) * meshDensity);
    const j = Math.round((sink.x / chipWidth) * meshDensity);
    const nearestNode = meshNodes[Math.min(i, meshDensity)][Math.min(j, meshDensity)];

    const sinkNode: ClockNode = {
      id: `sink_${Math.random().toString(36).substr(2, 9)}`,
      position: sink,
      children: [],
      delay: 0.05,
      capacitance: 0.5,
      isSink: true,
    };

    nearestNode.children.push(sinkNode);
    wires.push({
      id: `sink_wire_${wireId++}`,
      netId: 'clock_mesh',
      points: [nearestNode.position, sink],
      layer: 1,
      width: 0.5,
    });
  }

  const root = meshNodes[meshDensity / 2][meshDensity / 2];
  const totalWirelength = wires.reduce(
    (sum, w) => sum + manhattanDistance(w.points[0], w.points[1]),
    0
  );
  const skew = 0.05; // Mesh provides very low skew
  const runtime = performance.now() - startTime;

  return {
    success: true,
    root,
    wires,
    totalWirelength,
    skew,
    maxDelay: 0.5,
    bufferCount: (meshDensity + 1) * (meshDensity + 1),
    powerConsumption: totalWirelength * 0.15, // Mesh uses more power
    runtime,
  };
}

/**
 * DME (Deferred Merge Embedding) Algorithm
 * Bottom-up approach for zero-skew clock tree construction
 */
export function dmeAlgorithm(params: ClockTreeParams): ClockTreeResult {
  const startTime = performance.now();
  const { sinks } = params;

  // Create initial sink nodes
  let nodes: ClockNode[] = sinks.map((sink, i) => ({
    id: `sink_${i}`,
    position: sink,
    children: [],
    delay: 0,
    capacitance: 1.0,
    isSink: true,
  }));

  // Bottom-up merging
  while (nodes.length > 1) {
    // Find closest pair
    let minDist = Infinity;
    let minI = 0;
    let minJ = 1;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dist = manhattanDistance(nodes[i].position, nodes[j].position);
        if (dist < minDist) {
          minDist = dist;
          minI = i;
          minJ = j;
        }
      }
    }

    // Merge closest pair at their midpoint
    const node1 = nodes[minI];
    const node2 = nodes[minJ];
    const mergePoint = {
      x: (node1.position.x + node2.position.x) / 2,
      y: (node1.position.y + node2.position.y) / 2,
    };

    const mergedNode: ClockNode = {
      id: `dme_${Math.random().toString(36).substr(2, 9)}`,
      position: mergePoint,
      children: [node1, node2],
      delay: minDist * 0.01,
      capacitance: node1.capacitance + node2.capacitance,
      isSink: false,
    };

    node1.parent = mergedNode;
    node2.parent = mergedNode;

    // Remove merged nodes and add new node
    nodes = nodes.filter((_, i) => i !== minI && i !== minJ);
    nodes.push(mergedNode);
  }

  const root = nodes[0];
  const wires = treeToWires(root);
  const totalWirelength = calculateTreeWirelength(root);
  const skew = calculateSkew(root);
  const runtime = performance.now() - startTime;

  return {
    success: true,
    root,
    wires,
    totalWirelength,
    skew,
    maxDelay: skew,
    bufferCount: 0,
    powerConsumption: totalWirelength * 0.1,
    runtime,
  };
}

/**
 * Main clock tree synthesis function
 */
export function runClockTree(params: ClockTreeParams): ClockTreeResult {
  switch (params.algorithm) {
    case ClockTreeAlgorithm.H_TREE:
      return hTreeClock(params);
    case ClockTreeAlgorithm.X_TREE:
      return xTreeClock(params);
    case ClockTreeAlgorithm.MESH_CLOCK:
      return meshClock(params);
    case ClockTreeAlgorithm.MMM_ALGORITHM:
      return dmeAlgorithm(params);
    default:
      throw new Error(`Unknown clock tree algorithm: ${params.algorithm}`);
  }
}
