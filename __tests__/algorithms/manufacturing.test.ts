import {
  couplingCapacitanceAnalysis,
  crosstalkAnalysis,
  noiseAnalysis,
  irDropAnalysis,
  opcAnalysis,
  phaseShiftMaskingAnalysis,
  srafAnalysis,
  densityBalancingAnalysis,
  dummyFillAnalysis,
  cmpAwareRoutingAnalysis,
  runSignalIntegrity,
  runLithography,
  runCMP,
  runIRDrop,
} from '@/lib/algorithms/manufacturing';
import { DRCLVSAlgorithm, Cell, Wire } from '@/types/algorithms';

const mkCell = (id: string, x: number, y: number, w = 10, h = 10): Cell => ({
  id, name: id, width: w, height: h,
  position: { x, y }, pins: [], type: 'standard',
});

const mkWire = (id: string, net: string, pts: [number, number][], layer = 1, width = 0.1): Wire => ({
  id, netId: net, layer, width,
  points: pts.map(([x, y]) => ({ x, y })),
});

describe('Manufacturing — Signal Integrity', () => {
  it('flags coupling between two parallel wires on the same layer', () => {
    const wires = [
      mkWire('w1', 'A', [[0, 0], [100, 0]]),
      mkWire('w2', 'B', [[0, 0.01], [100, 0.01]]), // very close parallel
    ];
    const res = couplingCapacitanceAnalysis({
      algorithm: DRCLVSAlgorithm.DESIGN_RULE_CHECK,
      cells: [], wires,
    });
    expect(res.violations.length).toBeGreaterThan(0);
    expect(res.violations[0].rule).toBe('HIGH_COUPLING_CAPACITANCE');
  });

  it('does not flag well-spaced wires', () => {
    const wires = [
      mkWire('w1', 'A', [[0, 0], [100, 0]]),
      mkWire('w2', 'B', [[0, 50], [100, 50]]),
    ];
    const res = couplingCapacitanceAnalysis({
      algorithm: DRCLVSAlgorithm.DESIGN_RULE_CHECK,
      cells: [], wires,
    });
    expect(res.violations).toEqual([]);
  });

  it('crosstalk violations scale with coupling ratio', () => {
    const wires = [
      mkWire('victim', 'V', [[0, 0], [20, 0]]),
      mkWire('aggr', 'A', [[0, 0.005], [20, 0.005]]),
    ];
    const res = crosstalkAnalysis({
      algorithm: DRCLVSAlgorithm.DESIGN_RULE_CHECK, cells: [], wires,
    });
    const xt = res.violations.find(v => v.rule === 'CROSSTALK_NOISE');
    expect(xt).toBeDefined();
  });

  it('noise analysis combines crosstalk with unterminated-net check', () => {
    const cells = [mkCell('c1', 0, 0)];
    cells[0].pins = [{ id: 'orphan_net', name: 'A', position: { x: 0, y: 0 }, direction: 'input' }];
    const res = noiseAnalysis({
      algorithm: DRCLVSAlgorithm.DESIGN_RULE_CHECK, cells, wires: [],
    });
    expect(res.violations.some(v => v.rule === 'UNTERMINATED_NET')).toBe(true);
  });

  it('dispatcher routes crosstalk_analysis correctly', () => {
    const res = runSignalIntegrity({
      algorithm: 'crosstalk_analysis' as any,
      cells: [], wires: [mkWire('a', 'A', [[0,0],[10,0]]), mkWire('b', 'B', [[0,0.01],[10,0.01]])],
    });
    expect(res).toHaveProperty('violations');
  });
});

describe('Manufacturing — IR Drop', () => {
  it('flags high-current interior cells with excessive drop', () => {
    // Big chip (5000×5000 µm) with a hungry cell in the middle. With a
    // realistic sheet resistance and 5%-VDD budget, this interior cell
    // exceeds the allowed drop because the effective current-feed path
    // length is ~2000 µm.
    const cells = [
      mkCell('nw', 0, 0, 1, 1),
      mkCell('ne', 4999, 0, 1, 1),
      mkCell('sw', 0, 4999, 1, 1),
      mkCell('se', 4999, 4999, 1, 1),
      mkCell('pwr', 2000, 2000, 100, 100),
    ];
    const res = irDropAnalysis({
      algorithm: DRCLVSAlgorithm.DESIGN_RULE_CHECK, cells, wires: [],
    });
    expect(res.violations.some(v => v.rule === 'IR_DROP_BUDGET_EXCEEDED' &&
      v.affectedObjects.includes('pwr'))).toBe(true);
  });

  it('runIRDrop dispatcher returns DRCLVSResult shape', () => {
    const res = runIRDrop({
      algorithm: DRCLVSAlgorithm.DESIGN_RULE_CHECK,
      cells: [mkCell('c', 0, 0)], wires: [],
    });
    expect(res).toHaveProperty('runtime');
    expect(res).toHaveProperty('violations');
  });
});

