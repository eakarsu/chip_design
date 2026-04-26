import { parseCtsReport, analyseCts, layoutCtsTree } from '@/lib/tools/cts';

const SAMPLE = `
Number of Sinks   = 4
Number of Buffers = 2
Max Skew  = 0.150 ns
Avg Skew  = 0.072 ns
Wire length = 1.234 mm

root:   clk_root x=400 y=400
buffer: BUF_0 parent=clk_root x=300 y=300 delay=0.10
buffer: BUF_1 parent=clk_root x=500 y=300 delay=0.12
sink:   reg0/CK parent=BUF_0 x=290 y=200
sink:   reg1/CK parent=BUF_0 x=310 y=200
sink:   reg2/CK parent=BUF_1 x=490 y=200
sink:   reg3/CK parent=BUF_1 x=510 y=200 latency=0.50
`;

describe('parseCtsReport', () => {
  it('parses summary metrics', () => {
    const r = parseCtsReport(SAMPLE);
    expect(r.summary.numSinks).toBe(4);
    expect(r.summary.numBuffers).toBe(2);
    expect(r.summary.maxSkew).toBeCloseTo(0.150, 3);
    expect(r.summary.wirelength).toBeCloseTo(1.234, 3);
  });

  it('parses nodes and links them', () => {
    const r = parseCtsReport(SAMPLE);
    expect(r.nodes).toHaveLength(7);
    const root = r.nodes.find(n => n.kind === 'root');
    expect(root?.x).toBe(400);
    const sink = r.nodes.find(n => n.id === 'reg3/CK');
    expect(sink?.parent).toBe('BUF_1');
    expect(sink?.latency).toBeCloseTo(0.5, 3);
  });

  it('warns on missing parents', () => {
    const r = parseCtsReport(`buffer: A parent=ghost x=0 y=0 delay=0.1`);
    expect(r.warnings.some(w => /missing parent/.test(w))).toBe(true);
  });

  it('converts ps to ns for skew', () => {
    const r = parseCtsReport(`Max Skew = 50 ps`);
    expect(r.summary.maxSkew).toBeCloseTo(0.050, 3);
  });
});

describe('analyseCts', () => {
  it('computes latency from buffer delays when not given', () => {
    const r = parseCtsReport(SAMPLE);
    const a = analyseCts(r);
    expect(a.latencyBySink.get('reg0/CK')).toBeCloseTo(0.10, 3);
    expect(a.latencyBySink.get('reg2/CK')).toBeCloseTo(0.12, 3);
    // reg3/CK has explicit latency=0.50, should be preserved.
    expect(a.latencyBySink.get('reg3/CK')).toBeCloseTo(0.50, 3);
    expect(a.computedSkew).toBeCloseTo(0.40, 3);
  });
});

describe('layoutCtsTree', () => {
  it('places every node and centres each parent over its children', () => {
    const r = parseCtsReport(SAMPLE);
    const pos = layoutCtsTree(r, { width: 800, depthSpacing: 50 });
    expect(pos.size).toBe(7);
    const root = pos.get('clk_root')!;
    const buf0 = pos.get('BUF_0')!;
    const buf1 = pos.get('BUF_1')!;
    expect(root.x).toBeCloseTo((buf0.x + buf1.x) / 2, 3);
  });
});
