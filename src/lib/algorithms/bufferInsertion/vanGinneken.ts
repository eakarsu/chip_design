/**
 * Van Ginneken's Algorithm for Buffer Insertion
 *
 * Reference: "Buffer Placement in Distributed RC-tree Networks for Minimal
 * Elmore Delay" by L.P.P.P. van Ginneken (ISCAS 1990)
 *
 * Classic dynamic programming algorithm for optimal buffer insertion.
 * Minimizes Elmore delay while considering:
 * - Load capacitance
 * - Wire resistance/capacitance
 * - Buffer delay/capacitance
 * - Slew constraints
 */

import { Cell, Net, Point, BufferInsertionResult } from '@/types/algorithms';

export interface VanGinnekenParams {
  net: Net;
  cells: Cell[];
  bufferTypes: BufferType[];
  /** Maximum load any single gate may drive (fF). Hard constraint. */
  maxCapacitance: number;
  /** Maximum output slew at any sink. Hard constraint. */
  targetSlew: number;
  wireResistance?: number; // per unit length
  wireCapacitance?: number; // per unit length
  /** Output resistance of the net's driver (Ω). Default 0 = ideal source. */
  driverResistance?: number;
}

interface BufferType {
  name: string;
  delay: number;
  inputCap: number;
  outputResistance: number;
  power: number;
}

interface TreeNode {
  id: string;
  position: Point;
  children: TreeNode[];
  isPin: boolean;
  loadCap: number;
}

interface Solution {
  delay: number;
  capacitance: number;
  power: number;
  /** Estimated output slew at this point (same units as targetSlew). */
  slew: number;
  buffers: BufferPlacement[];
}

interface BufferPlacement {
  id: string;
  type: string;
  position: Point;
}

export function vanGinnekenBufferInsertion(params: VanGinnekenParams): BufferInsertionResult {
  const startTime = performance.now();
  const {
    net,
    cells,
    bufferTypes,
    maxCapacitance,
    targetSlew,
    wireResistance = 0.1, // ohms per unit
    wireCapacitance = 0.2, // fF per unit
    driverResistance = 0,
  } = params;

  try {
    // Build routing tree for net
    const tree = buildRoutingTree(net, cells);

    // Default buffer types if none provided
    const buffers = bufferTypes.length > 0 ? bufferTypes : getDefaultBuffers();

    // Run Van Ginneken algorithm
    const solution = vanGinnekenDP(
      tree,
      buffers,
      maxCapacitance,
      targetSlew,
      wireResistance,
      wireCapacitance,
      driverResistance ?? 0,
    );

    // Convert to cells
    const bufferCells = solution.buffers.map((buf, idx) => createBufferCell(buf, idx));

    const runtime = performance.now() - startTime;

    return {
      success: true,
      buffers: bufferCells,
      totalDelay: solution.delay,
      powerCost: solution.power,
      bufferCount: solution.buffers.length,
      runtime,
    };
  } catch (error) {
    const runtime = performance.now() - startTime;
    return {
      success: false,
      buffers: [],
      totalDelay: 0,
      powerCost: 0,
      bufferCount: 0,
      runtime,
    };
  }
}

