import type { TemplateId } from './types';

export interface DerivedRequirement {
  id: string;
  description: string;
}

const REQUIREMENT_SIGNAL =
  /\b(shall|must|should|will|required|needs? to|ensure|support|provide|implement|accept|handle|operate|target|maintain|allow|enable)\b/i;
const BULLET_PREFIX = /^\s*(?:[-*•·]|\d+[.)]|[a-z][.)])\s*/i;
const HEADING_PREFIX = /^\s*#{1,6}\s+/;
const SENTENCE_BREAK = /(?<=[.!?;])\s+/;
const MIN_DESCRIPTION = 12;
const MAX_DESCRIPTION = 240;

const TEMPLATE_SIGNALS: Array<{ id: TemplateId; pattern: RegExp }> = [
  { id: 'fifo', pattern: /\b(fifo|first[- ]in[- ]first[- ]out|queue|ready\/valid|backpressure|elastic buffer)\b/i },
  { id: 'mac', pattern: /\b(mac|multiply[- ]accumulate|multiplier|accumulator|dot product|systolic)\b/i },
  { id: 'gcd', pattern: /\b(gcd|greatest common divisor|euclid(?:ean)?)\b/i },
];

function stripBullet(value: string): string {
  return value.replace(BULLET_PREFIX, '').trim();
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string): string {
  if (value.length <= MAX_DESCRIPTION) return value;
  const cut = value.slice(0, MAX_DESCRIPTION);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > 40 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

/** Extract a short, reviewable requirements list from a pasted specification without inventing metrics. */
export function deriveRequirementsFromSpec(specification: string, limit = 8): DerivedRequirement[] {
  const lines = specification
    .split(/\r?\n/)
    .filter((line) => !HEADING_PREFIX.test(line))
    .map(stripBullet)
    .filter(Boolean);
  const explicit = lines.filter((line) => REQUIREMENT_SIGNAL.test(line));
  const sentences = lines
    .flatMap((line) => line.split(SENTENCE_BREAK))
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = explicit.length ? [...explicit, ...sentences] : sentences;
  const derived: DerivedRequirement[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const description = normalize(candidate);
    const key = description.toLowerCase().replace(/[.;:,]+$/, '');
    if (description.length < MIN_DESCRIPTION || seen.has(key)) continue;
    seen.add(key);
    derived.push({ id: `spec-${derived.length + 1}`, description: truncate(description) });
    if (derived.length >= limit) break;
  }
  return derived;
}

/** Pick the closest published reference template for a pasted specification. */
export function recommendTemplate(specification: string): TemplateId {
  const scored = TEMPLATE_SIGNALS.map(({ id, pattern }) => ({
    id,
    score: specification.match(new RegExp(pattern.source, 'gi'))?.length ?? 0,
  }));
  const best = scored.reduce((winner, item) => (item.score > winner.score ? item : winner));
  return best.score > 0 ? best.id : 'gcd';
}
