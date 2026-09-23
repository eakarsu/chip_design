/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readMeasuredMetrics } from '@/lib/eda/measuredMetrics';

it('keeps legacy tool metrics while requiring complete ORFS evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'measured-metrics-'));
  try {
    fs.writeFileSync(path.join(root, 'metrics.json'), JSON.stringify({ cells: 25, claim: 'not measured' }));
    expect(readMeasuredMetrics(root, 'other')).toEqual({ cells: 25 });
    expect(readMeasuredMetrics(root, 'openroad')).toEqual({});
    fs.mkdirSync(path.join(root, 'logs'));
    fs.mkdirSync(path.join(root, 'reports'));
    fs.mkdirSync(path.join(root, 'results'));
    fs.writeFileSync(path.join(root, 'logs', '6_report.json'), JSON.stringify({
      finish__design__die__area: 500,
      finish__power__total: 0.001,
      finish__timing__fmax: 200_000_000,
      finish__timing__setup__ws: 0.2,
      finish__timing__hold__ws: 0.1,
      finish__timing__setup__tns: 0,
      finish__timing__hold__tns: 0,
      finish__flow__errors__count: 0,
    }));
    fs.writeFileSync(path.join(root, 'reports', '5_route_drc.rpt'), '');
    expect(readMeasuredMetrics(root, 'openroad')).toEqual({});
    fs.writeFileSync(path.join(root, 'results', '6_final.gds'), '');
    expect(readMeasuredMetrics(root, 'openroad')).toEqual({});
    fs.writeFileSync(path.join(root, 'results', '6_final.gds'), 'gds');
    expect(readMeasuredMetrics(root, 'openroad')).toMatchObject({ dieAreaUm2: 500, powerMw: 1, fmaxMHz: 200, drcViolations: 0 });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
