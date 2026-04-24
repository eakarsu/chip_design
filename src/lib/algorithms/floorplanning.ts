import {
  FloorplanningParams,
  FloorplanningResult,
  FloorplanningAlgorithm,
  Cell,
} from '@/types/algorithms';
import { scaleAndCenterCells, validateAndFixCells } from './boundaryUtils';
import { bStarTreeFloorplanning } from './b_star_tree';

/* ----------------------------------------------------------------------- */
/* Shared metrics                                                           */
/* ----------------------------------------------------------------------- */

function finishFloorplan(
  startTime: number,
  cells: Cell[],
  chipWidth: number,
  chipHeight: number,
  success = true,
): FloorplanningResult {
  const totalBlockArea = cells.reduce((s, c) => s + c.width * c.height, 0);
  const chipArea = chipWidth * chipHeight;
  return {
    success,
    blocks: cells,
    area: chipArea,
    aspectRatio: chipWidth / chipHeight,
    utilization: totalBlockArea / chipArea,
    deadSpace: chipArea - totalBlockArea,
    runtime: performance.now() - startTime,
  };
}

/* ----------------------------------------------------------------------- */
/* O-Tree: ordered-tree compaction (left-child = right neighbor, sibling = */
/* above). Produces compact packing by walking the tree and placing each   */
/* block directly right of its parent (or above its left sibling).         */
/* ----------------------------------------------------------------------- */

export function oTreeFloorplanning(params: FloorplanningParams): FloorplanningResult {
  const startTime = performance.now();
  const cells = JSON.parse(JSON.stringify(params.blocks)) as Cell[];
  // Interpret the list order as a DFS of an O-tree where the "skeleton" bit
  // (every other cell is a left child) gives a roughly-balanced structure.
  let cx = 0, cy = 0, rowMaxH = 0;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const leftChild = (i % 2 === 0);
    if (leftChild && cx + c.width > params.chipWidth) {
      // wrap right, start a new row above the current row top.
      cx = 0;
      cy += rowMaxH;
      rowMaxH = 0;
    }
    c.position = { x: cx, y: cy };
    cx += c.width;
    rowMaxH = Math.max(rowMaxH, c.height);
  }
  return finishFloorplan(startTime, cells, params.chipWidth, params.chipHeight);
}

/* ----------------------------------------------------------------------- */
/* Corner Block List (CBL) — Hong et al. 2000. Place each block into the   */
/* current top-right or bottom-right "empty corner" tracked in a stack,    */
/* picked by coin flip (here: index parity).                               */
/* ----------------------------------------------------------------------- */

export function cornerBlockListFloorplanning(params: FloorplanningParams): FloorplanningResult {
  const startTime = performance.now();
  const cells = JSON.parse(JSON.stringify(params.blocks)) as Cell[];
  const corners: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    // Pick corner: even → first (bottom-left), odd → last available (top).
    const cornerIdx = (i % 2 === 0) ? 0 : corners.length - 1;
    const anchor = corners[cornerIdx];
    c.position = { x: anchor.x, y: anchor.y };
    // Push two new corners (right and above).
    corners[cornerIdx] = { x: anchor.x + c.width, y: anchor.y };
    corners.push({ x: anchor.x, y: anchor.y + c.height });
  }
  return finishFloorplan(startTime, cells, params.chipWidth, params.chipHeight);
}

/* ----------------------------------------------------------------------- */
/* Transitive Closure Graph (TCG) — Lin & Chang 2001. Build horizontal     */
/* and vertical constraint DAGs, place each block at the longest path from */
/* the source. Here we approximate: sort by a "priority" signal (area),    */
/* and the two graphs are implicit in row/column assignment.               */
/* ----------------------------------------------------------------------- */

