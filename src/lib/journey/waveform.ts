export interface WaveSignal {
  id: string;
  name: string;
  width: number;
  transitions: Array<{ time: number; value: string }>;
}
export interface Waveform {
  timescale: string;
  endTime: number;
  signals: WaveSignal[];
  truncated: boolean;
}

/** Bounded VCD preview. Full original files remain available as artifacts. */
export function parseVcd(text: string, limits = { signals: 80, transitions: 16000 }): Waveform {
  if (text.length > 4_000_000)
    throw new Error('Waveform exceeds the 4 MB preview limit; download the original artifact');
  const scopes: string[] = [];
  const signals: WaveSignal[] = [];
  const identifiers = new Map<string, WaveSignal[]>();
  const tokens: string[] = text.match(/\S+/g) ?? [];
  let time = 0;
  let endTime = 0;
  let changes = 0;
  let truncated = false;
  let timescale = 'unspecified';
  let definitions = true;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('$') && !['$dumpvars', '$dumpall', '$dumpon', '$dumpoff', '$end'].includes(token)) {
      const end = tokens.indexOf('$end', i + 1);
      if (end < 0) throw new Error('Incomplete VCD declaration');
      const args = tokens.slice(i + 1, end);
      if (token === '$timescale') timescale = args.join(' ');
      if (token === '$scope') scopes.push(args[1] ?? 'scope');
      if (token === '$upscope') scopes.pop();
      if (token === '$enddefinitions') definitions = false;
      if (token === '$var') {
        const width = Number(args[1]);
        if (!Number.isInteger(width) || width < 1 || width > 65536 || !args[2] || !args[3])
          throw new Error('Invalid VCD signal declaration');
        if (signals.length < limits.signals) {
          const signal: WaveSignal = {
            id: `signal-${signals.length}`,
            name: [...scopes, args[3], ...args.slice(4)].join('.'),
            width,
            transitions: [],
          };
          signals.push(signal);
          identifiers.set(args[2], [...(identifiers.get(args[2]) ?? []), signal]);
        } else truncated = true;
      }
      i = end;
      continue;
    }
    if (token.startsWith('#')) {
      const next = Number(token.slice(1));
      if (!Number.isSafeInteger(next) || next < time) throw new Error('Invalid or non-monotonic VCD timestamp');
      time = next;
      endTime = next;
    } else if (!definitions && /^[01xXzZbBrR]/.test(token)) {
      let value: string;
      let id: string;
      if (/^[bBrR]/.test(token)) {
        value = token.slice(1);
        id = tokens[++i] ?? '';
      } else {
        value = token[0];
        id = token.slice(1);
      }
      for (const signal of identifiers.get(id) ?? []) {
        if (changes >= limits.transitions) {
          truncated = true;
          continue;
        }
        if (value.length > 4096) {
          truncated = true;
          value = value.slice(0, 4096);
        }
        const previous = signal.transitions[signal.transitions.length - 1];
        if (previous?.value === value) continue;
        if (previous?.time === time) signal.transitions.pop();
        signal.transitions.push({ time, value });
        changes++;
      }
    }
  }
  if (!signals.length) throw new Error('No signals found in this VCD artifact');
  return { timescale, endTime, signals, truncated };
}

export function valueAt(signal: WaveSignal, time: number): string {
  let lo = 0,
    hi = signal.transitions.length - 1,
    answer = 'x';
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (signal.transitions[mid].time <= time) {
      answer = signal.transitions[mid].value;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return answer;
}
