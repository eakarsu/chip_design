/**
 * Emit `SdcConstraints` back to a textual SDC file.
 *
 * Pairs with `parsers/sdc.ts`. Together these give a round-trippable
 * SDC pipeline: text → SdcConstraints → text. The emitted form is
 * canonical, not byte-identical — comments and original ordering are
 * lost — but it is semantically faithful for the commands we model.
 *
 * Also exposes `summariseSdc` for a quick one-line "what's in here"
 * read-out (e.g., "2 clocks, 4 IO delays, 1 false path").
 */

import type {
  SdcConstraints, Clock, GeneratedClock, IODelay,
  FalsePath, MulticyclePath, MaxMinDelay, ClockGroups, ClockUncertainty,
} from '../parsers/sdc';

function quoteArg(s: string): string {
  // Already braced or bracketed → pass through.
  if (/^[\[{].*[\]}]$/.test(s)) return s;
  // Bare identifier → no quotes needed.
  if (/^[\w./]+$/.test(s)) return s;
  return `{${s}}`;
}

export function emitClock(c: Clock): string {
  const parts = ['create_clock', `-name ${c.name}`, `-period ${c.period}`];
  parts.push(`-waveform { ${c.waveform[0]} ${c.waveform[1]} }`);
  if (c.source) parts.push(quoteArg(c.source));
  return parts.join(' ');
}

export function emitGeneratedClock(g: GeneratedClock): string {
  const parts = ['create_generated_clock', `-name ${g.name}`];
  if (g.masterClock)  parts.push(`-source ${g.masterClock}`);
  if (g.divideBy)     parts.push(`-divide_by ${g.divideBy}`);
  if (g.multiplyBy)   parts.push(`-multiply_by ${g.multiplyBy}`);
  if (g.invert)       parts.push('-invert');
  if (g.source)       parts.push(quoteArg(g.source));
  return parts.join(' ');
}

export function emitIODelay(d: IODelay): string {
  const cmd = d.kind === 'input' ? 'set_input_delay' : 'set_output_delay';
  const parts = [cmd, `-clock ${d.clock}`];
  if (d.max && !d.min) parts.push('-max');
  if (d.min && !d.max) parts.push('-min');
  if (d.clockFall) parts.push('-clock_fall');
  parts.push(String(d.delay));
  parts.push(quoteArg(d.ports));
  return parts.join(' ');
}

export function emitFalsePath(f: FalsePath): string {
  const parts = ['set_false_path'];
  if (f.setupOnly) parts.push('-setup');
  if (f.holdOnly)  parts.push('-hold');
  if (f.from)    parts.push(`-from ${quoteArg(f.from)}`);
  if (f.through) parts.push(`-through ${quoteArg(f.through)}`);
  if (f.to)      parts.push(`-to ${quoteArg(f.to)}`);
  return parts.join(' ');
}

export function emitMulticycle(m: MulticyclePath): string {
  const parts = ['set_multicycle_path'];
  if (m.setup) parts.push('-setup');
  if (m.hold)  parts.push('-hold');
  parts.push(String(m.cycles));
  if (m.from)    parts.push(`-from ${quoteArg(m.from)}`);
  if (m.through) parts.push(`-through ${quoteArg(m.through)}`);
  if (m.to)      parts.push(`-to ${quoteArg(m.to)}`);
  return parts.join(' ');
}

export function emitMaxMinDelay(d: MaxMinDelay): string {
  const cmd = d.kind === 'max' ? 'set_max_delay' : 'set_min_delay';
  const parts = [cmd, String(d.delay)];
  if (d.from)    parts.push(`-from ${quoteArg(d.from)}`);
  if (d.through) parts.push(`-through ${quoteArg(d.through)}`);
  if (d.to)      parts.push(`-to ${quoteArg(d.to)}`);
  return parts.join(' ');
}

export function emitClockGroups(g: ClockGroups): string {
  const parts = ['set_clock_groups', `-${g.kind}`];
  for (const grp of g.groups) parts.push(`-group { ${grp.join(' ')} }`);
  return parts.join(' ');
}

export function emitClockUncertainty(u: ClockUncertainty): string {
  const parts = ['set_clock_uncertainty'];
  if (u.setup) parts.push('-setup');
  if (u.hold)  parts.push('-hold');
  if (u.from)  parts.push(`-from ${quoteArg(u.from)}`);
  if (u.to)    parts.push(`-to ${quoteArg(u.to)}`);
  parts.push(String(u.value));
  return parts.join(' ');
}

export function emitSdc(sdc: SdcConstraints): string {
  const out: string[] = ['# Emitted SDC — sdc_writer'];
  if (sdc.clocks.length)              out.push('# clocks');
  for (const c of sdc.clocks)         out.push(emitClock(c));
  if (sdc.generatedClocks.length)     out.push('# generated clocks');
  for (const g of sdc.generatedClocks) out.push(emitGeneratedClock(g));
  if (sdc.ioDelays.length)            out.push('# IO delays');
  for (const d of sdc.ioDelays)       out.push(emitIODelay(d));
  if (sdc.falsePaths.length)          out.push('# false paths');
  for (const f of sdc.falsePaths)     out.push(emitFalsePath(f));
  if (sdc.multicyclePaths.length)     out.push('# multicycle paths');
  for (const m of sdc.multicyclePaths) out.push(emitMulticycle(m));
  if (sdc.maxMinDelays.length)        out.push('# max/min delays');
  for (const d of sdc.maxMinDelays)   out.push(emitMaxMinDelay(d));
  if (sdc.clockGroups.length)         out.push('# clock groups');
  for (const g of sdc.clockGroups)    out.push(emitClockGroups(g));
  if (sdc.clockUncertainties.length)  out.push('# clock uncertainties');
  for (const u of sdc.clockUncertainties) out.push(emitClockUncertainty(u));
  return out.join('\n') + '\n';
}

export interface SdcSummary {
  clocks: number;
  generatedClocks: number;
  ioDelays: number;
  falsePaths: number;
  multicyclePaths: number;
  maxMinDelays: number;
  clockGroups: number;
  clockUncertainties: number;
  warnings: number;
  /** Fastest clock period (ns), or null if none. */
  fastestClock: number | null;
  /** Slowest clock period (ns), or null if none. */
  slowestClock: number | null;
  /** Estimated max design Fmax = 1/fastestClock (MHz). */
  fmaxMHz: number | null;
}

export function summariseSdc(sdc: SdcConstraints): SdcSummary {
  let fastest = Infinity, slowest = -Infinity;
  for (const c of sdc.clocks) {
    if (c.period > 0 && c.period < fastest) fastest = c.period;
    if (c.period > slowest) slowest = c.period;
  }
  const hasClock = sdc.clocks.length > 0 && Number.isFinite(fastest);
  return {
    clocks: sdc.clocks.length,
    generatedClocks: sdc.generatedClocks.length,
    ioDelays: sdc.ioDelays.length,
    falsePaths: sdc.falsePaths.length,
    multicyclePaths: sdc.multicyclePaths.length,
    maxMinDelays: sdc.maxMinDelays.length,
    clockGroups: sdc.clockGroups.length,
    clockUncertainties: sdc.clockUncertainties.length,
    warnings: sdc.warnings.length,
    fastestClock: hasClock ? fastest : null,
    slowestClock: hasClock ? slowest : null,
    fmaxMHz: hasClock ? 1000 / fastest : null,
  };
}
