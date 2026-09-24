/**
 * Analytical Placement Algorithms
 *
 * References:
 * - "FastPlace: Efficient Analytical Placement using Cell Shifting, Iterative
 *   Local Refinement and a Hybrid Net Model" by Viswanathan & Chu (ISPD 2004)
 * - "RePlAce: Advancing Solution Quality and Routability Validation in Global Placement"
 *   by Cheng et al. (IEEE TCAD 2019)
 * - "DREAMPlace: Deep Learning Toolkit-Enabled GPU Acceleration for Modern VLSI Placement"
 *   by Lin et al. (DAC 2019)
 *
 * This implementation combines key ideas from these modern analytical placers:
 * - Quadratic wirelength optimization
 * - Density-driven cell spreading
 * - Hybrid net model (HPWL + quadratic)
 * - Iterative refinement
 */

import { Cell, Net, Point, PlacementResult } from '@/types/algorithms';

export interface AnalyticalPlacementParams {
  chipWidth: number;
  chipHeight: number;
  cells: Cell[];
  nets: Net[];
  targetDensity?: number;
  iterations?: number;
  lambda?: number; // Density penalty weight
}

export function analyticalPlacement(params: AnalyticalPlacementParams): PlacementResult {
  const startTime = performance.now();
  const {
    chipWidth,
    chipHeight,
    cells,
    nets,
    targetDensity = 0.7,
    iterations = 50,
    lambda = 0.5,
  } = params;

  if (cells.length === 0) {
    return {
      success: false,
      cells: [],
      totalWirelength: 0,
      overlap: 0,
      runtime: 0,
      iterations: 0,
    };
  }

  // Initialize cell positions (random or spread)
  let placedCells = initializePositions(cells, chipWidth, chipHeight);

  const convergenceData: number[] = [];

  // Main optimization loop
  for (let iter = 0; iter < iterations; iter++) {
    // Step 1: Global placement using quadratic optimization
    placedCells = globalPlacement(placedCells, nets, chipWidth, chipHeight);

    // Step 2: Legalization and spreading to reduce density
    placedCells = densityDrivenSpreading(placedCells, chipWidth, chipHeight, targetDensity, lambda);

    // Step 3: Local refinement
    if (iter % 10 === 0) {
      placedCells = localRefinement(placedCells, nets);
    }

    // Calculate metrics
    const wirelength = calculateHPWL(placedCells, nets);
    convergenceData.push(wirelength);

    // Check convergence
    if (convergenceData.length > 5) {
      const recent = convergenceData.slice(-5);
      // Guard the ratio: an already-zero wirelength would make `improvement`
      // NaN/Infinity and the comparison meaningless.
      if (recent[0] > 0) {
        const improvement = (recent[0] - recent[4]) / recent[0];
        if (improvement < 0.001) {
          break; // Converged
        }
      } else {
        break;
      }
    }
  }

  // Final metrics
  const totalWirelength = calculateHPWL(placedCells, nets);
  const overlap = calculateOverlap(placedCells);
  const runtime = performance.now() - startTime;

  return {
    success: true,
    cells: placedCells,
    totalWirelength,
    overlap,
    runtime,
    iterations: convergenceData.length,
    convergenceData,
  };
}

function initializePositions(cells: Cell[], chipWidth: number, chipHeight: number): Cell[] {
  // Spread cells uniformly across chip
  const cols = Math.ceil(Math.sqrt(cells.length));
  const rows = Math.ceil(cells.length / cols);

  const cellWidth = chipWidth / cols;
  const cellHeight = chipHeight / rows;

  return cells.map((cell, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);

    return {
      ...cell,
      position: {
        x: col * cellWidth + (cellWidth - cell.width) / 2,
        y: row * cellHeight + (cellHeight - cell.height) / 2,
      },
    };
  });
}

/**
 * Global Placement using Quadratic Wirelength Optimization
 * Minimizes: W = Σ (weighted quadratic wirelength of nets)
 *            + Σ anchor·||xi − centre||²
 *
 * The anchor term is what makes the linear system non-singular: without it
 * `Ax = 0` has only the trivial "every connected cell collapses to the same
 * point" solution, which is what this code used to converge to (bx/by stayed
 * zero and no fixed pad contributed to the right-hand side).
 */
