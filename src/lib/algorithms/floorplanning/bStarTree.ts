/**
 * B*-Tree Floorplanning Algorithm
 *
 * Reference: "B*-Trees: A New Representation for Non-Slicing Floorplans"
 * By Y.-C. Chang, Y.-W. Chang, G.-M. Wu, and S.-W. Wu (DAC 2000)
 *
 * B*-Tree is one of the most efficient representations for non-slicing floorplans.
 * It uses a binary tree structure where:
 * - Each node represents a block
 * - Left child: horizontally adjacent block (right side)
 * - Right child: vertically adjacent block (above)
 */

import { Cell, Point, FloorplanningResult } from '@/types/algorithms';

interface BStarNode {
  block: Cell;
  left: BStarNode | null;
  right: BStarNode | null;
  x: number;
  y: number;
}

export interface BStarTreeParams {
  chipWidth: number;
  chipHeight: number;
  blocks: Cell[];
  iterations?: number;
  temperature?: number;
  coolingRate?: number;
}

export function bStarTreeFloorplanning(params: BStarTreeParams): FloorplanningResult {
  const startTime = performance.now();
  const {
    chipWidth,
    chipHeight,
    blocks,
    iterations = 1000,
    temperature: initialTemp = 100,
    coolingRate = 0.95,
  } = params;

  if (blocks.length === 0) {
    return {
      success: false,
      blocks: [],
      area: 0,
      aspectRatio: 1,
      utilization: 0,
      deadSpace: 0,
      runtime: performance.now() - startTime,
    };
  }

  // Initialize B*-Tree with random sequence
  let currentTree = buildRandomBStarTree(blocks);
  let currentSolution = packBStarTree(currentTree);
  let currentCost = calculateCost(currentSolution, chipWidth, chipHeight);

  let bestTree = currentTree;
  let bestSolution = currentSolution;
  let bestCost = currentCost;

  let temperature = initialTemp;

  // Simulated Annealing optimization
  for (let iter = 0; iter < iterations; iter++) {
    // Generate neighbor solution
    const neighborTree = perturbBStarTree(currentTree);
    const neighborSolution = packBStarTree(neighborTree);
    const neighborCost = calculateCost(neighborSolution, chipWidth, chipHeight);

    // Accept or reject
    const delta = neighborCost - currentCost;
    if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
      currentTree = neighborTree;
      currentSolution = neighborSolution;
      currentCost = neighborCost;

      if (currentCost < bestCost) {
        bestTree = currentTree;
        bestSolution = currentSolution;
        bestCost = currentCost;
      }
    }

    temperature *= coolingRate;
  }

  // Final packing
  const packedBlocks = bestSolution.blocks;
  const boundingBox = calculateBoundingBox(packedBlocks);

  const totalBlockArea = blocks.reduce((sum, b) => sum + b.width * b.height, 0);
  const chipArea = boundingBox.width * boundingBox.height;
  const utilization = (totalBlockArea / chipArea) * 100;
  const aspectRatio = boundingBox.width / boundingBox.height;
  const deadSpace = chipArea - totalBlockArea;

  const runtime = performance.now() - startTime;

  return {
    success: true,
    blocks: packedBlocks,
    area: chipArea,
    aspectRatio,
    utilization,
    deadSpace,
    runtime,
  };
}

function buildRandomBStarTree(blocks: Cell[]): BStarNode {
  if (blocks.length === 0) {
    throw new Error('No blocks provided');
  }

  // Shuffle blocks
  const shuffled = [...blocks].sort(() => Math.random() - 0.5);

  // Build tree using pre-order insertion
  const root: BStarNode = {
    block: shuffled[0],
    left: null,
    right: null,
    x: 0,
    y: 0,
  };

  for (let i = 1; i < shuffled.length; i++) {
    insertNode(root, shuffled[i]);
  }

  return root;
}

function insertNode(root: BStarNode, block: Cell): void {
  // Random insertion: choose left or right child
  if (Math.random() < 0.5) {
    if (root.left === null) {
      root.left = {
        block,
        left: null,
        right: null,
        x: 0,
        y: 0,
      };
    } else {
      insertNode(root.left, block);
    }
  } else {
    if (root.right === null) {
      root.right = {
        block,
        left: null,
        right: null,
        x: 0,
        y: 0,
      };
    } else {
      insertNode(root.right, block);
    }
  }
}

