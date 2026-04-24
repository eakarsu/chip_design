/**
 * @jest-environment node
 */
import {
  runScanChainInsertion,
  runAtpgBasic,
  runDft,
} from '@/lib/algorithms/dft';
import { Cell } from '@/types/algorithms';

function makeFFs(n: number): Cell[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `ff${i}`,
    name: `DFF_${i}`,
    width: 10,
    height: 10,
    position: { x: (i * 17) % 200, y: Math.floor(i / 12) * 20 },
    pins: [
      { id: `ff${i}_d`, name: 'D', position: { x: 0, y: 5 }, direction: 'input' },
      { id: `ff${i}_q`, name: 'Q', position: { x: 10, y: 5 }, direction: 'output' },
    ],
    type: 'standard',
  }));
}

describe('DFT — scan chain insertion', () => {
  test('produces non-empty chain covering all FFs', () => {
    const cells = makeFFs(20);
    const r = runScanChainInsertion({ algorithm: 'scan_chain_insertion', cells });
    expect(r.success).toBe(true);
    expect(r.ffCount).toBe(20);
    const flat = r.chains.flat();
    expect(flat.length).toBe(20);
    // No duplicates
    expect(new Set(flat).size).toBe(20);
  });

  test('respects maxChainLength to produce multiple chains', () => {
    const cells = makeFFs(20);
    const r = runScanChainInsertion({
      algorithm: 'scan_chain_insertion',
      cells,
      maxChainLength: 5,
    });
    expect(r.chains.length).toBeGreaterThanOrEqual(4);
    for (const chain of r.chains) {
      expect(chain.length).toBeLessThanOrEqual(5);
    }
  });

  test('reports a non-negative wirelength', () => {
    const cells = makeFFs(10);
    const r = runScanChainInsertion({ algorithm: 'scan_chain_insertion', cells });
    expect(r.chainWirelength).toBeGreaterThanOrEqual(0);
  });
});

describe('DFT — basic ATPG', () => {
  test('coverage between 0 and 1 with reproducible seed', () => {
    const cells = makeFFs(15);
    const r1 = runAtpgBasic({ algorithm: 'atpg_basic', cells, seed: 42 });
    const r2 = runAtpgBasic({ algorithm: 'atpg_basic', cells, seed: 42 });
    expect(r1.coverage).toBeGreaterThanOrEqual(0);
    expect(r1.coverage).toBeLessThanOrEqual(1);
    expect(r1.coverage).toBe(r2.coverage);
    expect(r1.faultsTotal).toBe(r2.faultsTotal);
  });

  test('returns the requested number of patterns', () => {
    const cells = makeFFs(8);
    const r = runAtpgBasic({
      algorithm: 'atpg_basic',
      cells,
      patternCount: 32,
      seed: 1,
    });
    expect(r.patterns.length).toBe(32);
  });

  test('handles empty input gracefully', () => {
    const r = runAtpgBasic({ algorithm: 'atpg_basic', cells: [] });
    expect(r.success).toBe(true);
    expect(r.faultsTotal).toBe(0);
    expect(r.coverage).toBe(0);
  });
});

describe('DFT — dispatcher', () => {
  test('routes by algorithm field', () => {
    const cells = makeFFs(5);
    const scan = runDft({ algorithm: 'scan_chain_insertion', cells });
    const atpg = runDft({ algorithm: 'atpg_basic', cells, seed: 1 });
    expect('chains' in scan).toBe(true);
    expect('coverage' in atpg).toBe(true);
  });
});
