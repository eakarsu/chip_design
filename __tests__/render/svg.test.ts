/**
 * @jest-environment node
 */
import { renderPlacementSvg } from '@/lib/render/svg';
import type { Cell, Net } from '@/types/algorithms';

const mkCell = (id: string, x: number, y: number, type: 'standard' | 'io' = 'standard'): Cell => ({
  id, name: id, width: 20, height: 20, position: { x, y },
  pins: [{ id: `${id}_p`, name: 'A', position: { x: 0, y: 10 }, direction: 'input' }],
  type,
});

describe('SVG renderer', () => {
  test('renders a non-empty document with one rect per cell', () => {
    const cells = [mkCell('a', 0, 0), mkCell('b', 100, 0), mkCell('pad', 0, 100, 'io')];
    const svg = renderPlacementSvg(cells, undefined, 200, 200);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    // 3 cell rects + 1 background + 1 frame = 5 rects.
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(4);
    // Terminal/io cells get the orange fill.
    expect(svg).toContain('#f59e0b');
  });

  test('emits net lines when nets provided', () => {
    const cells = [mkCell('a', 0, 0), mkCell('b', 100, 0)];
    const nets: Net[] = [{ id: 'n', name: 'n', pins: ['a_p', 'b_p'], weight: 1 }];
    const svg = renderPlacementSvg(cells, nets, 200, 200);
    expect(svg).toMatch(/<line[^>]*x1=/);
  });

  test('respects showNets:false', () => {
    const cells = [mkCell('a', 0, 0), mkCell('b', 100, 0)];
    const nets: Net[] = [{ id: 'n', name: 'n', pins: ['a_p', 'b_p'], weight: 1 }];
    const svg = renderPlacementSvg(cells, nets, 200, 200, { showNets: false });
    expect(svg).not.toMatch(/<line/);
  });

  test('handles empty input', () => {
    const svg = renderPlacementSvg([], [], 100, 100);
    expect(svg).toContain('<svg');
    expect((svg.match(/<rect/g) ?? []).length).toBe(2); // background + frame
  });
});