function packBStarTree(root: BStarNode): { blocks: Cell[]; width: number; height: number } {
  const packedBlocks: Cell[] = [];

  // Traverse tree and calculate positions
  function traverse(node: BStarNode | null, parentX: number, parentY: number, isLeft: boolean): void {
    if (!node) return;

    if (isLeft) {
      // Left child: place to the right of parent
      node.x = parentX + node.block.width;
      node.y = parentY;
    } else {
      // Right child: place above parent
      node.x = parentX;
      node.y = parentY + node.block.height;
    }

    // Create positioned block
    const positionedBlock: Cell = {
      ...node.block,
      position: { x: node.x, y: node.y },
    };

    packedBlocks.push(positionedBlock);

    // Traverse children
    traverse(node.left, node.x, node.y, true);
    traverse(node.right, node.x, node.y, false);
  }

  // Root placement
  root.x = 0;
  root.y = 0;
  const rootBlock: Cell = {
    ...root.block,
    position: { x: 0, y: 0 },
  };
  packedBlocks.push(rootBlock);

  traverse(root.left, root.x, root.y, true);
  traverse(root.right, root.x, root.y, false);

  const bbox = calculateBoundingBox(packedBlocks);

  return {
    blocks: packedBlocks,
    width: bbox.width,
    height: bbox.height,
  };
}

function perturbBStarTree(tree: BStarNode): BStarNode {
  // Clone tree
  const clonedTree = cloneTree(tree);

  // Ensure we have a valid tree
  if (!clonedTree) return tree;

  // Apply random perturbation
  const perturbationType = Math.floor(Math.random() * 3);

  switch (perturbationType) {
    case 0:
      // Swap two nodes
      swapNodes(clonedTree);
      break;
    case 1:
      // Rotate a block
      rotateRandomBlock(clonedTree);
      break;
    case 2:
      // Move a subtree
      moveSubtree(clonedTree);
      break;
  }

  return clonedTree;
}

function cloneTree(node: BStarNode | null): BStarNode | null {
  if (!node) return null;

  return {
    block: { ...node.block },
    left: cloneTree(node.left),
    right: cloneTree(node.right),
    x: node.x,
    y: node.y,
  };
}

function swapNodes(root: BStarNode): void {
  const nodes = collectNodes(root);
  if (nodes.length < 2) return;

  const idx1 = Math.floor(Math.random() * nodes.length);
  let idx2 = Math.floor(Math.random() * nodes.length);
  while (idx2 === idx1) {
    idx2 = Math.floor(Math.random() * nodes.length);
  }

  // Swap blocks
  const temp = nodes[idx1].block;
  nodes[idx1].block = nodes[idx2].block;
  nodes[idx2].block = temp;
}

function rotateRandomBlock(root: BStarNode): void {
  const nodes = collectNodes(root);
  if (nodes.length === 0) return;

  const idx = Math.floor(Math.random() * nodes.length);
  const node = nodes[idx];

  // Rotate block (swap width and height)
  const temp = node.block.width;
  node.block.width = node.block.height;
  node.block.height = temp;
}

function moveSubtree(root: BStarNode): void {
  // Simplified: just swap two subtrees
  const nodes = collectNodes(root);
  if (nodes.length < 2) return;

  const idx = Math.floor(Math.random() * nodes.length);
  const node = nodes[idx];

  // Swap left and right children
  const temp = node.left;
  node.left = node.right;
  node.right = temp;
}

function collectNodes(node: BStarNode | null, nodes: BStarNode[] = []): BStarNode[] {
  if (!node) return nodes;

  nodes.push(node);
  collectNodes(node.left, nodes);
  collectNodes(node.right, nodes);

  return nodes;
}

function calculateCost(
  solution: { blocks: Cell[]; width: number; height: number },
  chipWidth: number,
  chipHeight: number
): number {
  const { blocks, width, height } = solution;

  // Cost = area + penalty for exceeding chip bounds + overlap penalty
  const area = width * height;
  const widthPenalty = Math.max(0, width - chipWidth) * 10000;
  const heightPenalty = Math.max(0, height - chipHeight) * 10000;
  const overlapPenalty = calculateOverlapPenalty(blocks) * 1000;

  return area + widthPenalty + heightPenalty + overlapPenalty;
}

function calculateOverlapPenalty(blocks: Cell[]): number {
  let totalOverlap = 0;

  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const b1 = blocks[i];
      const b2 = blocks[j];

      if (!b1.position || !b2.position) continue;

      const overlapX = Math.max(
        0,
        Math.min(b1.position.x + b1.width, b2.position.x + b2.width) -
          Math.max(b1.position.x, b2.position.x)
      );

      const overlapY = Math.max(
        0,
        Math.min(b1.position.y + b1.height, b2.position.y + b2.height) -
          Math.max(b1.position.y, b2.position.y)
      );

      totalOverlap += overlapX * overlapY;
    }
  }

  return totalOverlap;
}

function calculateBoundingBox(blocks: Cell[]): {
  width: number;
  height: number;
} {
  let maxX = 0;
  let maxY = 0;

  for (const block of blocks) {
    if (block.position) {
      maxX = Math.max(maxX, block.position.x + block.width);
      maxY = Math.max(maxY, block.position.y + block.height);
    }
  }

  return { width: maxX, height: maxY };
}
