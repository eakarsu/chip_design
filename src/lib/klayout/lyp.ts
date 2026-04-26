/**
 * KLayout layer-properties (.lyp) parser.
 *
 * .lyp is XML. The shape we parse:
 *
 *   <layer-properties>
 *     <properties>
 *       <frame-color>#ff0000</frame-color>
 *       <fill-color>#ff8080</fill-color>
 *       <frame-brightness>0</frame-brightness>
 *       <fill-brightness>0</fill-brightness>
 *       <dither-pattern>I0</dither-pattern>
 *       <line-style/>
 *       <valid>true</valid>
 *       <visible>true</visible>
 *       <transparent>false</transparent>
 *       <width/>
 *       <marked>false</marked>
 *       <xfill>false</xfill>
 *       <animation>0</animation>
 *       <name>met1 - drawing</name>
 *       <source>68/20@1</source>
 *     </properties>
 *     ... more <properties> blocks ...
 *   </layer-properties>
 *
 * The `<source>` field encodes the GDSII layer/datatype as
 * `<layer>/<datatype>@<cellview>` (cellview is usually 1 — we ignore it).
 *
 * We use a tiny dependency-free XML parser tuned to KLayout's exact
 * structure. Real-world .lyp files also support <group-members> for
 * hierarchical groups; we flatten them into a list of leaf entries plus
 * carry the group path in `groupPath`.
 */

export interface LypLayer {
  /** Display name as authored. */
  name: string;
  /** GDSII layer number (parsed from <source>). 0 if unspecified. */
  layer: number;
  /** GDSII datatype number. 0 if unspecified. */
  datatype: number;
  /** "#rrggbb" or undefined if KLayout used the default (auto-pick on load). */
  fillColor?: string;
  frameColor?: string;
  visible: boolean;
  valid: boolean;
  transparent: boolean;
  /** Stipple pattern key (e.g. "I0", "I3", "C5"). Optional. */
  ditherPattern?: string;
  /** Group breadcrumbs ("Drawing/Metal1") when nested. */
  groupPath?: string[];
}

export interface LypFile {
  layers: LypLayer[];
}

/**
 * Parse a `.lyp` blob. Tolerates pretty-printed and minified inputs.
 * Throws only if the document isn't recognisable XML — unknown tags are
 * skipped silently because KLayout adds new fields between releases.
 */
export function parseLyp(xml: string): LypFile {
  const layers: LypLayer[] = [];
  // Strip XML declaration and DOCTYPE to simplify the regex pass.
  const cleaned = xml.replace(/<\?xml[^?]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/g, '');
  walk(cleaned, [], layers);
  return { layers };
}

/** Recursively walk <properties> nodes (and group nesting via
 *  <group-members>). Scope-stack tracks the group path.
 *
 *  Hand-rolled because non-greedy regex matching breaks on nested
 *  <properties> (group entries contain leaf entries with the same tag). */
function walk(xml: string, group: string[], out: LypLayer[]): void {
  for (const { inner } of topLevelBlocks(xml, 'properties')) {
    const gmInner = innerOf(inner, 'group-members');
    if (gmInner !== null) {
      const groupName = immediateText(inner, 'name') ?? '';
      const next = groupName ? [...group, groupName] : group;
      walk(gmInner, next, out);
      continue;
    }
    out.push(extractLayer(inner, group));
  }
}

/** Yield contents of every <tag>…</tag> block found at the *outer* depth
 *  in `xml`, respecting same-name nesting. */
function topLevelBlocks(xml: string, tag: string): { inner: string }[] {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const out: { inner: string }[] = [];
  let i = 0;
  while (i < xml.length) {
    const start = xml.indexOf(open, i);
    if (start < 0) break;
    let depth = 1;
    let cursor = start + open.length;
    while (depth > 0 && cursor < xml.length) {
      const nextOpen  = xml.indexOf(open, cursor);
      const nextClose = xml.indexOf(close, cursor);
      if (nextClose < 0) return out; // malformed — stop early
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth++;
        cursor = nextOpen + open.length;
      } else {
        depth--;
        if (depth === 0) {
          out.push({ inner: xml.slice(start + open.length, nextClose) });
        }
        cursor = nextClose + close.length;
      }
    }
    i = cursor;
  }
  return out;
}

