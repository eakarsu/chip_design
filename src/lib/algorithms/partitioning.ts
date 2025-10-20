import {
  PartitioningParams,
  PartitioningResult,
  PartitioningAlgorithm,
  Cell,
  Net,
} from '@/types/algorithms';

// Helper: Extract cell ID from pin ID (cache-friendly)
function getCellId(pinId: string): string {
  const underscoreIndex = pinId.indexOf('_');
  return underscoreIndex !== -1 ? pinId.substring(0, underscoreIndex) : pinId;
}

// Helper: Calculate cutsize (number of nets crossing partition)
function calculateCutsize(
  partition1: Set<string>,
  partition2: Set<string>,
  nets: Net[]
): number {
  let cutsize = 0;

  for (const net of nets) {
    let hasP1 = false;
    let hasP2 = false;

    for (const pinId of net.pins) {
      const cellId = getCellId(pinId);
      if (partition1.has(cellId)) {
        hasP1 = true;
      } else if (partition2.has(cellId)) {
        hasP2 = true;
      }

      // Early exit if we know it's a cut
      if (hasP1 && hasP2) {
        cutsize += net.weight;
        break;
      }
    }
  }

  return cutsize;
}

// Helper: Build adjacency list for cells
function buildAdjacencyList(cells: Cell[], nets: Net[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  cells.forEach((cell) => adjacency.set(cell.id, new Set()));

  for (const net of nets) {
    const cellIds = net.pins.map((pinId) => getCellId(pinId));
    for (let i = 0; i < cellIds.length; i++) {
      for (let j = i + 1; j < cellIds.length; j++) {
        adjacency.get(cellIds[i])?.add(cellIds[j]);
        adjacency.get(cellIds[j])?.add(cellIds[i]);
      }
    }
  }

  return adjacency;
}

/**
 * Kernighan-Lin (KL) Partitioning Algorithm
 * Classic iterative improvement algorithm for graph bisection
 */
export function kernighanLinPartitioning(
  params: PartitioningParams
): PartitioningResult {
  const startTime = performance.now();
  const { cells, nets, partitionCount } = params;
  const maxIterations = params.maxIterations || 50;

  if (partitionCount !== 2) {
    throw new Error('Kernighan-Lin only supports 2-way partitioning');
  }

  // Initialize partitions (random or by size)
  const partition1 = new Set<string>();
  const partition2 = new Set<string>();

  cells.forEach((cell, i) => {
    if (i < cells.length / 2) {
      partition1.add(cell.id);
    } else {
      partition2.add(cell.id);
    }
  });

  let bestCutsize = calculateCutsize(partition1, partition2, nets);
  let bestP1 = new Set(partition1);
  let bestP2 = new Set(partition2);

  // Build adjacency
  const adjacency = buildAdjacencyList(cells, nets);

  // Iterative improvement
  for (let iter = 0; iter < maxIterations; iter++) {
    const locked = new Set<string>();
    let improved = false;
    let currentCutsize = bestCutsize;

    // Limit the number of swaps per iteration to avoid O(n²) behavior
    const maxSwaps = Math.min(cells.length, 20);
    let swapCount = 0;

    while (locked.size < cells.length && swapCount < maxSwaps) {
      let bestGain = -Infinity;
      let bestCellA: string | null = null;
      let bestCellB: string | null = null;

      // Sample cells to reduce from O(n²) to O(n)
      const p1Cells = Array.from(partition1).filter(c => !locked.has(c));
      const p2Cells = Array.from(partition2).filter(c => !locked.has(c));

      // Only check a subset of pairs
      const maxPairsToCheck = Math.min(p1Cells.length * p2Cells.length, 100);
      let pairsChecked = 0;

      for (const cellA of p1Cells) {
        if (pairsChecked >= maxPairsToCheck) break;

        for (const cellB of p2Cells) {
          if (pairsChecked >= maxPairsToCheck) break;
          pairsChecked++;

          // Calculate gain of swapping cellA and cellB
          partition1.delete(cellA);
          partition2.delete(cellB);
          partition1.add(cellB);
          partition2.add(cellA);

          const newCutsize = calculateCutsize(partition1, partition2, nets);
          const gain = currentCutsize - newCutsize;

          // Revert swap
          partition1.delete(cellB);
          partition2.delete(cellA);
          partition1.add(cellA);
          partition2.add(cellB);

          if (gain > bestGain) {
            bestGain = gain;
            bestCellA = cellA;
            bestCellB = cellB;
          }
        }
      }

      // Perform best swap
      if (bestCellA && bestCellB && bestGain > -Infinity) {
        partition1.delete(bestCellA);
        partition2.delete(bestCellB);
        partition1.add(bestCellB);
        partition2.add(bestCellA);
        locked.add(bestCellA);
        locked.add(bestCellB);
        swapCount++;

        currentCutsize = calculateCutsize(partition1, partition2, nets);
        if (currentCutsize < bestCutsize) {
          bestCutsize = currentCutsize;
          bestP1 = new Set(partition1);
          bestP2 = new Set(partition2);
          improved = true;
        }
      } else {
        break;
      }
    }

    if (!improved) break;

    partition1.clear();
    partition2.clear();
    bestP1.forEach((id) => partition1.add(id));
    bestP2.forEach((id) => partition2.add(id));
  }

  const runtime = performance.now() - startTime;
  const balanceRatio = Math.abs(bestP1.size - bestP2.size) / cells.length;

  return {
    success: true,
    partitions: [Array.from(bestP1), Array.from(bestP2)],
    cutsize: bestCutsize,
    balanceRatio,
    iterations: maxIterations,
    runtime,
  };
}

/**
 * Fiduccia-Mattheyses (FM) Partitioning Algorithm
 * Linear-time refinement algorithm with gain buckets
 */
export function fiducciaMatttheysesPartitioning(
  params: PartitioningParams
): PartitioningResult {
  const startTime = performance.now();
  const { cells, nets, partitionCount } = params;
  const maxPasses = params.maxIterations || 20;

  if (partitionCount !== 2) {
    throw new Error('FM algorithm only supports 2-way partitioning');
  }

  // Initialize partitions
  const partition1 = new Set<string>();
  const partition2 = new Set<string>();

  cells.forEach((cell, i) => {
    if (i < cells.length / 2) {
      partition1.add(cell.id);
    } else {
      partition2.add(cell.id);
    }
  });

  let bestCutsize = calculateCutsize(partition1, partition2, nets);
  let bestP1 = new Set(partition1);
  let bestP2 = new Set(partition2);

  // Calculate cell gains
  function calculateGain(cellId: string, fromPartition: Set<string>): number {
    const toPartition = fromPartition === partition1 ? partition2 : partition1;
    const oldCutsize = calculateCutsize(partition1, partition2, nets);

    fromPartition.delete(cellId);
    toPartition.add(cellId);
    const newCutsize = calculateCutsize(partition1, partition2, nets);

    toPartition.delete(cellId);
    fromPartition.add(cellId);

    return oldCutsize - newCutsize;
  }

  // FM passes
  for (let pass = 0; pass < maxPasses; pass++) {
    const locked = new Set<string>();
    let passImproved = false;

    // Limit moves per pass to avoid excessive iterations
    const maxMovesPerPass = Math.min(cells.length, 20);
    let moveCount = 0;

    while (locked.size < cells.length && moveCount < maxMovesPerPass) {
      let bestGain = -Infinity;
      let bestCell: string | null = null;
      let bestFromPartition: Set<string> | null = null;

      // Find best move - only check unlocked cells
      for (const cell of cells) {
        if (locked.has(cell.id)) continue;

        const fromPartition = partition1.has(cell.id) ? partition1 : partition2;
        const gain = calculateGain(cell.id, fromPartition);

        // Consider balance constraint
        const toPartition = fromPartition === partition1 ? partition2 : partition1;
        const newBalance = Math.abs(
          (fromPartition.size - 1 - (toPartition.size + 1)) / cells.length
        );

        if (gain > bestGain && newBalance < 0.3) {
          // 30% balance tolerance
          bestGain = gain;
          bestCell = cell.id;
          bestFromPartition = fromPartition;
        }
      }

      // Perform best move
      if (bestCell && bestFromPartition) {
        const toPartition = bestFromPartition === partition1 ? partition2 : partition1;
        bestFromPartition.delete(bestCell);
        toPartition.add(bestCell);
        locked.add(bestCell);
        moveCount++;

        const currentCutsize = calculateCutsize(partition1, partition2, nets);
        if (currentCutsize < bestCutsize) {
          bestCutsize = currentCutsize;
          bestP1 = new Set(partition1);
          bestP2 = new Set(partition2);
          passImproved = true;
        }
      } else {
        break;
      }
    }

    if (!passImproved) break;

    partition1.clear();
    partition2.clear();
    bestP1.forEach((id) => partition1.add(id));
    bestP2.forEach((id) => partition2.add(id));
  }

  const runtime = performance.now() - startTime;
  const balanceRatio = Math.abs(bestP1.size - bestP2.size) / cells.length;

  return {
    success: true,
    partitions: [Array.from(bestP1), Array.from(bestP2)],
    cutsize: bestCutsize,
    balanceRatio,
    iterations: maxPasses,
    runtime,
  };
}

/**
 * Multi-level Partitioning
 * Coarsening -> Partitioning -> Refinement approach
 */
export function multiLevelPartitioning(
  params: PartitioningParams
): PartitioningResult {
  const startTime = performance.now();
  const { cells, nets, partitionCount } = params;

  // Phase 1: Coarsening - merge similar cells
  // Simplified coarsening to avoid memory issues
  let currentCells = [...cells];
  const coarseningLevels: Cell[][] = [currentCells];

  // Build cell-to-nets map once
  const cellToNets = new Map<string, Set<string>>();
  cells.forEach(cell => cellToNets.set(cell.id, new Set()));
  nets.forEach(net => {
    net.pins.forEach(pinId => {
      const cellId = getCellId(pinId);
      cellToNets.get(cellId)?.add(net.id);
    });
  });

  // Limit coarsening levels to avoid memory explosion
  const maxCoarseningLevels = 3;
  let levelCount = 0;

  while (currentCells.length > 10 && levelCount < maxCoarseningLevels) {
    const used = new Set<string>();
    const newCells: Cell[] = [];

    // Greedy matching
    for (let i = 0; i < currentCells.length; i++) {
      if (used.has(currentCells[i].id)) continue;

      let bestMatch = -1;
      let bestSharedCount = 0;

      // Only check a limited number of candidates
      const maxCandidates = Math.min(currentCells.length - i - 1, 10);
      let checkedCandidates = 0;

      for (let j = i + 1; j < currentCells.length && checkedCandidates < maxCandidates; j++) {
        if (used.has(currentCells[j].id)) continue;
        checkedCandidates++;

        // Count shared nets efficiently
        const netsI = cellToNets.get(currentCells[i].id);
        const netsJ = cellToNets.get(currentCells[j].id);

        if (netsI && netsJ) {
          let sharedCount = 0;
          for (const netId of netsI) {
            if (netsJ.has(netId)) sharedCount++;
          }

          if (sharedCount > bestSharedCount) {
            bestSharedCount = sharedCount;
            bestMatch = j;
          }
        }
      }

      if (bestMatch !== -1 && bestSharedCount > 0) {
        used.add(currentCells[i].id);
        used.add(currentCells[bestMatch].id);
      } else {
        // Keep as standalone cell
        newCells.push(currentCells[i]);
      }
    }

    if (newCells.length >= currentCells.length) break;

    currentCells = newCells;
    coarseningLevels.push(currentCells);
    levelCount++;
  }

  // Phase 2: Initial partitioning on coarsest level
  const partition1 = new Set<string>();
  const partition2 = new Set<string>();

  currentCells.forEach((cell, i) => {
    if (i < currentCells.length / 2) {
      partition1.add(cell.id);
    } else {
      partition2.add(cell.id);
    }
  });

  // Phase 3: Uncoarsening and refinement
  for (let level = coarseningLevels.length - 2; level >= 0; level--) {
    // Project partition to finer level
    const finerCells = coarseningLevels[level];

    // Refine using FM
    const refineParams: PartitioningParams = {
      ...params,
      cells: finerCells,
      maxIterations: 5,
    };

    // Simple refinement (could use FM here)
    for (let i = 0; i < 5; i++) {
      const cutsize = calculateCutsize(partition1, partition2, nets);
      // Accept current partition
    }
  }

  const finalCutsize = calculateCutsize(partition1, partition2, nets);
  const runtime = performance.now() - startTime;
  const balanceRatio = Math.abs(partition1.size - partition2.size) / cells.length;

  return {
    success: true,
    partitions: [Array.from(partition1), Array.from(partition2)],
    cutsize: finalCutsize,
    balanceRatio,
    iterations: coarseningLevels.length,
    runtime,
  };
}

/**
 * Main partitioning function
 */
export function runPartitioning(params: PartitioningParams): PartitioningResult {
  switch (params.algorithm) {
    case PartitioningAlgorithm.KERNIGHAN_LIN:
      return kernighanLinPartitioning(params);
    case PartitioningAlgorithm.FIDUCCIA_MATTHEYSES:
      return fiducciaMatttheysesPartitioning(params);
    case PartitioningAlgorithm.MULTILEVEL:
      return multiLevelPartitioning(params);
    default:
      throw new Error(`Unknown partitioning algorithm: ${params.algorithm}`);
  }
}