function globalPlacement(
  cells: Cell[],
  nets: Net[],
  chipWidth: number,
  chipHeight: number
): Cell[] {
  // Build connectivity matrix (simplified)
  const n = cells.length;
  const A = Array(n)
    .fill(0)
    .map(() => Array(n).fill(0));
  const bx = Array(n).fill(0);
  const by = Array(n).fill(0);

  // For each net, add quadratic cost terms
  for (const net of nets) {
    const cellIds = net.pins.map((pinId) => {
      const idx = cells.findIndex((c) => c.pins.some((p) => p.id === pinId));
      return idx;
    }).filter((id) => id >= 0);

    if (cellIds.length < 2) continue;

    const weight = (net.weight ?? 1) / cellIds.length; // Star model

    // Add connection costs
    for (let i = 0; i < cellIds.length; i++) {
      for (let j = 0; j < cellIds.length; j++) {
        if (i !== j) {
          const ci = cellIds[i];
          const cj = cellIds[j];
          A[ci][ci] += weight;
          A[ci][cj] -= weight;
        }
      }
    }
  }

  // Anchor springs to the chip centre. They contribute to *both* the diagonal
  // and the right-hand side — a positive-definite diagonal makes the system
  // solvable and bounds cells that have no nets at all.
  const anchorW = 1e-3;
  const cx = chipWidth / 2;
  const cy = chipHeight / 2;
  for (let i = 0; i < n; i++) {
    A[i][i] += anchorW;
    bx[i] += anchorW * cx;
    by[i] += anchorW * cy;
  }

  // Solve linear system: Ax = bx, Ay = by
  // Simplified: use iterative method (Gauss-Seidel)
  const newPositions = cells.map((c) => ({ ...c.position! }));

  for (let iter = 0; iter < 10; iter++) {
    for (let i = 0; i < n; i++) {
      let sumX = bx[i];
      let sumY = by[i];

      for (let j = 0; j < n; j++) {
        if (j !== i) {
          sumX -= A[i][j] * newPositions[j].x;
          sumY -= A[i][j] * newPositions[j].y;
        }
      }

      if (A[i][i] !== 0) {
        newPositions[i].x = sumX / A[i][i];
        newPositions[i].y = sumY / A[i][i];
      }

      // Keep within bounds
      newPositions[i].x = Math.max(0, Math.min(chipWidth - cells[i].width, newPositions[i].x));
      newPositions[i].y = Math.max(0, Math.min(chipHeight - cells[i].height, newPositions[i].y));
    }
  }

  return cells.map((cell, idx) => ({
    ...cell,
    position: newPositions[idx],
  }));
}

/**
 * Density-Driven Spreading
 * Spreads cells to reduce overlap and meet target density
 */
function densityDrivenSpreading(
  cells: Cell[],
  chipWidth: number,
  chipHeight: number,
  targetDensity: number,
  lambda: number
): Cell[] {
  // Create density grid
  const gridSize = 50;
  const gridX = Math.ceil(chipWidth / gridSize);
  const gridY = Math.ceil(chipHeight / gridSize);

  const density = calculateDensityGrid(cells, gridX, gridY, gridSize);

  // Apply spreading forces to high-density regions
  return cells.map((cell) => {
    if (!cell.position) return cell;

    const gx = Math.floor(cell.position.x / gridSize);
    const gy = Math.floor(cell.position.y / gridSize);

    if (gx >= 0 && gx < gridX && gy >= 0 && gy < gridY) {
      const currentDensity = density[gy][gx];

      if (currentDensity > targetDensity) {
        // Repulsive force proportional to how far over target the bin is.
        const force = lambda * (currentDensity - targetDensity);

        // Push *down* the density gradient (towards the emptier neighbour).
        // Using a random direction here just diffused the cells; the whole
        // point of density-driven spreading is to move them away from the
        // congested bins.
        const left = gx > 0 ? density[gy][gx - 1] : Infinity;
        const right = gx < gridX - 1 ? density[gy][gx + 1] : Infinity;
        const down = gy > 0 ? density[gy - 1][gx] : Infinity;
        const up = gy < gridY - 1 ? density[gy + 1][gx] : Infinity;

        let dx = 0;
        let dy = 0;
        const minNeighbour = Math.min(left, right, down, up);
        if (minNeighbour < currentDensity) {
          if (minNeighbour === left) dx = -1;
          else if (minNeighbour === right) dx = 1;
          else if (minNeighbour === down) dy = -1;
          else dy = 1;
        }

        const step = force * gridSize;
        const newX = Math.max(0, Math.min(chipWidth - cell.width, cell.position.x + dx * step));
        const newY = Math.max(0, Math.min(chipHeight - cell.height, cell.position.y + dy * step));

        return {
          ...cell,
          position: { x: newX, y: newY },
        };
      }
    }

    return cell;
  });
}

