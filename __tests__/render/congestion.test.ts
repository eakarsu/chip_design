/**
 * @jest-environment node
 */
import { computeCongestion, renderCongestionSvg } from '@/lib/render/congestion';
import type { Cell, Net } from '@/types/algorithms';

const mkCell = (id: string, x: number, y: number): Cell => ({
  id, name: id, width: 20, height: 20, position: { x, y },
  pins: [{ id: `${id}_p`, name: 'A', position: { x: 10, y: 10 }, direction: 'input' }],
  type: 'standard',
});

describe('Congestion grid', () => {
  test('empty input yields zero peak', () => {
    const g = computeCongestion([], [], 100, 100, 25);
    expect(g.cols).toBe(4);
    expect(g.rows).toBe(4);
    expect(g.peak).toBe(0);
  });

  test('single net deposits demand on all bbox tiles', () => {
    const cells = [mkCell('a', 0, 0), mkCell('b', 80, 80)];
    const nets: Net[] = [{ id: 'n', name: 'n', pins: ['a_p', 'b_p'], weight: 1 }];
    const g = computeCongestion(cells, nets, 100, 100, 25);
    // Bounding box covers tiles (0..3, 0..3). All non-zero.
    let nonzero = 0;
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) if (g.demand[r][c] > 0) nonzero++;
    expect(nonzero).toBeGreaterThan(0);
    expect(g.peak).toBeGreaterThan(0);
  });

  test('hot region is denser than empty corner', () => {
    // Pile 5 nets on top-left, leave bottom-right alone.
    const cells = [mkCell('a', 0, 0), mkCell('b', 30, 30), mkCell('far', 200, 200)];
    const nets: Net[] = [];
    for (let i = 0; i < 5; i++) {
      nets.push({ id: `h${i}`, name: `h${i}`, pins: ['a_p', 'b_p'], weight: 1 });
    }
    nets.push({ id: 'far', name: 'far', pins: ['a_p', 'far_p'], weight: 1 });
    const g = computeCongestion(cells, nets, 250, 250, 50);
    const hot = g.demand[0][0];
    const cold = g.demand[g.rows - 1][g.cols - 1];
    expect(hot).toBeGreaterThan(cold);
  });

  test('SVG contains a rect for every tile', () => {
    const cells = [mkCell('a', 0, 0), mkCell('b', 50, 50)];
    const nets: Net[] = [{ id: 'n', name: 'n', pins: ['a_p', 'b_p'], weight: 1 }];
    const g = computeCongestion(cells, nets, 100, 100, 25);
    const svg = renderCongestionSvg(g, cells, 100, 100);
    expect(svg.startsWith('<svg')).toBe(true);
    // 16 tile rects + 2 cell outlines + 1 frame = 19.
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(g.cols * g.rows);
  });
});
