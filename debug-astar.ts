import { Cell } from './src/types/algorithms';

const gridSize = 5;
const chipWidth = 100;
const chipHeight = 100;

const cells: Cell[] = [{
  id: 'cell_0',
  name: 'Cell 0',
  width: 10,
  height: 10,
  pins: [
    { id: 'cell_0_1', name: 'Y', position: { x: 5, y: 5 }, direction: 'output' as const },
  ],
  type: 'standard' as const,
  position: { x: 0, y: 0 },
}, {
  id: 'cell_1',
  name: 'Cell 1',
  width: 10,
  height: 10,
  pins: [
    { id: 'cell_1_0', name: 'A', position: { x: 5, y: 5 }, direction: 'input' as const },
  ],
  type: 'standard' as const,
  position: { x: 20, y: 20 },
}];

const net = {
  id: 'net_0',
  name: 'Net 0',
  pins: ['cell_0_1', 'cell_1_0'],
  weight: 1.0,
};

console.log('Grid size:', gridSize);
console.log('Chip dimensions:', chipWidth, 'x', chipHeight);
console.log('Grid dimensions:', Math.ceil(chipWidth / gridSize), 'x', Math.ceil(chipHeight / gridSize));
console.log('');

for (const pinId of net.pins) {
  for (const cell of cells) {
    const pin = cell.pins.find((p) => p.id === pinId);
    if (pin && cell.position) {
      const gridX = Math.floor((cell.position.x + pin.position.x) / gridSize);
      const gridY = Math.floor((cell.position.y + pin.position.y) / gridSize);
      console.log(`Pin ${pinId}: cell position (${cell.position.x}, ${cell.position.y}), pin offset (${pin.position.x}, ${pin.position.y})`);
      console.log(`  -> grid position (${gridX}, ${gridY})`);
    }
  }
}