export function tcgFloorplanning(params: FloorplanningParams): FloorplanningResult {
  const startTime = performance.now();
  const cells = JSON.parse(JSON.stringify(params.blocks)) as Cell[];
  // Sort by area desc — big blocks get anchored first.
  const order = cells.map((c, i) => i).sort((a, b) =>
    cells[b].width * cells[b].height - cells[a].width * cells[a].height,
  );
  // Longest-path placement: maintain per-column skyline.
  const skyline: number[] = new Array(Math.ceil(params.chipWidth)).fill(0);
  for (const i of order) {
    const c = cells[i];
    // Find the x with minimum max-skyline in the block's width range.
    let bestX = 0, bestY = Number.POSITIVE_INFINITY;
    for (let x = 0; x + c.width <= params.chipWidth; x += 5) {
      let y = 0;
      for (let k = x; k < x + c.width; k++) y = Math.max(y, skyline[k] ?? 0);
      if (y < bestY) { bestY = y; bestX = x; }
    }
    c.position = { x: bestX, y: bestY };
    for (let k = bestX; k < bestX + c.width; k++) skyline[k] = bestY + c.height;
  }
  return finishFloorplan(startTime, cells, params.chipWidth, params.chipHeight);
}

/* ----------------------------------------------------------------------- */
/* Fixed-outline floorplanning — tries to fit all blocks into the fixed   */
/* chipWidth × chipHeight outline. Uses the TCG skyline packer and fails   */
/* (success=false) when any block would overflow the outline top.          */
/* ----------------------------------------------------------------------- */

export function fixedOutlineFloorplanning(params: FloorplanningParams): FloorplanningResult {
  const startTime = performance.now();
  const r = tcgFloorplanning(params);
  const maxY = r.blocks.reduce((m, c) => Math.max(m, (c.position?.y ?? 0) + c.height), 0);
  const fits = maxY <= params.chipHeight;
  return { ...r, success: fits, runtime: performance.now() - startTime };
}

// Slicing Tree Floorplanning
export function slicingTreeFloorplanning(
  params: FloorplanningParams
): FloorplanningResult {
  const startTime = performance.now();
  const { chipWidth, chipHeight, blocks, aspectRatioMin = 0.5, aspectRatioMax = 2.0 } = params;

  const cells = JSON.parse(JSON.stringify(blocks)) as Cell[];

  // Simple binary slicing algorithm
  function sliceCells(cellsToSlice: Cell[], horizontal: boolean, x: number, y: number, width: number, height: number) {
    if (cellsToSlice.length === 0) return;

    if (cellsToSlice.length === 1) {
      const cell = cellsToSlice[0];
      cell.position = { x, y };
      cell.width = Math.min(cell.width, width);
      cell.height = Math.min(cell.height, height);
      return;
    }

    const mid = Math.floor(cellsToSlice.length / 2);
    const leftCells = cellsToSlice.slice(0, mid);
    const rightCells = cellsToSlice.slice(mid);

    if (horizontal) {
      const splitY = y + height / 2;
      sliceCells(leftCells, !horizontal, x, y, width, height / 2);
      sliceCells(rightCells, !horizontal, x, splitY, width, height / 2);
    } else {
      const splitX = x + width / 2;
      sliceCells(leftCells, !horizontal, x, y, width / 2, height);
      sliceCells(rightCells, !horizontal, splitX, y, width / 2, height);
    }
  }

  sliceCells(cells, true, 0, 0, chipWidth, chipHeight);

  const totalBlockArea = cells.reduce((sum, cell) => sum + cell.width * cell.height, 0);
  const chipArea = chipWidth * chipHeight;
  const utilization = totalBlockArea / chipArea;
  const deadSpace = chipArea - totalBlockArea;
  const aspectRatio = chipWidth / chipHeight;

  const runtime = performance.now() - startTime;

  return {
    success: true,
    blocks: cells,
    area: chipArea,
    aspectRatio,
    utilization,
    deadSpace,
    runtime,
  };
}

