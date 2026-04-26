/**
 * ESD coverage check.
 *
 * For every I/O pad, find the closest ESD device (clamp/diode) on the
 * same domain and report distance + a pass/fail vs `maxDist`. Pads
 * outside `maxDist` are flagged — they have no nearby discharge path.
 *
 * All coordinates in microns. Domains are arbitrary string tags
 * (e.g. "vdd_io", "vdda") — matching is exact.
 */
export interface EsdPad {
  name: string;
  domain: string;
  x: number;
  y: number;
}

export interface EsdDevice {
  name: string;
  domain: string;
  x: number;
  y: number;
}

export interface EsdReport {
  pad: string;
  domain: string;
  nearest?: string;
  distance: number;
  ok: boolean;
}

export interface EsdResult {
  reports: EsdReport[];
  uncovered: number;
  maxDistance: number;
  warnings: string[];
}

export function checkEsdCoverage(
  pads: EsdPad[], devices: EsdDevice[], maxDist: number,
): EsdResult {
  if (maxDist <= 0) throw new Error('maxDist must be positive');
  const reports: EsdReport[] = [];
  const warnings: string[] = [];
  let uncovered = 0, worst = 0;
  const byDomain = new Map<string, EsdDevice[]>();
  for (const d of devices) {
    if (!byDomain.has(d.domain)) byDomain.set(d.domain, []);
    byDomain.get(d.domain)!.push(d);
  }
  for (const pad of pads) {
    const candidates = byDomain.get(pad.domain) ?? [];
    if (candidates.length === 0) {
      warnings.push(`no ESD devices on domain "${pad.domain}"`);
      reports.push({
        pad: pad.name, domain: pad.domain,
        distance: Infinity, ok: false,
      });
      uncovered++;
      continue;
    }
    let best = Infinity, bestName: string | undefined;
    for (const d of candidates) {
      const dx = d.x - pad.x, dy = d.y - pad.y;
      const dist = Math.hypot(dx, dy);
      if (dist < best) { best = dist; bestName = d.name; }
    }
    const ok = best <= maxDist;
    if (!ok) uncovered++;
    if (best > worst && best !== Infinity) worst = best;
    reports.push({
      pad: pad.name, domain: pad.domain,
      nearest: bestName, distance: best, ok,
    });
  }
  return { reports, uncovered, maxDistance: worst, warnings };
}