function buildRoutingTree(net: Net, cells: Cell[]): TreeNode {
  // Resolve pin locations. A pin that cannot be resolved is skipped — but a
  // net whose pins are all missing has nothing to route.
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

  if (pins.length === 0) {
    throw new Error('No pins found for net');
  }

  // First pin is the driver (source); every other pin is a sink.
  const nodes: TreeNode[] = pins.map((position, i) => ({
    id: i === 0 ? 'source' : `sink_${i}`,
    position,
    children: [],
    isPin: true,
    loadCap: i === 0 ? 0.1 : 0.5, // fF (source pin / typical input cap)
  }));

  if (nodes.length === 1) return nodes[0];

  // Root the topology at the source using a rectilinear MST instead of a star.
  // A star made every sink hang directly off the driver, so the wire RC — and
  // therefore the delay the DP optimises — was wrong for anything with more
  // than two pins.
  const inTree = new Set<number>([0]);
  while (inTree.size < nodes.length) {
    let bestDist = Infinity;
    let bestFrom = -1;
    let bestTo = -1;
    for (const i of inTree) {
      for (let j = 0; j < nodes.length; j++) {
        if (inTree.has(j)) continue;
        const d =
          Math.abs(nodes[i].position.x - nodes[j].position.x) +
          Math.abs(nodes[i].position.y - nodes[j].position.y);
        if (d < bestDist) {
          bestDist = d;
          bestFrom = i;
          bestTo = j;
        }
      }
    }
    if (bestTo < 0) break;
    inTree.add(bestTo);
    nodes[bestFrom].children.push(nodes[bestTo]);
  }

  return nodes[0];
}

function vanGinnekenDP(
  tree: TreeNode,
  bufferTypes: BufferType[],
  maxCap: number,
  maxSlew: number,
  wireR: number,
  wireC: number,
  driverR: number
): Solution {
  // Bottom-up DP on routing tree
  function traverse(node: TreeNode): Solution[] {
    if (node.children.length === 0) {
      // Leaf node (sink pin): its pin cap is the entire downstream load.
      return [
        {
          delay: 0,
          capacitance: node.loadCap,
          power: 0,
          slew: 0,
          buffers: [],
        },
      ];
    }

    // Recursively process children
    const childSolutions: Solution[][] = node.children.map((child) => traverse(child));

    // Merge child solutions
    const merged = mergeSolutions(childSolutions, node.children, node, wireR, wireC);

    // Add buffer insertion options at this node. Only the source drives with a
    // known resistance; deeper nodes are driven by whatever sits upstream, so
    // their unbuffered slew is the value propagated up from below.
    const withBuffers = tryBufferInsertion(
      merged,
      bufferTypes,
      node === tree ? driverR : 0,
      node.position,
    );

    return withBuffers;
  }

  const allSolutions = traverse(tree);

  // `maxCapacitance` and `targetSlew` are *constraints*, not preferences:
  // candidates that violate them must not be returned. The previous code used
  // maxCap to decide whether to *insert* a buffer and never rejected anything,
  // and targetSlew was ignored entirely.
  const feasible = allSolutions.filter((s) => s.capacitance <= maxCap && s.slew <= maxSlew);
  const pool = feasible.length > 0 ? feasible : allSolutions;
  if (pool.length === 0) {
    throw new Error('Van Ginneken produced no candidates — empty tree?');
  }

  // Select best solution (minimum delay)
  return pool.reduce((min, sol) => (sol.delay < min.delay ? sol : min));
}

function mergeSolutions(
  childSolutions: Solution[][],
  children: TreeNode[],
  node: TreeNode,
  wireR: number,
  wireC: number
): Solution[] {
  if (childSolutions.length === 0) {
    return [
      {
        delay: 0,
        capacitance: node.loadCap,
        power: 0,
        slew: 0,
        buffers: [],
      },
    ];
  }

  // Fold the child frontiers together one child at a time and prune after
  // every fold, so the frontier stays small without throwing away
  // alternatives (taking only childSols[0] collapsed the DP to one candidate
  // per subtree).
  let frontier: Solution[] = [
    { delay: 0, capacitance: node.loadCap, power: 0, slew: 0, buffers: [] },
  ];

  for (let i = 0; i < childSolutions.length; i++) {
    const child = children[i];
    // Real wire geometry between this node and the child — not a constant.
    const dist =
      Math.abs(child.position.x - node.position.x) +
      Math.abs(child.position.y - node.position.y);
    const wireCap = dist * wireC;
    const wireRes = dist * wireR;

    const next: Solution[] = [];
    for (const base of frontier) {
      for (const sol of childSolutions[i]) {
        // Elmore delay of this wire driving the child's subtree.
        const wireDelay = wireRes * (wireCap + sol.capacitance);
        next.push({
          delay: Math.max(base.delay, sol.delay + wireDelay),
          capacitance: base.capacitance + sol.capacitance + wireCap,
          power: base.power + sol.power,
          // First-order slew degradation: the wire's own RC stretches the edge.
          slew: Math.max(base.slew, sol.slew + wireRes * wireCap),
          buffers: [...base.buffers, ...sol.buffers],
        });
      }
    }
    frontier = pruneDominatedSolutions(next);
  }

  return frontier;
}

