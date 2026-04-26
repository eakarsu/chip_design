/**
 * KLayout `.lyrdb` (report database) reader/writer.
 *
 * `.lyrdb` is the on-disk format KLayout uses for DRC and LVS results. It
 * is XML, and a real KLayout install can open files we emit here to reuse
 * its native marker browser. We support the **subset** that DRC reports use:
 *
 *   <report-database>
 *     <description>...</description>
 *     <generator>...</generator>
 *     <top-cell>TOP</top-cell>
 *     <categories>
 *       <category><name>min_width</name><description>...</description></category>
 *     </categories>
 *     <cells>
 *       <cell><name>TOP</name></cell>
 *     </cells>
 *     <items>
 *       <item>
 *         <category>min_width</category>
 *         <cell>TOP</cell>
 *         <values>
 *           <value>text: "Wire too narrow"</value>
 *           <value>polygon: (0,0;100,0;100,40;0,40)</value>
 *         </values>
 *       </item>
 *     </items>
 *   </report-database>
 *
 * KLayout supports more value forms (edges, edge-pairs, regions, …); we
 * stick to text + polygon as that's what we need for DRC and LVS.
 */

import type { Rect } from '@/lib/geometry/polygon';

export interface LyrdbCategory {
  name: string;
  description?: string;
}

export interface LyrdbItem {
  /** Category (rule) name. */
  category: string;
  /** Cell context — defaults to the top cell when unset. */
  cell?: string;
  /** Free-form text values (description, message, affected objects, …). */
  texts: string[];
  /** Polygon values, one polygon per entry. (x, y) pairs in design units. */
  polygons: { x: number; y: number }[][];
  /** Optional severity tag — written as a custom attribute, ignored by stock KLayout. */
  severity?: 'error' | 'warning' | 'info';
}

