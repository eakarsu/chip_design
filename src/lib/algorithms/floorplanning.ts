import {
  FloorplanningParams,
  FloorplanningResult,
  FloorplanningAlgorithm,
  Cell,
} from '@/types/algorithms';
import { scaleAndCenterCells, validateAndFixCells } from './boundaryUtils';

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

    // New floorplanning algorithms - use sequence pair as approximation
    case 'b_star_tree':
    case 'o_tree':
    case 'corner_block_list':
    case 'tcg':
    case 'fixed_outline':
    case FloorplanningAlgorithm.B_STAR_TREE:
    case FloorplanningAlgorithm.CORNER_BLOCK_LIST:
    case FloorplanningAlgorithm.O_TREE:
    case FloorplanningAlgorithm.TCG:
    case FloorplanningAlgorithm.FIXED_OUTLINE:
      console.log(`${algorithm}: Using sequence pair approximation`);
      result = sequencePairFloorplanning(params);
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
