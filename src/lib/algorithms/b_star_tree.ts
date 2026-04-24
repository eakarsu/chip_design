/**
 * B*-tree floorplanning (Chang et al. 2000).
 *
 * Each block becomes a node in a binary tree:
 *   - Left child of node v  ⇒ block placed immediately to the right of v
 *     at the same y as v.bottom.
 *   - Right child of node v ⇒ block placed above v, sharing v.left.
 *
 * To extract the (x, y) for each node we walk the tree DFS while
 * maintaining a *contour* — a piecewise-linear upper envelope of already-
 * placed blocks, indexed by x-interval. A new block placed at x finds its
 * y by querying the contour over [x, x+width]. The contour update is O(k)
 * where k is the number of intervals it covers.
 *
 * Producing the *initial* tree is a heuristic — we use a greedy left-skew
 * insertion (each new block becomes the left child of the previous one),
 * then run a few simulated-annealing perturbations (swap, rotate, move)
 * to lower the bounding-box area.
 */

import {
  FloorplanningParams,
  FloorplanningResult,
  Cell,
} from '@/types/algorithms';

interface BNode {
  block: Cell;
  rotated: boolean;
  left: BNode | null;
  right: BNode | null;
  parent: BNode | null;
  // Filled in by `pack()`:
  x: number;
  y: number;
}

interface ContourSegment {
  x1: number;
  x2: number;
  y: number;
  next: ContourSegment | null;
}

function blockDims(n: BNode): { w: number; h: number } {
  return n.rotated
    ? { w: n.block.height, h: n.block.width }
    : { w: n.block.width, h: n.block.height };
}

/* --------------------------------------------------------------------- */
/* Tree construction                                                       */
/* --------------------------------------------------------------------- */

function buildLeftSkewTree(blocks: Cell[]): BNode {
  // Sort by area descending — bigger blocks placed first reduces dead space.
  const sorted = [...blocks].sort((a, b) => b.width * b.height - a.width * a.height);
  const nodes = sorted.map(b => ({
    block: b, rotated: false, left: null, right: null, parent: null,
    x: 0, y: 0,
  } as BNode));
  for (let i = 0; i + 1 < nodes.length; i++) {
    nodes[i].left = nodes[i + 1];
    nodes[i + 1].parent = nodes[i];
  }
  return nodes[0];
}

/* --------------------------------------------------------------------- */
/* Pack (DFS + contour)                                                    */
/* --------------------------------------------------------------------- */

function newContour(): ContourSegment {
  // Sentinel covers the whole positive x-axis at y=0.
  return { x1: 0, x2: Number.POSITIVE_INFINITY, y: 0, next: null };
}

function contourMaxY(head: ContourSegment, x1: number, x2: number): number {
  let max = 0;
  let cur: ContourSegment | null = head;
  while (cur && cur.x1 < x2) {
    if (cur.x2 > x1) {
      if (cur.y > max) max = cur.y;
    }
    cur = cur.next;
  }
  return max;
}

function contourUpdate(head: ContourSegment, x1: number, x2: number, y: number): void {
  // Replace any segments inside [x1, x2] with a single segment of height y.
  // Caller passes a sentinel head, so we mutate the linked list in place.
  let prev: ContourSegment = head;
  while (prev.next && prev.next.x2 <= x1) prev = prev.next;
  // From `prev.next` onward, segments may overlap [x1, x2].
  let cur = prev.next;
  while (cur && cur.x1 < x2) {
    if (cur.x1 < x1 && cur.x2 > x1) {
      // Split: keep left part.
      prev = cur;
      cur = { x1, x2: cur.x2, y: cur.y, next: cur.next };
      prev.x2 = x1;
      prev.next = cur;
    }
    if (cur.x2 > x2) {
      // Truncate the right side and stop.
      cur.x1 = x2;
      break;
    }
    // Fully consumed — remove.
    prev.next = cur.next;
    cur = cur.next;
  }
  // Insert new segment after prev.
  const seg: ContourSegment = { x1, x2, y, next: prev.next };
  prev.next = seg;
}