/** Pull the contents of the *first* <tag> block. Returns null if absent. */
function innerOf(xml: string, tag: string): string | null {
  const blocks = topLevelBlocks(xml, tag);
  return blocks.length > 0 ? blocks[0].inner : null;
}

/** First-immediate-child text content of `tag`, ignoring <group-members>
 *  contents. Used for fields that are simple leaf strings. */
function immediateText(xml: string, tag: string): string | null {
  // Scan for the tag before any <group-members> opener.
  const gm = xml.indexOf('<group-members>');
  const search = gm >= 0 ? xml.slice(0, gm) : xml;
  const open = search.indexOf(`<${tag}>`);
  if (open === -1) return null;
  const close = search.indexOf(`</${tag}>`, open);
  if (close === -1) return null;
  return search.slice(open + tag.length + 2, close).trim();
}

function extractLayer(inner: string, group: string[]): LypLayer {
  const name = immediateText(inner, 'name') ?? '';
  const source = immediateText(inner, 'source') ?? '';
  const { layer, datatype } = parseSource(source);
  return {
    name: name || (source || 'unnamed'),
    layer,
    datatype,
    fillColor:    immediateText(inner, 'fill-color')  || undefined,
    frameColor:   immediateText(inner, 'frame-color') || undefined,
    visible:      boolOf(inner, 'visible',     true),
    valid:        boolOf(inner, 'valid',       true),
    transparent:  boolOf(inner, 'transparent', false),
    ditherPattern: immediateText(inner, 'dither-pattern') || undefined,
    groupPath: group.length > 0 ? group.slice() : undefined,
  };
}

function boolOf(xml: string, tag: string, dflt: boolean): boolean {
  const v = immediateText(xml, tag);
  if (v === null) return dflt;
  return v.toLowerCase() === 'true';
}

/** Source format: "<layer>/<datatype>@<cellview>" or "<layer>/<datatype>"
 *  or "*" (any). We tolerate stars and partial forms. */
function parseSource(s: string): { layer: number; datatype: number } {
  if (!s || s === '*' || s === '*/*') return { layer: 0, datatype: 0 };
  const at = s.indexOf('@');
  const head = at >= 0 ? s.slice(0, at) : s;
  const slash = head.indexOf('/');
  if (slash < 0) {
    const n = Number(head);
    return { layer: Number.isFinite(n) ? n : 0, datatype: 0 };
  }
  const l = Number(head.slice(0, slash));
  const d = Number(head.slice(slash + 1));
  return {
    layer: Number.isFinite(l) ? l : 0,
    datatype: Number.isFinite(d) ? d : 0,
  };
}

/** Build a key matching how the viewer indexes layer/datatype tuples. */
export function lypKey(layer: number, datatype: number): string {
  return `${layer}/${datatype}`;
}

/** Build a default `LypLayer` for a (layer, datatype) the .lyp file
 *  didn't mention — auto-picks a colour from a small palette so the
 *  viewer never falls back to grey-on-grey. */
export function defaultLypEntry(layer: number, datatype: number): LypLayer {
  const palette = [
    '#42a5f5', '#66bb6a', '#ffa726', '#ab47bc',
    '#ef5350', '#26c6da', '#ec407a', '#9ccc65',
  ];
  const fill = palette[(layer + datatype) % palette.length];
  return {
    name: `${layer}/${datatype}`,
    layer, datatype,
    fillColor: fill,
    frameColor: fill,
    visible: true, valid: true, transparent: false,
  };
}
