import { triageLog } from '@/lib/tools/log_triage';

describe('triageLog', () => {
  it('buckets duplicate UVM_ERROR signatures', () => {
    const log = [
      'UVM_INFO @ 100ns [DRV] sending xact 0xdeadbeef',
      'UVM_ERROR @ 200ns [SCB] mismatch at addr 0x1000 exp=0x55 got=0xaa',
      'UVM_ERROR @ 250ns [SCB] mismatch at addr 0x2000 exp=0x77 got=0xbb',
      'UVM_FATAL @ 300ns [ENV] timeout',
    ].join('\n');
    const r = triageLog(log);
    const scb = r.buckets.find(b => b.severity === 'UVM_ERROR')!;
    expect(scb.count).toBe(2);
    expect(r.bySeverity.UVM_FATAL).toBe(1);
    expect(r.firstFatal).toBe(4);
  });

  it('classifies INFO and OTHER lines', () => {
    const r = triageLog([
      'INFO: build start',
      'random gibberish line',
    ].join('\n'));
    expect(r.bySeverity.INFO).toBeGreaterThanOrEqual(1);
    expect(r.bySeverity.OTHER).toBeGreaterThanOrEqual(1);
  });

  it('throws on non-string', () => {
    expect(() => triageLog(123 as unknown as string)).toThrow();
  });
});