describe('Manufacturing — Lithography', () => {
  it('OPC flags every cell corner as serif-required', () => {
    const res = opcAnalysis({
      algorithm: DRCLVSAlgorithm.DESIGN_RULE_CHECK,
      cells: [mkCell('c1', 0, 0)], wires: [],
    });
    // 4 corners per cell.
    const serifs = res.violations.filter(v => v.rule === 'OPC_SERIF_REQUIRED');
    expect(serifs).toHaveLength(4);
  });

  it('OPC errors for features below the correctable limit', () => {
    const res = opcAnalysis({
      algorithm: DRCLVSAlgorithm.DESIGN_RULE_CHECK,
      cells: [mkCell('tiny', 0, 0, 0.01, 0.01)], wires: [],
    });
    expect(res.violations.some(v => v.rule === 'OPC_FEATURE_TOO_SMALL' && v.severity === 'error')).toBe(true);
  });

  it('PSM flags tight pitches below the 143 nm critical', () => {
    const wires = [
      mkWire('w1', 'A', [[0,0],[10,0]], 1, 0.04),
      mkWire('w2', 'B', [[0,0.05],[10,0.05]], 1, 0.04),
    ];
    const res = phaseShiftMaskingAnalysis({
      algorithm: DRCLVSAlgorithm.DESIGN_RULE_CHECK, cells: [], wires,
    });
    expect(res.violations.some(v => v.rule === 'PSM_ASSIST_REQUIRED')).toBe(true);
  });

  it('SRAF flags isolated wires with no nearby parallel neighbour', () => {
    const wires = [ mkWire('lonely', 'N', [[0,0],[50,0]]) ];
    const res = srafAnalysis({
      algorithm: DRCLVSAlgorithm.DESIGN_RULE_CHECK, cells: [], wires,
    });
    expect(res.violations.some(v => v.rule === 'SRAF_RECOMMENDED')).toBe(true);
  });

  it('runLithography dispatcher dispatches by algorithm string', () => {
    const res = runLithography({
      algorithm: 'sraf' as any,
      cells: [], wires: [mkWire('x', 'X', [[0,0],[10,0]])],
    });
    expect(res.violations.every(v => v.rule !== 'OPC_SERIF_REQUIRED')).toBe(true);
  });
});

describe('Manufacturing — CMP', () => {
  it('density balancing flags low-density regions', () => {
    const cells = [mkCell('c1', 0, 0, 1, 1)]; // tiny cell in a big area
    const wires = [mkWire('w', 'X', [[0,0],[100,100]])];
    const res = densityBalancingAnalysis({
      algorithm: DRCLVSAlgorithm.DESIGN_RULE_CHECK, cells, wires,
    });
    expect(res.violations.some(v => v.rule === 'CMP_DENSITY_TOO_LOW')).toBe(true);
  });

  it('dummy fill recommendations include an area estimate', () => {
    const cells = [mkCell('c1', 0, 0, 1, 1)];
    const wires = [mkWire('w', 'X', [[0,0],[100,100]])];
    const res = dummyFillAnalysis({
      algorithm: DRCLVSAlgorithm.DESIGN_RULE_CHECK, cells, wires,
    });
    const v = res.violations.find(vv => vv.rule === 'DUMMY_FILL_REQUIRED');
    expect(v).toBeDefined();
    expect(v!.message).toMatch(/µm²/);
  });

  it('cmp-aware routing flags wires through high-density tiles', () => {
    // Pack many cells into one corner to saturate density there.
    const cells: Cell[] = [];
    for (let i = 0; i < 10; i++) cells.push(mkCell(`d${i}`, 0, 0, 10, 10));
    const wires = [mkWire('thru', 'N', [[5,5],[50,50]])];
    const res = cmpAwareRoutingAnalysis({
      algorithm: DRCLVSAlgorithm.DESIGN_RULE_CHECK, cells, wires,
    });
    expect(res.violations.some(v => v.rule === 'CMP_AWARE_REROUTE')).toBe(true);
  });

  it('runCMP dispatcher dispatches by algorithm string', () => {
    const res = runCMP({
      algorithm: 'dummy_fill' as any,
      cells: [mkCell('c', 0, 0)], wires: [],
    });
    expect(res).toHaveProperty('runtime');
  });
});