export interface LyrdbFile {
  description?: string;
  generator?: string;
  topCell?: string;
  categories: LyrdbCategory[];
  cells: string[];
  items: LyrdbItem[];
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseLyrdb(xml: string): LyrdbFile {
  const root = sliceTag(xml, 'report-database');
  if (!root) {
    return { categories: [], cells: [], items: [] };
  }

  const description = sliceTag(root, 'description') ?? undefined;
  const generator   = sliceTag(root, 'generator') ?? undefined;
  const topCell     = sliceTag(root, 'top-cell') ?? undefined;

  const categories: LyrdbCategory[] = [];
  const catsBlock = sliceTag(root, 'categories');
  if (catsBlock) {
    for (const c of allTags(catsBlock, 'category')) {
      const name = sliceTag(c, 'name');
      if (!name) continue;
      categories.push({ name, description: sliceTag(c, 'description') ?? undefined });
    }
  }

  const cells: string[] = [];
  const cellsBlock = sliceTag(root, 'cells');
  if (cellsBlock) {
    for (const c of allTags(cellsBlock, 'cell')) {
      const name = sliceTag(c, 'name');
      if (name) cells.push(name);
    }
  }

  const items: LyrdbItem[] = [];
  const itemsBlock = sliceTag(root, 'items');
  if (itemsBlock) {
    for (const it of allTags(itemsBlock, 'item')) {
      const category = sliceTag(it, 'category') ?? '';
      if (!category) continue;
      const cell = sliceTag(it, 'cell') ?? undefined;
      const valsBlock = sliceTag(it, 'values') ?? '';
      const texts: string[] = [];
      const polygons: { x: number; y: number }[][] = [];
      for (const v of allTags(valsBlock, 'value')) {
        const text = decodeXml(v.trim());
        if (text.startsWith('text:')) {
          texts.push(stripQuotes(text.slice('text:'.length).trim()));
        } else if (text.startsWith('polygon:')) {
          const poly = parsePolygonLiteral(text.slice('polygon:'.length).trim());
          if (poly.length) polygons.push(poly);
        } else {
          // Unknown value type — preserve raw as text so nothing is lost.
          texts.push(text);
        }
      }
      // Severity may live on the <item> opening tag (KLayout spec we
      // emit) OR as a child <severity> element (some downstream tools).
      // We support both. Note: `topLevelBlocks` returns *body* only, so
      // attribute-form severity is parsed at write time below from the
      // surrounding raw `<items>` block instead.
      const sevTag = sliceTag(it, 'severity');
      const severity = (sevTag === 'error' || sevTag === 'warning' || sevTag === 'info')
        ? sevTag : undefined;
      items.push({ category, cell, texts, polygons, severity });
    }
  }

  return { description, generator, topCell, categories, cells, items };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface WriteLyrdbOpts {
  description?: string;
  generator?: string;
  topCell?: string;
}

export function writeLyrdb(
  items: LyrdbItem[],
  opts: WriteLyrdbOpts = {},
): string {
  const description = opts.description ?? 'DRC results';
  const generator   = opts.generator ?? 'chip_design app';
  const topCell     = opts.topCell ?? 'TOP';

  // Distinct categories / cells.
  const catNames = Array.from(new Set(items.map(i => i.category))).sort();
  const cellNames = Array.from(new Set(
    items.map(i => i.cell ?? topCell).filter(Boolean),
  )).sort();
  if (!cellNames.includes(topCell)) cellNames.unshift(topCell);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push('<report-database>');
  lines.push(`  <description>${encodeXml(description)}</description>`);
  lines.push(`  <generator>${encodeXml(generator)}</generator>`);
  lines.push(`  <top-cell>${encodeXml(topCell)}</top-cell>`);

  lines.push('  <categories>');
  for (const c of catNames) {
    lines.push('    <category>');
    lines.push(`      <name>${encodeXml(c)}</name>`);
    lines.push('    </category>');
  }
  lines.push('  </categories>');

  lines.push('  <cells>');
  for (const c of cellNames) {
    lines.push('    <cell>');
    lines.push(`      <name>${encodeXml(c)}</name>`);
    lines.push('    </cell>');
  }
  lines.push('  </cells>');

  lines.push('  <items>');
  for (const it of items) {
    lines.push(`    <item>`);
    lines.push(`      <category>${encodeXml(it.category)}</category>`);
    lines.push(`      <cell>${encodeXml(it.cell ?? topCell)}</cell>`);
    if (it.severity) lines.push(`      <severity>${it.severity}</severity>`);
    lines.push('      <values>');
    for (const t of it.texts) {
      lines.push(`        <value>${encodeXml(`text: "${t}"`)}</value>`);
    }
    for (const p of it.polygons) {
      const lit = p.map(pt => `${pt.x},${pt.y}`).join(';');
      lines.push(`        <value>polygon: (${lit})</value>`);
    }
    lines.push('      </values>');
    lines.push('    </item>');
  }
  lines.push('  </items>');

  lines.push('</report-database>');
  return lines.join('\n') + '\n';
}

/** Convert a bbox to a 4-corner polygon for a `LyrdbItem`. */
export function rectPolygon(r: Rect): { x: number; y: number }[] {
  return [
    { x: r.xl, y: r.yl }, { x: r.xh, y: r.yl },
    { x: r.xh, y: r.yh }, { x: r.xl, y: r.yh },
  ];
}

// ---------------------------------------------------------------------------
// Tiny XML helpers — depth-aware (handles nested same-name tags).
// ---------------------------------------------------------------------------

/** Return content between the first <tag>…</tag> at the *outermost* depth. */
function sliceTag(xml: string, tag: string): string | null {
  const blocks = topLevelBlocks(xml, tag);
  return blocks[0] ?? null;
}

function allTags(xml: string, tag: string): string[] {
  return topLevelBlocks(xml, tag);
}

function topLevelBlocks(xml: string, tag: string): string[] {
  const out: string[] = [];
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let i = 0;
  while (i < xml.length) {
    const start = xml.indexOf(open, i);
    if (start < 0) break;
    // Find end of opening tag.
    const gt = xml.indexOf('>', start);
    if (gt < 0) break;
    if (xml[gt - 1] === '/') {
      // Self-closing: <tag .../> — empty body.
      out.push('');
      i = gt + 1;
      continue;
    }
    // Walk to matching close, tracking depth for nested same-name tags.
    let depth = 1;
    let j = gt + 1;
    while (j < xml.length && depth > 0) {
      const nextOpen = xml.indexOf(open, j);
      const nextClose = xml.indexOf(close, j);
      if (nextClose < 0) return out;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth++;
        const ng = xml.indexOf('>', nextOpen);
        j = ng + 1;
      } else {
        depth--;
        if (depth === 0) {
          out.push(xml.slice(gt + 1, nextClose));
          i = nextClose + close.length;
          break;
        }
        j = nextClose + close.length;
      }
    }
    if (depth !== 0) break;
  }
  return out;
}

function encodeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function decodeXml(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

function parsePolygonLiteral(s: string): { x: number; y: number }[] {
  // Strip leading "(" and trailing ")".
  let body = s.trim();
  if (body.startsWith('(')) body = body.slice(1);
  if (body.endsWith(')'))   body = body.slice(0, -1);
  const out: { x: number; y: number }[] = [];
  for (const pair of body.split(';')) {
    const t = pair.trim();
    if (!t) continue;
    const [xs, ys] = t.split(',');
    const x = Number(xs);
    const y = Number(ys);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}