// Sequence Pair Floorplanning
export function sequencePairFloorplanning(
  params: FloorplanningParams
): FloorplanningResult {
  const startTime = performance.now();
  const { chipWidth, chipHeight, blocks } = params;

  const cells = JSON.parse(JSON.stringify(blocks)) as Cell[];

  // Create initial sequence pair
  const positiveSeq = cells.map((_, i) => i);
  const negativeSeq = [...positiveSeq].sort(() => Math.random() - 0.5);

  // Compute coordinates from sequence pair
  cells.forEach((cell, i) => {
    const posIdx = positiveSeq.indexOf(i);
    const negIdx = negativeSeq.indexOf(i);

    // Simple coordinate assignment based on sequence
    cell.position = {
      x: (posIdx / cells.length) * chipWidth,
      y: (negIdx / cells.length) * chipHeight,
    };
  });

  const totalBlockArea = cells.reduce((sum, cell) => sum + cell.width * cell.height, 0);
  const chipArea = chipWidth * chipHeight;
  const utilization = totalBlockArea / chipArea;
  const deadSpace = chipArea - totalBlockArea;
  const aspectRatio = chipWidth / chipHeight;

  const runtime = performance.now() - startTime;

  return {
    success: true,
    blocks: cells,
    area: chipArea,
    aspectRatio,
    utilization,
    deadSpace,
    runtime,
  };
}

// Main floorplanning dispatcher
export function runFloorplanning(
  params: FloorplanningParams
): FloorplanningResult {
  let result: FloorplanningResult;

  // Handle string algorithm names (from UI) or enum values
  const algorithm = typeof params.algorithm === 'string'
    ? params.algorithm.toLowerCase()
    : params.algorithm;

  switch (algorithm) {
    case FloorplanningAlgorithm.SLICING_TREE:
    case 'slicing_tree':
      result = slicingTreeFloorplanning(params);
      break;
    case FloorplanningAlgorithm.SEQUENCE_PAIR:
    case 'sequence_pair':
      result = sequencePairFloorplanning(params);
      break;

    // B*-tree has its own implementation now.
    case 'b_star_tree':
    case FloorplanningAlgorithm.B_STAR_TREE:
      result = bStarTreeFloorplanning(params);
      break;

    case 'o_tree':
    case FloorplanningAlgorithm.O_TREE:
      result = oTreeFloorplanning(params);
      break;
    case 'corner_block_list':
    case FloorplanningAlgorithm.CORNER_BLOCK_LIST:
      result = cornerBlockListFloorplanning(params);
      break;
    case 'tcg':
    case FloorplanningAlgorithm.TCG:
      result = tcgFloorplanning(params);
      break;
    case 'fixed_outline':
    case FloorplanningAlgorithm.FIXED_OUTLINE:
      result = fixedOutlineFloorplanning(params);
      break;

    default:
      throw new Error(`Unsupported floorplanning algorithm: ${algorithm}`);
  }

  // Ensure all blocks fit within chip boundaries
  // Scale and center if necessary
  let fixedBlocks = result.blocks;

  // First try to validate
  const { cells: validatedCells, violations } = validateAndFixCells(
    fixedBlocks,
    params.chipWidth,
    params.chipHeight
  );

  // If there are violations, scale and center
  if (violations > 0) {
    console.log(`Floorplan exceeds boundaries (${violations} blocks). Scaling to fit...`);
    fixedBlocks = scaleAndCenterCells(validatedCells, params.chipWidth, params.chipHeight, 0.9);
  } else {
    fixedBlocks = validatedCells;
  }

  // Calculate corrected metrics
  const totalBlockArea = fixedBlocks.reduce((sum, b) => sum + b.width * b.height, 0);
  const chipArea = params.chipWidth * params.chipHeight;
  const utilization = (totalBlockArea / chipArea) * 100;

  return {
    ...result,
    blocks: fixedBlocks,
    area: chipArea,
    utilization,
    deadSpace: chipArea - totalBlockArea,
  };
}
