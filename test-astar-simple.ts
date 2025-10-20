// Simplified A* test to debug the issue
class PriorityQueue<T> {
  private items: { element: T; priority: number }[] = [];

  enqueue(element: T, priority: number) {
    this.items.push({ element, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }

  dequeue(): T | undefined {
    return this.items.shift()?.element;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}

function manhattanDistance(p1: {x: number, y: number}, p2: {x: number, y: number}): number {
  return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
}

const gridSize = 20;
const layers = 2;

// Simple 20x20x2 grid
const grid: boolean[][][] = [];
for (let l = 0; l < layers; l++) {
  grid[l] = [];
  for (let y = 0; y < gridSize; y++) {
    grid[l][y] = [];
    for (let x = 0; x < gridSize; x++) {
      grid[l][y][x] = false; // false = not occupied
    }
  }
}

const source = { x: 1, y: 1 };
const target = { x: 5, y: 5 };

console.log(`Routing from (${source.x}, ${source.y}) to (${target.x}, ${target.y})`);

const openSet = new PriorityQueue<{ x: number; y: number; layer: number }>();
const closedSet = new Set<string>();
const gScore = new Map<string, number>();
const fScore = new Map<string, number>();
const cameFrom = new Map<string, { x: number; y: number; layer: number }>();

const startKey = `${source.x},${source.y},0`;
gScore.set(startKey, 0);
fScore.set(startKey, manhattanDistance(source, target));
openSet.enqueue({ x: source.x, y: source.y, layer: 0 }, fScore.get(startKey)!);

let iterations = 0;
let found = false;

while (!openSet.isEmpty() && iterations < 1000) {
  iterations++;
  const current = openSet.dequeue()!;
  const currentKey = `${current.x},${current.y},${current.layer}`;

  if (closedSet.has(currentKey)) continue;
  closedSet.add(currentKey);

  if (iterations <= 5) {
    console.log(`Iteration ${iterations}: current = (${current.x}, ${current.y}, L${current.layer}), key = "${currentKey}"`);
    console.log(`  gScore.get("${currentKey}") = ${gScore.get(currentKey)}`);
  }

  if (current.x === target.x && current.y === target.y) {
    found = true;
    console.log(`Found target in ${iterations} iterations!`);
    break;
  }

  const directions = [
    { dx: 1, dy: 0, dl: 0 },
    { dx: -1, dy: 0, dl: 0 },
    { dx: 0, dy: 1, dl: 0 },
    { dx: 0, dy: -1, dl: 0 },
  ];

  for (const dir of directions) {
    const nx = current.x + dir.dx;
    const ny = current.y + dir.dy;
    const nl = current.layer + dir.dl;

    if (iterations === 1) {
      console.log(`  Checking neighbor (${nx}, ${ny}, L${nl})`);
      console.log(`    nx >= 0: ${nx >= 0}, ny >= 0: ${ny >= 0}`);
      console.log(`    nl >= 0: ${nl >= 0}, nl < layers: ${nl < layers}`);
      console.log(`    grid[${nl}] exists: ${!!grid[nl]}`);
      if (grid[nl]) {
        console.log(`    ny < grid[nl].length: ${ny} < ${grid[nl].length} = ${ny < grid[nl].length}`);
        console.log(`    grid[${nl}][${ny}] exists: ${!!grid[nl][ny]}`);
        if (grid[nl][ny]) {
          console.log(`    nx < grid[nl][ny].length: ${nx} < ${grid[nl][ny].length} = ${nx < grid[nl][ny].length}`);
          console.log(`    !grid[nl][ny][nx]: ${!grid[nl][ny][nx]}`);
        }
      }
    }

    if (
      nx >= 0 && ny >= 0 &&
      nl >= 0 && nl < layers &&
      grid[nl] && ny < grid[nl].length &&
      grid[nl][ny] && nx < grid[nl][ny].length &&
      !grid[nl][ny][nx]
    ) {
      const neighborKey = `${nx},${ny},${nl}`;
      const currentGScore = gScore.get(currentKey);
      const tentativeGScore = (currentGScore !== undefined ? currentGScore : Infinity) + 1;

      if (iterations === 1) {
        console.log(`    Passed bounds check! currentKey="${currentKey}", currentGScore=${currentGScore}`);
        console.log(`    tentativeGScore: ${tentativeGScore}, existing: ${gScore.get(neighborKey) || Infinity}`);
      }

      if (tentativeGScore < (gScore.get(neighborKey) || Infinity)) {
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeGScore);
        const heuristic = manhattanDistance({ x: nx, y: ny }, target);
        fScore.set(neighborKey, tentativeGScore + heuristic);
        openSet.enqueue({ x: nx, y: ny, layer: nl }, fScore.get(neighborKey)!);
        if (iterations === 1) {
          console.log(`    Added! fScore: ${fScore.get(neighborKey)}`);
        }
      }
    }
  }
  if (iterations === 1) {
    console.log(`End of iteration 1, openSet.isEmpty(): ${openSet.isEmpty()}`);
  }
}

console.log(`Total iterations: ${iterations}`);
console.log(`Found: ${found}`);
console.log(`Closed set size: ${closedSet.size}`);
