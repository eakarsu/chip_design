/**
 * @jest-environment node
 */
import { solveIRDrop } from '@/lib/algorithms/ir_drop';

describe('IR-drop solver', () => {
  test('zero load → uniform VDD everywhere', () => {
    const r = solveIRDrop({
      cols: 5, rows: 5, edgeR: 0.1, vdd: 1.0,
      pads: [{ row: 0, col: 0 }],
    });
    for (let rr = 0; rr < 5; rr++) {
      for (let cc = 0; cc < 5; cc++) {
        expect(Math.abs(r.voltage[rr][cc] - 1.0)).toBeLessThan(1e-6);
      }
    }
    expect(r.worstDrop).toBeLessThan(1e-6);
  });

  test('pads stay at VDD even with load', () => {
    const cols = 4, rows = 4;
    const loadI = Array.from({ length: rows }, () => new Array(cols).fill(0.001));
    const pads = [{ row: 0, col: 0 }];
    const r = solveIRDrop({ cols, rows, edgeR: 0.1, vdd: 1.0, loadI, pads });
    expect(r.voltage[0][0]).toBeCloseTo(1.0, 9);
  });

  test('drop increases with distance from pad', () => {
    const cols = 8, rows = 8;
    const loadI = Array.from({ length: rows }, () => new Array(cols).fill(0.0005));
    const r = solveIRDrop({
      cols, rows, edgeR: 0.05, vdd: 1.0, loadI,
      pads: [{ row: 0, col: 0 }],
    });
    // Tile far from pad has more drop than tile near pad.
    expect(r.drop[7][7]).toBeGreaterThan(r.drop[1][1]);
  });

  test('more pads reduce worst drop', () => {
    const cols = 8, rows = 8;
    const loadI = Array.from({ length: rows }, () => new Array(cols).fill(0.0005));
    const onePad = solveIRDrop({
      cols, rows, edgeR: 0.05, vdd: 1.0, loadI,
      pads: [{ row: 0, col: 0 }],
    });
    const fourPads = solveIRDrop({
      cols, rows, edgeR: 0.05, vdd: 1.0, loadI,
      pads: [
        { row: 0, col: 0 }, { row: 0, col: 7 },
        { row: 7, col: 0 }, { row: 7, col: 7 },
      ],
    });
    expect(fourPads.worstDrop).toBeLessThan(onePad.worstDrop);
  });

  test('rejects zero/negative inputs', () => {
    expect(() => solveIRDrop({ cols: 0, rows: 4, edgeR: 1, vdd: 1, pads: [{ row: 0, col: 0 }] })).toThrow();
    expect(() => solveIRDrop({ cols: 4, rows: 4, edgeR: 0, vdd: 1, pads: [{ row: 0, col: 0 }] })).toThrow();
    expect(() => solveIRDrop({ cols: 4, rows: 4, edgeR: 1, vdd: 1, pads: [] })).toThrow();
  });
});
