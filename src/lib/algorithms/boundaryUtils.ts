/**
 * Boundary Constraint Utilities
 *
 * Ensures all algorithm results stay within chip boundaries
 * Provides clipping, normalization, and validation functions
 */

import { Cell, Point, Wire } from '@/types/algorithms';

/**
 * Clips a cell position to stay within chip boundaries
 */
export function clipCellToBoundary(
  cell: Cell,
  chipWidth: number,
  chipHeight: number
): Cell {
  if (!cell.position) {
    return cell;
  }

  const clippedCell = { ...cell };

  clippedCell.position = {
    x: Math.max(0, Math.min(chipWidth - cell.width, cell.position.x)),
    y: Math.max(0, Math.min(chipHeight - cell.height, cell.position.y)),
  };

  return clippedCell;
}

/**
 * Clips all cells in array to boundaries
 */
export function clipCellsToBoundary(
  cells: Cell[],
  chipWidth: number,
  chipHeight: number
): Cell[] {
  return cells.map(cell => clipCellToBoundary(cell, chipWidth, chipHeight));
}

/**
 * Clips a point to chip boundaries
 */
export function clipPointToBoundary(
  point: Point,
  chipWidth: number,
  chipHeight: number
): Point {
  return {
    x: Math.max(0, Math.min(chipWidth, point.x)),
    y: Math.max(0, Math.min(chipHeight, point.y)),
  };
}

/**
 * Clips wire points to boundaries
 */
export function clipWireToBoundary(
  wire: Wire,
  chipWidth: number,
  chipHeight: number
): Wire {
  return {
    ...wire,
    points: wire.points.map(p => clipPointToBoundary(p, chipWidth, chipHeight)),
  };
}

/**
 * Clips all wires to boundaries
 */
export function clipWiresToBoundary(
  wires: Wire[],
  chipWidth: number,
  chipHeight: number
): Wire[] {
  return wires.map(wire => clipWireToBoundary(wire, chipWidth, chipHeight));
}

/**
 * Checks if a cell exceeds boundaries
 */
export function isCellOutOfBounds(
  cell: Cell,
  chipWidth: number,
  chipHeight: number
): boolean {
  if (!cell.position) return false;

  return (
    cell.position.x < 0 ||
    cell.position.y < 0 ||
    cell.position.x + cell.width > chipWidth ||
    cell.position.y + cell.height > chipHeight
  );
}

/**
 * Checks if a point exceeds boundaries
 */
export function isPointOutOfBounds(
  point: Point,
  chipWidth: number,
  chipHeight: number
): boolean {
  return (
    point.x < 0 ||
    point.y < 0 ||
    point.x > chipWidth ||
    point.y > chipHeight
  );
}

/**
 * Counts how many cells are out of bounds
 */
export function countOutOfBoundsCells(
  cells: Cell[],
  chipWidth: number,
  chipHeight: number
): number {
  return cells.filter(cell => isCellOutOfBounds(cell, chipWidth, chipHeight)).length;
}

/**
 * Normalizes cell positions to fit within boundaries
 * Scales if necessary to fit all cells
 */
export function normalizeCellsToBoundary(
  cells: Cell[],
  chipWidth: number,
  chipHeight: number,
  padding: number = 0
): Cell[] {
  if (cells.length === 0) return cells;

  // Find current bounding box
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  cells.forEach(cell => {
    if (cell.position) {
      minX = Math.min(minX, cell.position.x);
      maxX = Math.max(maxX, cell.position.x + cell.width);
      minY = Math.min(minY, cell.position.y);
      maxY = Math.max(maxY, cell.position.y + cell.height);
    }
  });

  const currentWidth = maxX - minX;
  const currentHeight = maxY - minY;

  // Calculate scale factor
  const availableWidth = chipWidth - 2 * padding;
  const availableHeight = chipHeight - 2 * padding;
  const scaleX = currentWidth > availableWidth ? availableWidth / currentWidth : 1;
  const scaleY = currentHeight > availableHeight ? availableHeight / currentHeight : 1;
  const scale = Math.min(scaleX, scaleY);

  // Apply scaling and translation
  return cells.map(cell => {
    if (!cell.position) return cell;

    return {
      ...cell,
      position: {
        x: padding + (cell.position.x - minX) * scale,
        y: padding + (cell.position.y - minY) * scale,
      },
    };
  });
}

/**
 * Scales and centers cells within boundaries
 */