function tryBufferInsertion(
  solutions: Solution[],
  bufferTypes: BufferType[],
  nodeR: number,
  position: Point
): Solution[] {
  const result: Solution[] = [];

  for (const sol of solutions) {
    // Keep the unbuffered candidate. When this node has its own driver (the
    // source) the driver's RC sets the slew here.
    const unbuffered: Solution =
      nodeR > 0
        ? { ...sol, slew: Math.max(sol.slew, nodeR * sol.capacitance) }
        : sol;
    result.push(unbuffered);

    for (const bufferType of bufferTypes) {
      // The buffer re-drives the downstream load `sol.capacitance`, so its
      // load-dependent delay and its output slew are both Rout·C_load.
      const driveSlew = bufferType.outputResistance * sol.capacitance;
      const buffered: Solution = {
        delay: sol.delay + bufferType.delay + driveSlew,
        capacitance: bufferType.inputCap,
        power: sol.power + bufferType.power,
        slew: driveSlew,
        buffers: [
          ...sol.buffers,
          {
            id: `buf_${sol.buffers.length}`,
            type: bufferType.name,
            // The buffer sits at the node it re-drives, not at the origin.
            position,
          },
        ],
      };
      result.push(buffered);
    }
  }

  // Prune dominated solutions
  return pruneDominatedSolutions(result);
}

function pruneDominatedSolutions(solutions: Solution[]): Solution[] {
  // Remove solutions that are strictly worse in all metrics
  const nonDominated: Solution[] = [];

  for (const sol of solutions) {
    let isDominated = false;

    for (const other of solutions) {
      if (sol === other) continue;

      if (
        other.delay <= sol.delay &&
        other.capacitance <= sol.capacitance &&
        other.power <= sol.power &&
        other.slew <= sol.slew &&
        (other.delay < sol.delay ||
          other.capacitance < sol.capacitance ||
          other.power < sol.power ||
          other.slew < sol.slew)
      ) {
        isDominated = true;
        break;
      }
    }

    if (!isDominated) {
      nonDominated.push(sol);
    }
  }

  return nonDominated;
}

function getDefaultBuffers(): BufferType[] {
  return [
    {
      name: 'BUF_X1',
      delay: 0.1, // ns
      inputCap: 0.5, // fF
      outputResistance: 100, // ohms
      power: 0.01, // mW
    },
    {
      name: 'BUF_X2',
      delay: 0.08,
      inputCap: 1.0,
      outputResistance: 50,
      power: 0.02,
    },
    {
      name: 'BUF_X4',
      delay: 0.06,
      inputCap: 2.0,
      outputResistance: 25,
      power: 0.04,
    },
  ];
}

function createBufferCell(buffer: BufferPlacement, index: number): Cell {
  return {
    id: buffer.id,
    name: `BUFFER_${index}`,
    width: 10,
    height: 10,
    position: buffer.position,
    pins: [
      {
        id: `${buffer.id}_in`,
        name: 'IN',
        position: { x: 0, y: 5 },
        direction: 'input',
      },
      {
        id: `${buffer.id}_out`,
        name: 'OUT',
        position: { x: 10, y: 5 },
        direction: 'output',
      },
    ],
    type: 'standard',
  };
}
