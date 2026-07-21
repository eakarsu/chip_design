export interface TimingPath {
  startpoint: string;
  endpoint: string;
  pathGroup?: string;
  pathType?: 'max' | 'min' | string;
  arrival: number;
  required: number;
  slack: number;
  status: 'MET' | 'VIOLATED' | 'UNKNOWN';
  stages: string[];
}

/** Parse OpenSTA report_checks output without importing any Node-only tool runner. */
export function parseTimingPaths(stdout: string): TimingPath[] {
  const output: TimingPath[] = [];
  const blocks = stdout.split(/(?=^Startpoint:\s)/m).slice(1);
  for (const block of blocks) {
    const start = block.match(/^Startpoint:\s*(\S+)/m);
    const end = block.match(/^Endpoint:\s*(\S+)/m);
    if (!start || !end) continue;
    const group = block.match(/^Path Group:\s*(\S+)/m);
    const type = block.match(/^Path Type:\s*(\S+)/m);
    const arrival = block.match(/(-?[\d.]+)\s+data\s+arrival\s+time/i);
    const required = block.match(/(-?[\d.]+)\s+data\s+required\s+time/i);
    const slack = block.match(/(-?[\d.]+)\s+slack\s*\((MET|VIOLATED)\)/i);
    if (!slack) continue;
    output.push({
      startpoint: start[1], endpoint: end[1], pathGroup: group?.[1], pathType: type?.[1],
      arrival: arrival ? Number(arrival[1]) : NaN,
      required: required ? Number(required[1]) : NaN,
      slack: Number(slack[1]), status: slack[2].toUpperCase() === 'MET' ? 'MET' : 'VIOLATED',
      stages: block.split('\n').filter(line => /^\s*-?\d+\.\d+\s+-?\d+\.\d+/.test(line))
        .map(line => line.trim()),
    });
  }
  return output;
}
