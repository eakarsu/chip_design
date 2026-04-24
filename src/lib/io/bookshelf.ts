/**
 * Bookshelf format parser (ISPD placement benchmarks).
 *
 * The classic 5-file format the academic placement community has used since
 * the early 2000s:
 *
 *   design.aux    — index file pointing at the others
 *   design.nodes  — list of cells (id, width, height, optional terminal flag)
 *   design.nets   — list of nets, each with the connected pins
 *   design.pl     — initial placement (id, x, y, optional orientation)
 *   design.scl    — row template (we ignore — only needed by legalizers)
 *   design.shapes — non-rect macros (we ignore for the demo)
 *
 * We expose two entry points:
 *   - `parseBookshelfBundle(files)` — caller passes a map of all files
 *   - per-section `parseNodes` / `parseNets` / `parsePl` for unit testing
 *
 * The minimum subset that makes our placer happy is .nodes + .nets; .pl is
 * optional (without it, cells start unplaced).
 */

import type { Cell, Net } from '@/types/algorithms';

export interface BookshelfFiles {
  /** Optional .aux text — used to discover sibling filenames. */
  aux?: string;
  nodes: string;
  nets: string;
  pl?: string;
}

export interface BookshelfDesign {
  cells: Cell[];
  nets: Net[];
  /** Number of nodes flagged `terminal` (fixed, used as I/O pads). */
  terminalCount: number;
}

/* --------------------------------------------------------------------- */
/* Per-section parsers                                                    */
/* --------------------------------------------------------------------- */

export interface NodeRecord {
  id: string;
  width: number;
  height: number;
  terminal: boolean;
}

export function parseNodes(text: string): NodeRecord[] {
  const out: NodeRecord[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('UCLA')
        || line.startsWith('NumNodes') || line.startsWith('NumTerminals')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const [id, w, h, ...rest] = parts;
    out.push({
      id,
      width: parseFloat(w),
      height: parseFloat(h),
      terminal: rest.some(t => t.toLowerCase().startsWith('terminal')),
    });
  }
  return out;
}

export interface NetRecord {
  id: string;
  pins: { node: string; pinName: string; offsetX: number; offsetY: number }[];
}

export function parseNets(text: string): NetRecord[] {
  const out: NetRecord[] = [];
  const lines = text.split('\n').map(l => l.trim());
  let i = 0;
  let netCount = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || line.startsWith('#') || line.startsWith('UCLA') || line.startsWith('NumPins')) {
      i++; continue;
    }
    const m = line.match(/^NetDegree\s*:?\s*(\d+)(?:\s+(\S+))?/);
    if (m) {
      const degree = parseInt(m[1], 10);
      const id = m[2] ?? `net_${netCount}`;
      netCount++;
      const pins: NetRecord['pins'] = [];
      for (let k = 0; k < degree && i + 1 + k < lines.length; k++) {
        const pl = lines[i + 1 + k];
        if (!pl || pl.startsWith('#')) { k--; i++; continue; }
        // Format: nodeId I/O[: offX offY]
        const tok = pl.split(/\s+/);
        const node = tok[0];
        const dir = (tok[1] ?? 'I').toUpperCase();
        const pinName = dir.startsWith('O') ? 'O' : 'I';
        // Offsets sometimes appear after `:`
        const colonIdx = tok.findIndex(t => t === ':');
        const offX = colonIdx >= 0 && tok[colonIdx + 1] ? parseFloat(tok[colonIdx + 1]) : 0;
        const offY = colonIdx >= 0 && tok[colonIdx + 2] ? parseFloat(tok[colonIdx + 2]) : 0;
        pins.push({ node, pinName, offsetX: offX, offsetY: offY });
      }
      out.push({ id, pins });
      i += 1 + degree;
    } else {
      i++;
    }
  }
  return out;
}

export interface PlRecord {
  id: string;
  x: number;
  y: number;
  fixed: boolean;
}

export function parsePl(text: string): Map<string, PlRecord> {
  const out = new Map<string, PlRecord>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('UCLA')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const [id, x, y, ...rest] = parts;
    out.set(id, {
      id,
      x: parseFloat(x),
      y: parseFloat(y),
      fixed: rest.some(t => /\/FIXED|FIXED|\/N/.test(t)) ? true : false,
    });
  }
  return out;
}

/* --------------------------------------------------------------------- */
/* Bundle → engine types                                                  */
/* --------------------------------------------------------------------- */

export function parseBookshelfBundle(files: BookshelfFiles): BookshelfDesign {
  const nodes = parseNodes(files.nodes);
  const nets = parseNets(files.nets);
  const pl = files.pl ? parsePl(files.pl) : new Map<string, PlRecord>();

  // Figure out, per node, what pin IDs we need to materialize from net membership.
  const pinsByNode = new Map<string, { id: string; name: string; ox: number; oy: number; dir: 'input' | 'output' }[]>();
  let pinSeq = 0;
  for (const net of nets) {
    for (const p of net.pins) {
      const arr = pinsByNode.get(p.node) ?? [];
      const pinId = `${p.node}/p${pinSeq++}`;
      arr.push({
        id: pinId,
        name: p.pinName,
        ox: p.offsetX,
        oy: p.offsetY,
        dir: p.pinName.startsWith('O') ? 'output' : 'input',
      });
      pinsByNode.set(p.node, arr);
      // Replace text reference with pin id for net assembly below.
      (p as any)._pinId = pinId;
    }
  }

  const cells: Cell[] = nodes.map(n => {
    const placement = pl.get(n.id);
    return {
      id: n.id,
      name: n.id,
      width: n.width,
      height: n.height,
      position: placement ? { x: placement.x, y: placement.y } : undefined,
      pins: (pinsByNode.get(n.id) ?? []).map(p => ({
        id: p.id, name: p.name,
        position: { x: p.ox, y: p.oy },
        direction: p.dir,
      })),
      type: n.terminal ? 'io' : 'standard',
    };
  });

  const outNets: Net[] = nets.map(n => ({
    id: n.id,
    name: n.id,
    pins: n.pins.map(p => (p as any)._pinId as string),
    weight: 1,
  }));

  return {
    cells,
    nets: outNets,
    terminalCount: nodes.filter(n => n.terminal).length,
  };
}
