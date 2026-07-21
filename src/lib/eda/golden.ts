export interface GoldenMetric {
  expected: number;
  absoluteTolerance?: number;
  relativeTolerance?: number;
}

export interface GoldenManifest {
  name: string;
  toolImage: string;
  pdkDigest: string;
  maxRuntimeMs: number;
  metrics: Record<string, GoldenMetric>;
  artifacts: Record<string, string>;
}

export interface GoldenObservation {
  toolImage: string;
  pdkDigest: string;
  runtimeMs: number;
  metrics: Record<string, number>;
  artifacts: Record<string, string>;
}

export interface GoldenValidation {
  passed: boolean;
  failures: string[];
}

export function validateGolden(manifest: GoldenManifest, observation: GoldenObservation): GoldenValidation {
  const failures: string[] = [];
  if (!/@sha256:[0-9a-f]{64}$/.test(manifest.toolImage)) failures.push('golden tool image is not pinned');
  if (observation.toolImage !== manifest.toolImage) failures.push('tool image differs from golden provenance');
  if (observation.pdkDigest !== manifest.pdkDigest) failures.push('PDK digest differs from golden provenance');
  if (observation.runtimeMs > manifest.maxRuntimeMs) {
    failures.push(`runtime ${observation.runtimeMs}ms exceeds ${manifest.maxRuntimeMs}ms ceiling`);
  }
  for (const [name, rule] of Object.entries(manifest.metrics)) {
    const actual = observation.metrics[name];
    if (!Number.isFinite(actual)) {
      failures.push(`metric ${name} is missing`);
      continue;
    }
    const absolute = Math.abs(actual - rule.expected);
    const relative = rule.expected === 0 ? absolute : absolute / Math.abs(rule.expected);
    const withinAbsolute = rule.absoluteTolerance !== undefined && absolute <= rule.absoluteTolerance;
    const withinRelative = rule.relativeTolerance !== undefined && relative <= rule.relativeTolerance;
    if (!withinAbsolute && !withinRelative) {
      failures.push(`metric ${name}=${actual} is outside its declared tolerance`);
    }
  }
  for (const [name, digest] of Object.entries(manifest.artifacts)) {
    if (!/^[0-9a-f]{64}$/.test(digest)) failures.push(`golden artifact ${name} has an invalid digest`);
    else if (observation.artifacts[name] !== digest) failures.push(`artifact ${name} differs from golden output`);
  }
  return { passed: failures.length === 0, failures };
}
