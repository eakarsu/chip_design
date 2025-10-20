import { runRL } from './src/lib/algorithms';
import { RLAlgorithm, Cell } from './src/types/algorithms';

const rlCells: Cell[] = Array.from({ length: 2 }, (_, i) => ({
  id: `cell_${i}`,
  name: `Cell ${i}`,
  width: 10,
  height: 10,
  pins: [
    { id: `cell_${i}_0`, name: 'A', position: { x: 5, y: 5 }, direction: 'input' as const },
    { id: `cell_${i}_1`, name: 'Y', position: { x: 5, y: 5 }, direction: 'output' as const },
  ],
  type: 'standard' as const,
}));

const rlNets = [{
  id: 'net_0',
  name: 'Net 0',
  pins: ['cell_0_1', 'cell_1_0'],
  weight: 1.0,
}];

console.log('Testing PPO...');
try {
  const result = runRL({
    algorithm: RLAlgorithm.PPO_FLOORPLANNING,
    cells: rlCells,
    nets: rlNets,
    chipWidth: 50,
    chipHeight: 50,
    episodes: 1,
    learningRate: 0.001,
    discountFactor: 0.9,
    epsilon: 0.2
  });
  console.log('Success:', result.success);
} catch (error) {
  console.error('Error:', error);
  if (error instanceof Error) {
    console.error('Stack:', error.stack);
  }
}