export function scaleAndCenterCells(
  cells: Cell[],
  chipWidth: number,
  chipHeight: number,
  targetUtilization: number = 0.8
): Cell[] {
  if (cells.length === 0) return cells;

  // Calculate total cell area
  const totalCellArea = cells.reduce((sum, cell) => sum + cell.width * cell.height, 0);
  const chipArea = chipWidth * chipHeight;
  const currentUtilization = totalCellArea / chipArea;

  // If utilization is too high, we need to warn but still fit
  if (currentUtilization > targetUtilization) {
    console.warn(`Cell utilization ${(currentUtilization * 100).toFixed(1)}% exceeds target ${(targetUtilization * 100).toFixed(1)}%`);
  }

  // Normalize to fit within boundaries
  return normalizeCellsToBoundary(cells, chipWidth, chipHeight, 10);
}

/**
 * Validates and fixes cell positions
 */
export function validateAndFixCells(
  cells: Cell[],
  chipWidth: number,
  chipHeight: number
): { cells: Cell[]; violations: number; fixed: boolean } {
  const violations = countOutOfBoundsCells(cells, chipWidth, chipHeight);

  if (violations === 0) {
    return { cells, violations: 0, fixed: false };
  }

  // Fix violations by clipping
  const fixedCells = clipCellsToBoundary(cells, chipWidth, chipHeight);

  return {
    cells: fixedCells,
    violations,
    fixed: true,
  };
}

/**
 * Creates a safe random position within boundaries
 */
export function getRandomPositionInBounds(
  cellWidth: number,
  cellHeight: number,
  chipWidth: number,
  chipHeight: number
): Point {
  const maxX = Math.max(0, chipWidth - cellWidth);
  const maxY = Math.max(0, chipHeight - cellHeight);

  return {
    x: Math.random() * maxX,
    y: Math.random() * maxY,
  };
}

/**
 * Ensures cell movement stays within bounds
 */
export function constrainMovement(
  currentPos: Point,
  delta: Point,
  cellWidth: number,
  cellHeight: number,
  chipWidth: number,
  chipHeight: number
): Point {
  const newX = currentPos.x + delta.x;
  const newY = currentPos.y + delta.y;

  return {
    x: Math.max(0, Math.min(chipWidth - cellWidth, newX)),
    y: Math.max(0, Math.min(chipHeight - cellHeight, newY)),
  };
}

/**
 * Gets boundary violation statistics
 */
export function getBoundaryStats(
  cells: Cell[],
  chipWidth: number,
  chipHeight: number
): {
  totalCells: number;
  outOfBounds: number;
  percentageViolation: number;
  maxXExceed: number;
  maxYExceed: number;
} {
  let outOfBounds = 0;
  let maxXExceed = 0;
  let maxYExceed = 0;

  cells.forEach(cell => {
    if (!cell.position) return;

    if (isCellOutOfBounds(cell, chipWidth, chipHeight)) {
      outOfBounds++;

      const xExceed = Math.max(0, (cell.position.x + cell.width) - chipWidth);
      const yExceed = Math.max(0, (cell.position.y + cell.height) - chipHeight);

      maxXExceed = Math.max(maxXExceed, xExceed);
      maxYExceed = Math.max(maxYExceed, yExceed);
    }
  });

  return {
    totalCells: cells.length,
    outOfBounds,
    percentageViolation: cells.length > 0 ? (outOfBounds / cells.length) * 100 : 0,
    maxXExceed,
    maxYExceed,
  };
}

/**
 * Auto-fixes all boundary violations in algorithm result
 */
export function autoFixBoundaryViolations(
  cells: Cell[],
  wires: Wire[],
  chipWidth: number,
  chipHeight: number
): { cells: Cell[]; wires: Wire[]; hadViolations: boolean } {
  const cellStats = getBoundaryStats(cells, chipWidth, chipHeight);
  const hadViolations = cellStats.outOfBounds > 0;

  if (hadViolations) {
    console.log(`Found ${cellStats.outOfBounds} cells out of bounds (${cellStats.percentageViolation.toFixed(1)}%). Auto-fixing...`);
  }

  // Fix cells
  const fixedCells = clipCellsToBoundary(cells, chipWidth, chipHeight);

  // Fix wires
  const fixedWires = clipWiresToBoundary(wires, chipWidth, chipHeight);

  return {
    cells: fixedCells,
    wires: fixedWires,
    hadViolations,
  };
}
