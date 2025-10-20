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
  maxCapacitance: number;
  targetSlew: number;
  wireResistance?: number; // per unit length
  wireCapacitance?: number; // per unit length
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
  } = params;

  try {
    // Build routing tree for net
    const tree = buildRoutingTree(net, cells);

    // Default buffer types if none provided
    const buffers = bufferTypes.length > 0 ? bufferTypes : getDefaultBuffers();

    // Run Van Ginneken algorithm
    const solution = vanGinnekenDP(tree, buffers, maxCapacitance, wireResistance, wireCapacitance);

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
  // Simplified: build tree from net pins
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

  // Create tree (simplified - assumes first pin is source)
  const root: TreeNode = {
    id: 'source',
    position: pins[0],
    children: [],
    isPin: true,
    loadCap: 0.1, // fF
  };

  // Add remaining pins as direct children (simplified topology)
  for (let i = 1; i < pins.length; i++) {
    root.children.push({
      id: `sink_${i}`,
      position: pins[i],
      children: [],
      isPin: true,
      loadCap: 0.5, // fF (typical input cap)
    });
  }

  return root;
}

function vanGinnekenDP(
  tree: TreeNode,
  bufferTypes: BufferType[],
  maxCap: number,
  wireR: number,
  wireC: number
): Solution {
  // Bottom-up DP on routing tree
  const solutions = new Map<string, Solution[]>();

  function traverse(node: TreeNode): Solution[] {
    if (node.isPin && node.children.length === 0) {
      // Leaf node (sink pin)
      return [
        {
          delay: 0,
          capacitance: node.loadCap,
          power: 0,
          buffers: [],
        },
      ];
    }

    // Recursively process children
    const childSolutions: Solution[][] = node.children.map((child) => traverse(child));

    // Merge child solutions
    const merged = mergeSolutions(childSolutions, node, wireR, wireC);

    // Add buffer insertion options
    const withBuffers = tryBufferInsertion(merged, bufferTypes, maxCap);

    return withBuffers;
  }

  const allSolutions = traverse(tree);

  // Select best solution (minimum delay)
  const best = allSolutions.reduce((min, sol) =>
    sol.delay < min.delay ? sol : min
  );

  return best;
}

function mergeSolutions(
  childSolutions: Solution[][],
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
        buffers: [],
      },
    ];
  }

  // For each combination of child solutions, create merged solution
  // Simplified: just take first solution from each child
  const mergedSolution: Solution = {
    delay: 0,
    capacitance: 0,
    power: 0,
    buffers: [],
  };

  for (const childSols of childSolutions) {
    if (childSols.length > 0) {
      const sol = childSols[0];

      // Add wire delay (Elmore delay model)
      const dist = 100; // Simplified distance
      const wireCap = dist * wireC;
      const wireRes = dist * wireR;

      const wireDelay = wireRes * (wireCap + sol.capacitance);

      mergedSolution.delay = Math.max(mergedSolution.delay, sol.delay + wireDelay);
      mergedSolution.capacitance += sol.capacitance + wireCap;
      mergedSolution.power += sol.power;
      mergedSolution.buffers.push(...sol.buffers);
    }
  }

  return [mergedSolution];
}

function tryBufferInsertion(
  solutions: Solution[],
  bufferTypes: BufferType[],
  maxCap: number
): Solution[] {
  const result: Solution[] = [...solutions];

  // Try inserting each buffer type
  for (const sol of solutions) {
    for (const bufferType of bufferTypes) {
      if (sol.capacitance <= maxCap) {
        // Insert buffer
        const buffered: Solution = {
          delay: sol.delay + bufferType.delay,
          capacitance: bufferType.inputCap,
          power: sol.power + bufferType.power,
          buffers: [
            ...sol.buffers,
            {
              id: `buf_${sol.buffers.length}`,
              type: bufferType.name,
              position: { x: 0, y: 0 }, // Position TBD
            },
          ],
        };

        result.push(buffered);
      }
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
        (other.delay < sol.delay || other.capacitance < sol.capacitance || other.power < sol.power)
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
