/**
 * Latch-up rule checker.
 *
 * Foundry rules require every NMOS / PMOS region to have a substrate
 * tap (n+ in n-well, p+ in p-substrate) within a maximum distance.
 * Without a nearby tap the parasitic SCR can latch.
 *
 * We model this as: for every device, find the closest matching tap;
 * fail if it's farther than `maxTapDist`. Inputs in microns.
 */
export interface LatchupDevice {
  name: string;
  /** "nmos" or "pmos". */
  kind: 'nmos' | 'pmos';
  x: number;
  y: number;
}

export interface LatchupTap {
  name: string;
  /** "ntap" lives in n-well, ties to VDD. "ptap" ties to VSS. */
  kind: 'ntap' | 'ptap';
  x: number;
  y: number;
}

export interface LatchupReport {
  device: string;
  kind: 'nmos' | 'pmos';
  nearestTap?: string;
  distance: number;
  ok: boolean;
}

export interface LatchupResult {
  reports: LatchupReport[];
  failing: number;
  warnings: string[];
}

export function checkLatchup(
  devices: LatchupDevice[], taps: LatchupTap[], maxTapDist: number,
): LatchupResult {
  if (maxTapDist <= 0) throw new Error('maxTapDist must be positive');
  const reports: LatchupReport[] = [];
  const warnings: string[] = [];
  let failing = 0;
  // PMOS lives in n-well → ntap. NMOS lives in p-substrate → ptap.
  const required = (k: 'nmos' | 'pmos') => k === 'pmos' ? 'ntap' : 'ptap';
  const tapsByKind = new Map<'ntap' | 'ptap', LatchupTap[]>();
  for (const t of taps) {
    if (!tapsByKind.has(t.kind)) tapsByKind.set(t.kind, []);
    tapsByKind.get(t.kind)!.push(t);
  }
  for (const d of devices) {
    const need = required(d.kind);
    const candidates = tapsByKind.get(need) ?? [];
    if (candidates.length === 0) {
      warnings.push(`no ${need} taps for ${d.kind} devices`);
      reports.push({
        device: d.name, kind: d.kind,
        distance: Infinity, ok: false,
      });
      failing++;
      continue;
    }
    let best = Infinity, bestN: string | undefined;
    for (const t of candidates) {
      const dist = Math.hypot(t.x - d.x, t.y - d.y);
      if (dist < best) { best = dist; bestN = t.name; }
    }
    const ok = best <= maxTapDist;
    if (!ok) failing++;
    reports.push({
      device: d.name, kind: d.kind,
      nearestTap: bestN, distance: best, ok,
    });
  }
  return { reports, failing, warnings };
}