function pack(root: BNode): { width: number; height: number } {
  const head = newContour();
  let maxX = 0, maxY = 0;

  function walk(n: BNode, x: number) {
    const { w, h } = blockDims(n);
    n.x = x;
    n.y = contourMaxY(head, x, x + w);
    contourUpdate(head, x, x + w, n.y + h);
    if (x + w > maxX) maxX = x + w;
    if (n.y + h > maxY) maxY = n.y + h;
    if (n.left)  walk(n.left,  x + w);    // right of n
    if (n.right) walk(n.right, x);        // above n, same left x
  }
  walk(root, 0);
  return { width: maxX, height: maxY };
}

/* --------------------------------------------------------------------- */
/* SA perturbation                                                         */
/* --------------------------------------------------------------------- */

function flatten(root: BNode): BNode[] {
  const out: BNode[] = [];
  function walk(n: BNode | null) {
    if (!n) return;
    out.push(n);
    walk(n.left);
    walk(n.right);
  }
  walk(root);
  return out;
}

function swapBlocks(a: BNode, b: BNode): void {
  const tmp = a.block; a.block = b.block; b.block = tmp;
  const tr = a.rotated; a.rotated = b.rotated; b.rotated = tr;
}

function rotate(n: BNode): void { n.rotated = !n.rotated; }

/* --------------------------------------------------------------------- */
/* Public entry                                                            */
/* --------------------------------------------------------------------- */

export function bStarTreeFloorplanning(params: FloorplanningParams): FloorplanningResult {
  const start = performance.now();
  const root = buildLeftSkewTree(params.blocks);
  const nodes = flatten(root);

  // Cost = bounding-box area + penalty when any side overflows the chip.
  const cost = (dims: { width: number; height: number }) => {
    const w = dims.width;
    const h = dims.height;
    const area = w * h;
    const overW = Math.max(0, w - params.chipWidth);
    const overH = Math.max(0, h - params.chipHeight);
    return area + 1000 * (overW + overH);
  };

  let best = pack(root);
  let bestCost = cost(best);
  let curCost = bestCost;

  let T = bestCost * 0.1 + 1;
  const cooling = 0.9;
  const itersPerT = Math.max(20, nodes.length);

  for (let t = 0; t < 30; t++) {
    for (let i = 0; i < itersPerT; i++) {
      // Pick a perturbation: 0 = swap two nodes, 1 = rotate, 2 = re-skew.
      const op = Math.floor(Math.random() * 3);
      const a = nodes[Math.floor(Math.random() * nodes.length)];
      let undo: () => void;
      if (op === 0) {
        const b = nodes[Math.floor(Math.random() * nodes.length)];
        swapBlocks(a, b);
        undo = () => swapBlocks(a, b);
      } else if (op === 1) {
        rotate(a);
        undo = () => rotate(a);
      } else {
        // Move: detach a's left subtree to be its right subtree (and vice-versa).
        const tmp = a.left; a.left = a.right; a.right = tmp;
        undo = () => { const t2 = a.left; a.left = a.right; a.right = t2; };
      }
      const dims = pack(root);
      const c = cost(dims);
      const dc = c - curCost;
      if (dc < 0 || Math.random() < Math.exp(-dc / T)) {
        curCost = c;
        if (c < bestCost) { bestCost = c; best = dims; }
      } else {
        undo();
      }
    }
    T *= cooling;
  }

  // Final pack to make sure positions on `nodes` correspond to the kept tree.
  const finalDims = pack(root);
  const placedBlocks: Cell[] = nodes.map(n => ({
    ...n.block,
    position: { x: n.x, y: n.y },
    width: n.rotated ? n.block.height : n.block.width,
    height: n.rotated ? n.block.width : n.block.height,
  }));

  const totalBlockArea = placedBlocks.reduce((s, b) => s + b.width * b.height, 0);
  const bbox = finalDims.width * finalDims.height;
  return {
    success: true,
    blocks: placedBlocks,
    area: bbox,
    aspectRatio: finalDims.width / Math.max(1, finalDims.height),
    utilization: totalBlockArea / Math.max(1, bbox),
    deadSpace: bbox - totalBlockArea,
    runtime: performance.now() - start,
  };
}
