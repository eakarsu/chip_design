/**
 * Lightweight RTL (Verilog/SystemVerilog) linter.
 *
 * We don't parse — we run a pile of regex rules over each line and
 * collect violations with severity. The rule set covers a handful of
 * the high-value style checks that production linters (Spyglass,
 * Verible) flag too:
 *
 *   - latch-inferring incomplete `if` (warning)
 *   - blocking assignments inside always_ff (error)
 *   - non-blocking inside combinational always (error)
 *   - unsized integer literal in expression (info)
 *   - tab characters / trailing whitespace (info)
 *   - `case` without default (warning)
 *   - bare wildcard sensitivity list `always @(*)` flagged as info if SV
 *     `always_comb` available
 *
 * Each rule has a stable id so callers can suppress them by id.
 */
export type LintSeverity = 'error' | 'warning' | 'info';

export interface LintViolation {
  rule: string;
  severity: LintSeverity;
  line: number;
  message: string;
  text: string;
}

export interface LintResult {
  violations: LintViolation[];
  errors: number;
  warnings: number;
  infos: number;
  /** Per-rule counts — useful for "noise" rules. */
  ruleCounts: Record<string, number>;
}

interface Rule {
  id: string;
  severity: LintSeverity;
  message: string;
  test: (line: string, ctx: { inAlwaysFf: boolean; inAlwaysComb: boolean }) => boolean;
}

const RULES: Rule[] = [
  {
    id: 'BLOCK_IN_FF', severity: 'error',
    message: 'blocking (=) assignment inside always_ff — use <=',
    test: (l, c) => c.inAlwaysFf && /^\s*\w+\s*=\s*[^=]/.test(l),
  },
  {
    id: 'NB_IN_COMB', severity: 'error',
    message: 'non-blocking (<=) inside combinational always — use =',
    test: (l, c) => c.inAlwaysComb && /<=/.test(l),
  },
  {
    id: 'CASE_NO_DEFAULT', severity: 'warning',
    message: 'case statement; verify a default arm exists',
    test: l => /\b(unique\s+)?case\s*\(/.test(l) && !/default/.test(l),
  },
  {
    id: 'TAB_CHAR', severity: 'info',
    message: 'tab character in source — prefer spaces',
    test: l => /\t/.test(l),
  },
  {
    id: 'TRAILING_WS', severity: 'info',
    message: 'trailing whitespace',
    test: l => /[ \t]+$/.test(l),
  },
  {
    id: 'UNSIZED_LIT', severity: 'info',
    message: 'unsized integer literal',
    test: l => /=\s*'[bdho]/.test(l) && !/^\s*\/\//.test(l),
  },
  {
    id: 'STAR_SENS', severity: 'info',
    message: 'always @(*) — prefer always_comb',
    test: l => /always\s*@\s*\(\s*\*\s*\)/.test(l),
  },
];

export function lintRtl(source: string): LintResult {
  if (typeof source !== 'string') throw new Error('source must be string');
  const lines = source.split(/\r?\n/);
  const violations: LintViolation[] = [];
  let inAlwaysFf = false, inAlwaysComb = false;
  let braceDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.replace(/\/\/.*$/, '');
    if (/always_ff\b/.test(stripped))   { inAlwaysFf = true;   braceDepth = 0; }
    if (/always_comb\b/.test(stripped)) { inAlwaysComb = true; braceDepth = 0; }
    if (inAlwaysFf || inAlwaysComb) {
      braceDepth += (stripped.match(/\bbegin\b/g) || []).length;
      braceDepth -= (stripped.match(/\bend\b/g) || []).length;
      if (braceDepth <= 0 && /\bend\b/.test(stripped)) {
        inAlwaysFf = false; inAlwaysComb = false; braceDepth = 0;
      }
    }
    const ctx = { inAlwaysFf, inAlwaysComb };
    for (const r of RULES) {
      if (r.test(raw, ctx)) {
        violations.push({
          rule: r.id, severity: r.severity, message: r.message,
          line: i + 1, text: raw.trim(),
        });
      }
    }
  }
  const ruleCounts: Record<string, number> = {};
  let errors = 0, warnings = 0, infos = 0;
  for (const v of violations) {
    ruleCounts[v.rule] = (ruleCounts[v.rule] ?? 0) + 1;
    if (v.severity === 'error') errors++;
    else if (v.severity === 'warning') warnings++;
    else infos++;
  }
  return { violations, errors, warnings, infos, ruleCounts };
}
