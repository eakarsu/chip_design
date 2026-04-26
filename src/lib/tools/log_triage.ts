/**
 * Simulator log triage.
 *
 * Bucket simulator log lines into severity categories (UVM_FATAL,
 * UVM_ERROR, UVM_WARNING, UVM_INFO, generic info), extract the
 * canonical message tag, and group identical signatures so a 3000-line
 * log collapses to a handful of root causes.
 *
 * Signature = severity + tag + the first ~80 chars of the message,
 * with hex addresses, decimal numbers and time stamps replaced by
 * placeholders so otherwise identical messages collide.
 */
export type LogSeverity =
  | 'UVM_FATAL' | 'UVM_ERROR' | 'UVM_WARNING' | 'UVM_INFO'
  | 'INFO' | 'OTHER';

export interface LogLineParsed {
  line: number;
  severity: LogSeverity;
  /** UVM tag in square brackets, e.g. UVM_FATAL [DRV_OOB]. */
  tag: string;
  message: string;
  signature: string;
}

export interface LogBucket {
  signature: string;
  severity: LogSeverity;
  count: number;
  firstLine: number;
  example: string;
}

export interface LogTriageResult {
  parsed: LogLineParsed[];
  buckets: LogBucket[];
  bySeverity: Record<LogSeverity, number>;
  /** First fatal line, if any. */
  firstFatal: number | null;
}

const SEV_RE: { sev: LogSeverity; re: RegExp }[] = [
  { sev: 'UVM_FATAL',   re: /UVM_FATAL\b/ },
  { sev: 'UVM_ERROR',   re: /UVM_ERROR\b/ },
  { sev: 'UVM_WARNING', re: /UVM_WARNING\b/ },
  { sev: 'UVM_INFO',    re: /UVM_INFO\b/ },
];

function classify(line: string): LogSeverity {
  for (const { sev, re } of SEV_RE) if (re.test(line)) return sev;
  if (/\b(error|fatal)\b/i.test(line)) return 'OTHER';
  if (/\b(info|note)\b/i.test(line))   return 'INFO';
  return 'OTHER';
}

function canonicalise(msg: string): string {
  return msg
    .replace(/0x[0-9a-fA-F]+/g, '<hex>')
    .replace(/\d+/g, '<n>')
    .replace(/@\s*<n>(\.<n>)?\s*(?:ns|ps|us)?/g, '@<t>')
    .slice(0, 80);
}

function tagOf(line: string): string {
  const m = line.match(/\[([A-Z0-9_]+)\]/);
  return m ? m[1] : '';
}

export function triageLog(logText: string): LogTriageResult {
  if (typeof logText !== 'string') throw new Error('logText must be string');
  const lines = logText.split(/\r?\n/);
  const parsed: LogLineParsed[] = [];
  const bucketMap = new Map<string, LogBucket>();
  const bySev: Record<LogSeverity, number> = {
    UVM_FATAL: 0, UVM_ERROR: 0, UVM_WARNING: 0, UVM_INFO: 0,
    INFO: 0, OTHER: 0,
  };
  let firstFatal: number | null = null;
  lines.forEach((raw, idx) => {
    if (!raw.trim()) return;
    const sev = classify(raw);
    const tag = tagOf(raw);
    const msg = raw.trim();
    const sig = `${sev}|${tag}|${canonicalise(msg)}`;
    parsed.push({
      line: idx + 1, severity: sev, tag, message: msg, signature: sig,
    });
    bySev[sev]++;
    if (sev === 'UVM_FATAL' && firstFatal === null) firstFatal = idx + 1;
    if (!bucketMap.has(sig)) {
      bucketMap.set(sig, {
        signature: sig, severity: sev, count: 0,
        firstLine: idx + 1, example: msg,
      });
    }
    bucketMap.get(sig)!.count++;
  });
  const buckets = [...bucketMap.values()]
    .sort((a, b) => b.count - a.count);
  return { parsed, buckets, bySeverity: bySev, firstFatal };
}
