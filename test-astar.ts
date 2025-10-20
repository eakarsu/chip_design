import { runRouting } from './src/lib/algorithms';
import { RoutingAlgorithm, Cell } from './src/types/algorithms';

const cells: Cell[] = Array.from({ length: 5 }, (_, i) => ({
  id: `cell_${i}`,
  name: `Cell ${i}`,
  width: 10,
  height: 10,
  pins: [
    { id: `cell_${i}_0`, name: 'A', position: { x: 5, y: 5 }, direction: 'input' as const },
    { id: `cell_${i}_1`, name: 'Y', position: { x: 5, y: 5 }, direction: 'output' as const },
  ],
  type: 'standard' as const,
  position: { x: i * 20, y: i * 20 },
}));

const nets = Array.from({ length: 4 }, (_, i) => ({
  id: `net_${i}`,
  name: `Net ${i}`,
  pins: [`cell_${i}_1`, `cell_${(i + 1) % 5}_0`],
  weight: 1.0,
}));

console.log('Cells:', cells.map(c => ({ id: c.id, pins: c.pins.map(p => p.id), position: c.position })));
console.log('Nets:', nets);

const result = runRouting({
  algorithm: RoutingAlgorithm.A_STAR,
  chipWidth: 100,
  chipHeight: 100,
  cells,
  nets,
  layers: 3,
  gridSize: 5
});

console.log(JSON.stringify(result, null, 2));