function calculateDensityGrid(
  cells: Cell[],
  gridX: number,
  gridY: number,
  gridSize: number
): number[][] {
  const density = Array(gridY)
    .fill(0)
    .map(() => Array(gridX).fill(0));

  for (const cell of cells) {
    if (!cell.position) continue;

    // Smear the cell's area over every bin its footprint touches. Crediting
    // the whole area to the origin bin made a large cell look like a single
    // saturated bin plus completely empty neighbours.
    const x0 = Math.max(0, Math.floor(cell.position.x / gridSize));
    const y0 = Math.max(0, Math.floor(cell.position.y / gridSize));
    const x1 = Math.min(gridX - 1, Math.floor((cell.position.x + cell.width) / gridSize));
    const y1 = Math.min(gridY - 1, Math.floor((cell.position.y + cell.height) / gridSize));

    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const overlapX =
          Math.min(cell.position.x + cell.width, (gx + 1) * gridSize) -
          Math.max(cell.position.x, gx * gridSize);
        const overlapY =
          Math.min(cell.position.y + cell.height, (gy + 1) * gridSize) -
          Math.max(cell.position.y, gy * gridSize);
        const overlap = Math.max(0, overlapX) * Math.max(0, overlapY);
        density[gy][gx] += overlap / (gridSize * gridSize);
      }
    }
  }

  return density;
}

/**
 * Local Refinement
 * Fine-tune placement by small perturbations
 */
function localRefinement(cells: Cell[], nets: Net[]): Cell[] {
  // Deep-copy the positions too — a shallow `{ ...c }` still shares the
  // `position` object, so trial moves mutated the caller's cells in place.
  const refinedCells = cells.map((c) => ({
    ...c,
    position: c.position ? { ...c.position } : undefined,
  }));

  // Try small moves for each cell
  for (let i = 0; i < cells.length; i++) {
    const cell = refinedCells[i];
    if (!cell.position) continue;

    const originalPos = { ...cell.position };
    const originalWL = calculateHPWL(refinedCells, nets);

    // Try moves in 4 directions
    const moves = [
      { dx: 5, dy: 0 },
      { dx: -5, dy: 0 },
      { dx: 0, dy: 5 },
      { dx: 0, dy: -5 },
    ];

    let bestMove = { dx: 0, dy: 0 };
    let bestWL = originalWL;

    for (const move of moves) {
      cell.position.x = originalPos.x + move.dx;
      cell.position.y = originalPos.y + move.dy;

      const newWL = calculateHPWL(refinedCells, nets);

      if (newWL < bestWL) {
        bestWL = newWL;
        bestMove = move;
      }
    }

    // Apply best move
    cell.position.x = originalPos.x + bestMove.dx;
    cell.position.y = originalPos.y + bestMove.dy;
  }

  return refinedCells;
}

function calculateHPWL(cells: Cell[], nets: Net[]): number {
  let totalWL = 0;

  for (const net of nets) {
    const pinPositions: Point[] = [];

    for (const pinId of net.pins) {
      for (const cell of cells) {
        const pin = cell.pins.find((p) => p.id === pinId);
        if (pin && cell.position) {
          pinPositions.push({
            x: cell.position.x + pin.position.x,
            y: cell.position.y + pin.position.y,
          });
          break;
        }
      }
    }

    if (pinPositions.length > 0) {
      const minX = Math.min(...pinPositions.map((p) => p.x));
      const maxX = Math.max(...pinPositions.map((p) => p.x));
      const minY = Math.min(...pinPositions.map((p) => p.y));
      const maxY = Math.max(...pinPositions.map((p) => p.y));

      totalWL += (maxX - minX) + (maxY - minY);
    }
  }

  return totalWL;
}

function calculateOverlap(cells: Cell[]): number {
  let totalOverlap = 0;

  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const c1 = cells[i];
      const c2 = cells[j];

      if (!c1.position || !c2.position) continue;

      const overlapX = Math.max(
        0,
        Math.min(c1.position.x + c1.width, c2.position.x + c2.width) -
          Math.max(c1.position.x, c2.position.x)
      );

      const overlapY = Math.max(
        0,
        Math.min(c1.position.y + c1.height, c2.position.y + c2.height) -
          Math.max(c1.position.y, c2.position.y)
      );

      totalOverlap += overlapX * overlapY;
    }
  }

  return totalOverlap;
}
