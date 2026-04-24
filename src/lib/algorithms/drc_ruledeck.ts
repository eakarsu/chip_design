/**
 * DRC rule-deck engine.
 *
 * A real DRC rule deck (Calibre SVRF, ICV) is a small programming language.
 * This engine implements the subset that matters for early sign-off:
 *
 *   - min_width        width of every geometry on layer L ≥ threshold
 *   - min_spacing      gap between two geometries on layer L ≥ threshold
 *   - min_area         area of every shape on layer L ≥ threshold
 *   - enclosure        shapes of layer A must be enclosed by B by at least T
 *   - density          layer coverage inside every window of size W×H
 *                      must lie within [min, max]
 *   - extension        a wire end must extend past its landing pad by T
 *
 * Rules are a pure JSON structure — no code-gen, no eval — so they can be
 * authored by engineers, persisted in the DB, and diffed in version control.
 *
 * A rule deck runs over a flat list of `Geometry` records (layer, rect)
 * that the DEF/LEF layer produces.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Rect { xl: number; yl: number; xh: number; yh: number; }

export interface Geometry {
  id: string;
  layer: string;
  rect: Rect;
  /** Optional owning cell — helpful for violation messages. */
  owner?: string;
}

export type DrcRule =
  | { kind: 'min_width';   layer: string; min: number; name?: string }
  | { kind: 'min_spacing'; layer: string; min: number; name?: string }
  | { kind: 'min_area';    layer: string; min: number; name?: string }
  | { kind: 'enclosure';   inner: string; outer: string; min: number; name?: string }
  | { kind: 'density';     layer: string; window: number; min: number; max: number; name?: string }
  | { kind: 'extension';   layer: string; over: string; min: number; name?: string };

export interface RuleDeck {
  name: string;
  technology: string;
  /** Optional design-rule version — e.g. 'TSMC N7 1.0'. */
  version?: string;
  rules: DrcRule[];
}

export interface DrcViolation {
  ruleName: string;
  kind: DrcRule['kind'];
  layer?: string;
  severity: 'error' | 'warning';
  message: string;
  geometries: string[];
}

export interface DrcReport {
  violations: DrcViolation[];
  runtimeMs: number;
  /** How many geometries participated. */
  geometryCount: number;
}

/* --------------------------------------------------------------------- */
/* Engine entry point                                                     */
/* --------------------------------------------------------------------- */

export function runDrc(deck: RuleDeck, geoms: Geometry[]): DrcReport {
  const t0 = Date.now();
  const violations: DrcViolation[] = [];
  for (const rule of deck.rules) {
    switch (rule.kind) {
      case 'min_width':    violations.push(...checkMinWidth(rule, geoms)); break;
      case 'min_spacing':  violations.push(...checkMinSpacing(rule, geoms)); break;
      case 'min_area':     violations.push(...checkMinArea(rule, geoms)); break;
      case 'enclosure':    violations.push(...checkEnclosure(rule, geoms)); break;
      case 'density':      violations.push(...checkDensity(rule, geoms)); break;
      case 'extension':    violations.push(...checkExtension(rule, geoms)); break;
    }
  }
  return { violations, runtimeMs: Date.now() - t0, geometryCount: geoms.length };
}

/* --------------------------------------------------------------------- */
/* Individual rule checks                                                 */
/* --------------------------------------------------------------------- */

function onLayer(geoms: Geometry[], layer: string): Geometry[] {
  return geoms.filter(g => g.layer === layer);
}

function checkMinWidth(rule: Extract<DrcRule, { kind: 'min_width' }>, geoms: Geometry[]): DrcViolation[] {
  const out: DrcViolation[] = [];
  for (const g of onLayer(geoms, rule.layer)) {
    const w = Math.min(g.rect.xh - g.rect.xl, g.rect.yh - g.rect.yl);
    if (w < rule.min) {
      out.push({
        ruleName: rule.name ?? `min_width/${rule.layer}`,
        kind: rule.kind, layer: rule.layer, severity: 'error',
        message: `width ${w.toFixed(4)} < ${rule.min} on ${rule.layer}`,
        geometries: [g.id],
      });
    }
  }
  return out;
}

function checkMinSpacing(rule: Extract<DrcRule, { kind: 'min_spacing' }>, geoms: Geometry[]): DrcViolation[] {
  const out: DrcViolation[] = [];
  const arr = onLayer(geoms, rule.layer);
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const d = rectGap(arr[i].rect, arr[j].rect);
      if (d < rule.min && !rectsOverlap(arr[i].rect, arr[j].rect)) {
        out.push({
          ruleName: rule.name ?? `min_spacing/${rule.layer}`,
          kind: rule.kind, layer: rule.layer, severity: 'error',
          message: `spacing ${d.toFixed(4)} < ${rule.min}`,
          geometries: [arr[i].id, arr[j].id],
        });
      }
    }
  }
  return out;
}

function checkMinArea(rule: Extract<DrcRule, { kind: 'min_area' }>, geoms: Geometry[]): DrcViolation[] {
  const out: DrcViolation[] = [];
  for (const g of onLayer(geoms, rule.layer)) {
    const a = (g.rect.xh - g.rect.xl) * (g.rect.yh - g.rect.yl);
    if (a < rule.min) {
      out.push({
        ruleName: rule.name ?? `min_area/${rule.layer}`,
        kind: rule.kind, layer: rule.layer, severity: 'warning',
        message: `area ${a.toFixed(4)} < ${rule.min} on ${rule.layer}`,
        geometries: [g.id],
      });
    }
  }
  return out;
}

function checkEnclosure(rule: Extract<DrcRule, { kind: 'enclosure' }>, geoms: Geometry[]): DrcViolation[] {
  const out: DrcViolation[] = [];
  const inners = onLayer(geoms, rule.inner);
  const outers = onLayer(geoms, rule.outer);
  for (const inner of inners) {
    // For each inner shape, at least one outer must fully enclose it with
    // margin rule.min on every side.
    const ok = outers.some(o => rectEnclosesWithMargin(o.rect, inner.rect, rule.min));
    if (!ok) {
      out.push({
        ruleName: rule.name ?? `enclosure/${rule.inner}⊂${rule.outer}`,
        kind: rule.kind, severity: 'error',
        message: `${rule.inner} "${inner.id}" not enclosed by ${rule.outer} with margin ${rule.min}`,
        geometries: [inner.id],
      });
    }
  }
  return out;
}

function checkDensity(rule: Extract<DrcRule, { kind: 'density' }>, geoms: Geometry[]): DrcViolation[] {
  const out: DrcViolation[] = [];
  const arr = onLayer(geoms, rule.layer);
  if (arr.length === 0) return out;
  // Overall bounding box.
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (const g of arr) {
    if (g.rect.xl < xMin) xMin = g.rect.xl;
    if (g.rect.yl < yMin) yMin = g.rect.yl;
    if (g.rect.xh > xMax) xMax = g.rect.xh;
    if (g.rect.yh > yMax) yMax = g.rect.yh;
  }
  const w = rule.window;
  for (let y = yMin; y < yMax; y += w) {
    for (let x = xMin; x < xMax; x += w) {
      const win: Rect = { xl: x, yl: y, xh: x + w, yh: y + w };
      let covered = 0;
      for (const g of arr) {
        const o = rectOverlapArea(g.rect, win);
        covered += o;
      }
      const dens = covered / (w * w);
      if (dens < rule.min || dens > rule.max) {
        out.push({
          ruleName: rule.name ?? `density/${rule.layer}`,
          kind: rule.kind, layer: rule.layer, severity: 'warning',
          message: `density ${(dens * 100).toFixed(1)}% outside [${rule.min*100}%, ${rule.max*100}%] at window (${x},${y})`,
          geometries: [],
        });
      }
    }
  }
  return out;
}

function checkExtension(rule: Extract<DrcRule, { kind: 'extension' }>, geoms: Geometry[]): DrcViolation[] {
  const out: DrcViolation[] = [];
  const wires = onLayer(geoms, rule.layer);
  const pads  = onLayer(geoms, rule.over);
  for (const w of wires) {
    for (const pad of pads) {
      if (!rectsOverlap(w.rect, pad.rect)) continue;
      // The wire has to extend past the pad on some side by rule.min.
      const left   = pad.rect.xl - w.rect.xl;
      const right  = w.rect.xh - pad.rect.xh;
      const bottom = pad.rect.yl - w.rect.yl;
      const top    = w.rect.yh - pad.rect.yh;
      const maxExt = Math.max(left, right, bottom, top);
      if (maxExt < rule.min) {
        out.push({
          ruleName: rule.name ?? `extension/${rule.layer}→${rule.over}`,
          kind: rule.kind, layer: rule.layer, severity: 'error',
          message: `extension ${maxExt.toFixed(4)} < ${rule.min} between ${w.id} and ${pad.id}`,
          geometries: [w.id, pad.id],
        });
      }
    }
  }
  return out;
}

/* --------------------------------------------------------------------- */
/* Rect helpers                                                           */
/* --------------------------------------------------------------------- */

function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.xl, b.xl) - Math.min(a.xh, b.xh));
  const dy = Math.max(0, Math.max(a.yl, b.yl) - Math.min(a.yh, b.yh));
  return Math.sqrt(dx * dx + dy * dy);
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.xh <= b.xl || b.xh <= a.xl || a.yh <= b.yl || b.yh <= a.yl);
}

function rectOverlapArea(a: Rect, b: Rect): number {
  const w = Math.max(0, Math.min(a.xh, b.xh) - Math.max(a.xl, b.xl));
  const h = Math.max(0, Math.min(a.yh, b.yh) - Math.max(a.yl, b.yl));
  return w * h;
}

function rectEnclosesWithMargin(outer: Rect, inner: Rect, m: number): boolean {
  return (inner.xl - outer.xl) >= m
      && (outer.xh - inner.xh) >= m
      && (inner.yl - outer.yl) >= m
      && (outer.yh - inner.yh) >= m;
}

/* --------------------------------------------------------------------- */
/* Convenience: load/validate a deck from JSON                            */
/* --------------------------------------------------------------------- */

export function parseRuleDeck(raw: string | object): RuleDeck {
  const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!obj || typeof obj !== 'object') throw new Error('rule deck: expected object');
  if (typeof (obj as any).name !== 'string') throw new Error('rule deck: missing name');
  if (typeof (obj as any).technology !== 'string') throw new Error('rule deck: missing technology');
  if (!Array.isArray((obj as any).rules)) throw new Error('rule deck: rules must be an array');
  // Each rule's `kind` is validated implicitly at runtime.
  return obj as RuleDeck;
}
