'use client';

/**
 * KLayout-style layout viewer page.
 *
 * Combines all six newly-added pieces:
 *   - GDSII reader (file upload)
 *   - Polygon flatten + boolean engine
 *   - Layer panel + .lyp parser (file upload)
 *   - Canvas renderer with pan/zoom
 *   - DRC marker viewer with jump-to-marker
 *   - Boolean-op tool (NOT/AND/OR/XOR/SIZE) between two selected layers
 *
 * Strict client-only — file IO uses the browser File API, no server roundtrip.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Tab, Tabs,
  Divider, IconButton, Tooltip, MenuItem, Select, TextField, Snackbar,
  FormControlLabel, Switch,
} from '@mui/material';
import { UploadFile, Save, FitScreen, Layers as LayersIcon, BugReport, FunctionsOutlined, Straighten, Clear, AccountTree, MyLocation, GridOn, Assessment } from '@mui/icons-material';

import { readGds } from '@/lib/gds/reader';
import { writeGds } from '@/lib/gds/writer';
import type { GdsLibrary } from '@/lib/gds/types';
import { flattenLibrary, buildCellHierarchy, type FlatLayout, type CellHierarchyNode } from '@/lib/klayout/flatten';
import { parseLyp, defaultLypEntry, lypKey, type LypLayer } from '@/lib/klayout/lyp';
import { runDrc, type RuleDeck, type Geometry, type DrcViolation } from '@/lib/algorithms/drc_ruledeck';
import { parseLyrdb, writeLyrdb, rectPolygon, type LyrdbItem } from '@/lib/klayout/lyrdb';
import { defToFlat, pickNetAt, type DefToFlatResult } from '@/lib/klayout/defToFlat';
import { computeDensity, densityColor, type DensityResult } from '@/lib/klayout/density';
import { computeLayerStats } from '@/lib/klayout/stats';
import { parseDef } from '@/lib/parsers/def';
import { parseLef } from '@/lib/parsers/lef';
import { boolRects, sizeRects, rectsArea, type Rect, type BoolOp } from '@/lib/geometry/polygon';

import GdsCanvas, { type ViewBox, type RulerState } from '@/components/klayout/GdsCanvas';
import LayerPanel from '@/components/klayout/LayerPanel';
import DrcMarkerViewer, { type MarkerSelection, violationKey } from '@/components/klayout/DrcMarkerViewer';
import CellHierarchyTree from '@/components/klayout/CellHierarchyTree';

// --- Built-in demo design (so the page is useful before any upload) -------

function demoLibrary(): GdsLibrary {
  return {
    libname: 'DEMO',
    version: 600,
    units: { userPerDb: 1e-3, metersPerDb: 1e-9 },
    structures: [
      {
        name: 'TOP',
        elements: [
          // Active (layer 1) — three transistor-like rectangles with a
          // close-spacing pair to trigger min_spacing DRC.
          { type: 'boundary', layer: 1, datatype: 0, points: rect(0, 0, 200, 100) },
          { type: 'boundary', layer: 1, datatype: 0, points: rect(220, 0, 420, 100) },
          { type: 'boundary', layer: 1, datatype: 0, points: rect(421, 0, 600, 100) }, // 1µm gap → DRC fail
          // Poly (layer 2) crossing
          { type: 'boundary', layer: 2, datatype: 0, points: rect(80, -40, 110, 140) },
          { type: 'boundary', layer: 2, datatype: 0, points: rect(300, -40, 330, 140) },
          // Met1 (layer 3)
          { type: 'boundary', layer: 3, datatype: 0, points: rect(0, 200, 800, 250) },
          { type: 'boundary', layer: 3, datatype: 0, points: rect(0, 280, 800, 330) },
          // Path on Met2 (layer 4)
          { type: 'path', layer: 4, datatype: 0, pathtype: 0, width: 30,
            points: [{ x: 0, y: 400 }, { x: 800, y: 400 }] },
          // Sub-cell instance
          { type: 'sref', sname: 'CONTACT', origin: { x: 200, y: 50 } },
          { type: 'sref', sname: 'CONTACT', origin: { x: 420, y: 50 } },
        ],
      },
      {
        name: 'CONTACT',
        elements: [
          { type: 'boundary', layer: 5, datatype: 0, points: rect(-10, -10, 10, 10) },
        ],
      },
    ],
  };
}

function rect(xl: number, yl: number, xh: number, yh: number) {
  return [
    { x: xl, y: yl }, { x: xh, y: yl },
    { x: xh, y: yh }, { x: xl, y: yh },
    { x: xl, y: yl },
  ];
}

/** Single inverter (1 NMOS + 1 PMOS) standard cell. */
function inverterLibrary(): GdsLibrary {
  return {
    libname: 'INV',
    version: 600,
    units: { userPerDb: 1e-3, metersPerDb: 1e-9 },
    structures: [{
      name: 'INV_X1',
      elements: [
        // N-active (layer 1) bottom diffusion
        { type: 'boundary', layer: 1, datatype: 0, points: rect(0,    0,   200, 100) },
        // P-active (layer 1) top diffusion
        { type: 'boundary', layer: 1, datatype: 0, points: rect(0,  200,   200, 300) },
        // Poly gate (layer 2) shared between PMOS/NMOS
        { type: 'boundary', layer: 2, datatype: 0, points: rect(80, -30,  120, 330) },
        // Met1 (layer 3) input + output rails
        { type: 'boundary', layer: 3, datatype: 0, points: rect(-30, -30, 30,  330) }, // IN rail
        { type: 'boundary', layer: 3, datatype: 0, points: rect(170, -30, 230, 330) }, // OUT rail
        // VDD/VSS (Met2 layer 4) horizontal rails
        { type: 'boundary', layer: 4, datatype: 0, points: rect(-50, -60, 250, -40) }, // VSS
        { type: 'boundary', layer: 4, datatype: 0, points: rect(-50, 340, 250, 360) }, // VDD
        // Contacts (layer 5)
        { type: 'boundary', layer: 5, datatype: 0, points: rect(  0,  20,  20,  40) },
        { type: 'boundary', layer: 5, datatype: 0, points: rect(180,  20, 200,  40) },
        { type: 'boundary', layer: 5, datatype: 0, points: rect(  0, 240,  20, 260) },
        { type: 'boundary', layer: 5, datatype: 0, points: rect(180, 240, 200, 260) },
      ],
    }],
  };
}

/** 2-input NAND gate. Two pull-down NMOS in series, two pull-up PMOS in parallel. */
function nand2Library(): GdsLibrary {
  return {
    libname: 'NAND2',
    version: 600,
    units: { userPerDb: 1e-3, metersPerDb: 1e-9 },
    structures: [{
      name: 'NAND2_X1',
      elements: [
        // N-diff (single bar both fingers share)
        { type: 'boundary', layer: 1, datatype: 0, points: rect(0,   0,   400, 100) },
        // P-diff
        { type: 'boundary', layer: 1, datatype: 0, points: rect(0, 200,   400, 300) },
        // Two poly fingers
        { type: 'boundary', layer: 2, datatype: 0, points: rect(80, -30, 120, 330) }, // A
        { type: 'boundary', layer: 2, datatype: 0, points: rect(280,-30, 320, 330) }, // B
        // Met1 input rails
        { type: 'boundary', layer: 3, datatype: 0, points: rect(60, -60, 140, -30) }, // A pin
        { type: 'boundary', layer: 3, datatype: 0, points: rect(260,-60, 340, -30) }, // B pin
        // Met1 output (between fingers, jumps to top diff)
        { type: 'boundary', layer: 3, datatype: 0, points: rect(170, 80, 230, 220) },
        // VDD/VSS rails (Met2)
        { type: 'boundary', layer: 4, datatype: 0, points: rect(-50, -90, 450, -70) },
        { type: 'boundary', layer: 4, datatype: 0, points: rect(-50, 340, 450, 360) },
        // Contacts
        { type: 'boundary', layer: 5, datatype: 0, points: rect( 20,  30, 60, 70) },
        { type: 'boundary', layer: 5, datatype: 0, points: rect(160, 30, 200, 70) },
        { type: 'boundary', layer: 5, datatype: 0, points: rect(340, 30, 380, 70) },
        { type: 'boundary', layer: 5, datatype: 0, points: rect( 20, 230, 60, 270) },
        { type: 'boundary', layer: 5, datatype: 0, points: rect(180, 230, 220, 270) },
        { type: 'boundary', layer: 5, datatype: 0, points: rect(340, 230, 380, 270) },
      ],
    }],
  };
}

/** 6T SRAM bit-cell — two cross-coupled inverters + 2 access transistors. */
function sramCellLibrary(): GdsLibrary {
  const inv = (xOff: number) => ([
    // n-diff
    { type: 'boundary' as const, layer: 1, datatype: 0, points: rect(xOff,    0, xOff+80, 100) },
    // p-diff
    { type: 'boundary' as const, layer: 1, datatype: 0, points: rect(xOff,  200, xOff+80, 300) },
    // poly gate
    { type: 'boundary' as const, layer: 2, datatype: 0, points: rect(xOff+30, -20, xOff+50, 320) },
  ]);
  return {
    libname: 'SRAM6T',
    version: 600,
    units: { userPerDb: 1e-3, metersPerDb: 1e-9 },
    structures: [{
      name: 'BITCELL',
      elements: [
        ...inv(0),    // INV-L
        ...inv(140),  // INV-R
        // Pass transistors (n-diff + poly word-line)
        { type: 'boundary', layer: 1, datatype: 0, points: rect(-80,  20, -10, 80) },
        { type: 'boundary', layer: 1, datatype: 0, points: rect(230,  20, 300, 80) },
        // Word line (poly across both pass FETs)
        { type: 'boundary', layer: 2, datatype: 0, points: rect(-100, 35, 320, 65) },
        // Bit lines (Met1 vertical)
        { type: 'boundary', layer: 3, datatype: 0, points: rect(-110, -40, -90, 340) }, // BL
        { type: 'boundary', layer: 3, datatype: 0, points: rect(310,  -40, 330, 340) }, // BLB
        // Cross-couple wires (Met1)
        { type: 'boundary', layer: 3, datatype: 0, points: rect(80,  150, 160, 170) },
        // VDD/VSS
        { type: 'boundary', layer: 4, datatype: 0, points: rect(-120, -80, 340, -60) },
        { type: 'boundary', layer: 4, datatype: 0, points: rect(-120, 360, 340, 380) },
        // Contacts (sample)
        { type: 'boundary', layer: 5, datatype: 0, points: rect( 10, 230,  30, 250) },
        { type: 'boundary', layer: 5, datatype: 0, points: rect(150, 230, 170, 250) },
        { type: 'boundary', layer: 5, datatype: 0, points: rect( 10,  40,  30,  60) },
        { type: 'boundary', layer: 5, datatype: 0, points: rect(150,  40, 170,  60) },
      ],
    }],
  };
}

const SAMPLE_LIBS: { key: string; label: string; build: () => GdsLibrary }[] = [
  { key: 'demo',    label: 'Demo (5-layer DRC fail)', build: demoLibrary },
  { key: 'inv',     label: 'Inverter (INV_X1)',       build: inverterLibrary },
  { key: 'nand2',   label: 'NAND2 (NAND2_X1)',        build: nand2Library },
  { key: 'sram',    label: 'SRAM 6T bit-cell',        build: sramCellLibrary },
];

const DEFAULT_DECK: RuleDeck = {
  name: 'demo_drc',
  technology: 'demo',
  rules: [
    { kind: 'min_width',   layer: 'L1', min: 80,  name: 'L1.W.1' },
    { kind: 'min_spacing', layer: 'L1', min: 50,  name: 'L1.S.1' },
    { kind: 'min_area',    layer: 'L3', min: 5000, name: 'L3.A.1' },
  ],
};

export default function KLayoutPage() {
  const [sampleKey, setSampleKey] = useState<string>('demo');
  const [lib, setLib] = useState<GdsLibrary>(() => demoLibrary());
  const [topCell, setTopCell] = useState<string>('TOP');
  const [lypMap, setLypMap] = useState<Map<string, LypLayer>>(new Map());
  const [tab, setTab] = useState<'layers' | 'cells' | 'drc' | 'bool' | 'density' | 'stats'>('layers');
  const [densityResult, setDensityResult] = useState<DensityResult | null>(null);
  const [densityBins, setDensityBins] = useState<number>(40);
  const [densityLayerKey, setDensityLayerKey] = useState<string>('');
  const [densityVisible, setDensityVisible] = useState<boolean>(true);
  const [view, setView] = useState<ViewBox>({ cx: 400, cy: 200, scale: 1 });
  const [tool, setTool] = useState<'pan' | 'ruler' | 'pick'>('pan');
  const [ruler, setRuler] = useState<RulerState | null>(null);
  /** Net selected via pick — name + the rects that belong to it. */
  const [highlightedNet, setHighlightedNet] = useState<{ id: string; rects: Rect[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  /** When the user loads a DEF+LEF pair we render that FlatLayout directly,
   *  bypassing the GDS path. Cleared whenever a fresh GDS is loaded.
   *  Stored as the richer DefToFlatResult so net-pick has access to
   *  netIndex/cellBboxes. */
  const [defFlat, setDefFlat] = useState<DefToFlatResult | null>(null);
  const flat: FlatLayout = useMemo(
    () => defFlat ?? flattenLibrary(lib, topCell),
    [defFlat, lib, topCell],
  );
  const hierarchy: CellHierarchyNode | null = useMemo(
    () => (defFlat ? null : buildCellHierarchy(lib, topCell)),
    [defFlat, lib, topCell],
  );
  const [selectedCellPath, setSelectedCellPath] = useState<string | null>(null);
  const [visible, setVisible] = useState<Set<string>>(() => new Set());

  // When the layout changes, default-on every layer.
  useEffect(() => {
    setVisible(new Set(flat.layers.map(l => lypKey(l.layer, l.datatype))));
    fitToBbox(flat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat.topCell, flat.layers.length]);

  // --- DRC -------------------------------------------------------------------

  const [violations, setViolations] = useState<DrcViolation[]>([]);
  const [highlight, setHighlight] = useState<Rect | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** Bboxes synthesised from imported .lyrdb (parallel to geometryBboxes). */
  const [extraBboxes, setExtraBboxes] = useState<Map<string, Rect>>(new Map());

  // Build a (geometryId → bbox) lookup for marker jump-to. Geometries we
  // hand to runDrc are synthesised from flat layer rects below.
  const geometryBboxes = useMemo(() => {
    const m = new Map<string, Rect>();
    for (const l of flat.layers) {
      l.rects.forEach((r, i) => {
        m.set(`L${l.layer}_${i}`, r);
      });
    }
    // Overlay any imported .lyrdb bboxes.
    for (const [k, v] of extraBboxes) m.set(k, v);
    return m;
  }, [flat, extraBboxes]);

  function runDrcOnFlat() {
    const geoms: Geometry[] = [];
    for (const l of flat.layers) {
      l.rects.forEach((r, i) => {
        geoms.push({ id: `L${l.layer}_${i}`, layer: `L${l.layer}`, rect: r });
      });
    }
    const report = runDrc(DEFAULT_DECK, geoms);
    setViolations(report.violations);
    setTab('drc');
    setInfo(`DRC complete: ${report.violations.length} violations across ${report.geometryCount} geometries`);
  }

  async function onLoadLyrdb(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = parseLyrdb(text);
      // Map each LyrdbItem → DrcViolation. We pull the first text value as
      // the message; affected geometry IDs aren't stored in .lyrdb so we
      // synthesise one per polygon and stash bboxes in `geometryBboxes`
      // through a side-effect map.
      const synthBboxes = new Map<string, Rect>();
      const v: DrcViolation[] = parsed.items.map((it, idx) => {
        const bboxes = it.polygons.map((poly) => {
          const xs = poly.map(p => p.x);
          const ys = poly.map(p => p.y);
          return {
            xl: Math.min(...xs), yl: Math.min(...ys),
            xh: Math.max(...xs), yh: Math.max(...ys),
          };
        });
        const ids = bboxes.map((bb, i) => {
          const id = `LYRDB_${idx}_${i}`;
          synthBboxes.set(id, bb);
          return id;
        });
        return {
          ruleName: it.category,
          kind: 'min_width' as const,           // unknown — pick a placeholder
          severity: it.severity === 'warning' ? 'warning' : 'error',
          message: it.texts[0] ?? '(no message)',
          geometries: ids,
        };
      });
      // Merge synthesised bboxes into the existing lookup. We use a setter
      // callback that returns a fresh Map so React re-renders.
      setExtraBboxes(prev => {
        const next = new Map(prev);
        for (const [k, vbox] of synthBboxes) next.set(k, vbox);
        return next;
      });
      setViolations(v);
      setTab('drc');
      setInfo(`loaded ${v.length} markers from .lyrdb`);
    } catch (e) {
      setError(`.lyrdb parse failed: ${(e as Error).message}`);
    } finally {
      ev.target.value = '';
    }
  }

  function onSaveLyrdb() {
    if (violations.length === 0) {
      setError('No violations to export — run DRC first or load a .lyrdb.');
      return;
    }
    const items: LyrdbItem[] = violations.map(v => {
      const polys = v.geometries
        .map(id => geometryBboxes.get(id) ?? extraBboxes.get(id))
        .filter((r): r is Rect => !!r)
        .map(rectPolygon);
      return {
        category: v.ruleName,
        cell: topCell || 'TOP',
        texts: [v.message, ...v.geometries],
        polygons: polys,
        severity: v.severity,
      };
    });
    const xml = writeLyrdb(items, {
      description: `DRC ${new Date().toISOString()}`,
      generator: 'chip_design app',
      topCell: topCell || 'TOP',
    });
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(topCell || 'design')}.lyrdb`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function selectMarker(sel: MarkerSelection) {
    setHighlight(sel.bbox);
    if (sel.bbox) {
      // Pan & zoom to centre the bbox with some margin.
      const w = sel.bbox.xh - sel.bbox.xl;
      const h = sel.bbox.yh - sel.bbox.yl;
      const span = Math.max(w, h, 1) * 4;
      setView(v => ({ cx: (sel.bbox!.xl + sel.bbox!.xh) / 2, cy: (sel.bbox!.yl + sel.bbox!.yh) / 2, scale: 600 / span }));
    }
    const idx = violations.indexOf(sel.violation);
    setSelectedKey(violationKey(sel.violation, idx));
  }

  // --- Boolean tool ----------------------------------------------------------

  const [boolA, setBoolA] = useState<string>('');
  const [boolB, setBoolB] = useState<string>('');
  const [boolOp, setBoolOp] = useState<BoolOp>('AND');
  const [sizeDelta, setSizeDelta] = useState<number>(10);
  const [boolResultArea, setBoolResultArea] = useState<number | null>(null);

  function runBool() {
    const a = flat.layers.find(l => lypKey(l.layer, l.datatype) === boolA)?.rects ?? [];
    const b = flat.layers.find(l => lypKey(l.layer, l.datatype) === boolB)?.rects ?? [];
    const out = boolRects(a, b, boolOp);
    setBoolResultArea(rectsArea(out));
    setInfo(`${boolOp}(${boolA}, ${boolB}) → ${out.length} rects, area ${rectsArea(out).toFixed(1)} (µm²)`);
  }

  function runSize() {
    const a = flat.layers.find(l => lypKey(l.layer, l.datatype) === boolA)?.rects ?? [];
    const out = sizeRects(a, sizeDelta);
    setBoolResultArea(rectsArea(out));
    setInfo(`SIZE(${boolA}, ${sizeDelta >= 0 ? '+' : ''}${sizeDelta}) → ${out.length} rects, area ${rectsArea(out).toFixed(1)} (µm²)`);
  }

  // --- File handling ---------------------------------------------------------

  async function onLoadGds(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      const parsed = readGds(new Uint8Array(buf), { silent: true });
      setLib(parsed);
      setDefFlat(null);                 // back to GDS mode
      setTopCell(parsed.structures[0]?.name ?? '');
      setError(null);
      setInfo(`loaded ${parsed.libname} — ${parsed.structures.length} cells`);
    } catch (e) {
      setError(`GDS parse failed: ${(e as Error).message}`);
    } finally {
      ev.target.value = '';
    }
  }

  // DEF + LEF loader. The user supplies BOTH files; we keep one in pending
  // state until the second arrives and then build the FlatLayout in one
  // shot. Cleared by loading a fresh GDS.
  const [pendingDef, setPendingDef] = useState<string | null>(null);
  const [pendingLef, setPendingLef] = useState<string | null>(null);

  async function onLoadDef(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      setPendingDef(text);
      tryBuildDefFlat(text, pendingLef);
    } catch (e) {
      setError(`DEF read failed: ${(e as Error).message}`);
    } finally {
      ev.target.value = '';
    }
  }

  async function onLoadLef(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      setPendingLef(text);
      tryBuildDefFlat(pendingDef, text);
    } catch (e) {
      setError(`LEF read failed: ${(e as Error).message}`);
    } finally {
      ev.target.value = '';
    }
  }

  function tryBuildDefFlat(defText: string | null, lefText: string | null) {
    if (!defText || !lefText) {
      setInfo('DEF/LEF: provide BOTH files to render the placement');
      return;
    }
    try {
      const def = parseDef(defText);
      const lef = parseLef(lefText);
      const flat = defToFlat(def, lef);
      setDefFlat(flat);
      setTopCell(flat.topCell);
      setInfo(`DEF rendered: ${flat.layers.length} layers, ${flat.shapeCount} shapes, top=${flat.topCell}`);
    } catch (e) {
      setError(`DEF/LEF render failed: ${(e as Error).message}`);
    }
  }

  async function onLoadLyp(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = parseLyp(text);
      const map = new Map<string, LypLayer>();
      for (const l of parsed.layers) map.set(lypKey(l.layer, l.datatype), l);
      setLypMap(map);
      setInfo(`loaded ${parsed.layers.length} layer entries from .lyp`);
    } catch (e) {
      setError(`.lyp parse failed: ${(e as Error).message}`);
    } finally {
      ev.target.value = '';
    }
  }

  function onSaveGds() {
    const bytes = writeGds(lib);
    // Copy into a fresh ArrayBuffer to satisfy the BlobPart type — TS 5.7+
    // narrows Uint8Array<ArrayBufferLike> away from BlobPart.
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lib.libname || 'design'}.gds`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function fitToBbox(layout: FlatLayout) {
    if (!layout.bbox) return;
    const cx = (layout.bbox.xl + layout.bbox.xh) / 2;
    const cy = (layout.bbox.yl + layout.bbox.yh) / 2;
    const w = Math.max(1, layout.bbox.xh - layout.bbox.xl);
    const h = Math.max(1, layout.bbox.yh - layout.bbox.yl);
    setView({ cx, cy, scale: 600 / Math.max(w, h) });
  }

  // --- visibility helpers ----------------------------------------------------

  const toggleVisible = (k: string) =>
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  const isolate = (k: string) => setVisible(new Set([k]));
  const showAll = () => setVisible(new Set(flat.layers.map(l => lypKey(l.layer, l.datatype))));

  // --- render ----------------------------------------------------------------

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
      <Paper sx={{ p: 1.5, borderRadius: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography variant="h6" sx={{ mr: 2 }}>KLayout viewer</Typography>

          <Button size="small" component="label" startIcon={<UploadFile />} variant="outlined">
            Load GDS
            <input hidden type="file" accept=".gds,.gdsii,.gz" onChange={onLoadGds} />
          </Button>
          <Button size="small" component="label" startIcon={<UploadFile />} variant="outlined">
            Load DEF
            <input hidden type="file" accept=".def,.txt" onChange={onLoadDef} />
          </Button>
          <Button size="small" component="label" startIcon={<UploadFile />} variant="outlined">
            Load LEF
            <input hidden type="file" accept=".lef,.txt" onChange={onLoadLef} />
          </Button>
          <Button size="small" component="label" startIcon={<UploadFile />} variant="outlined">
            Load .lyp
            <input hidden type="file" accept=".lyp,.xml" onChange={onLoadLyp} />
          </Button>
          <Button size="small" startIcon={<Save />} variant="outlined" onClick={onSaveGds}>
            Save GDS
          </Button>
          <Tooltip title="Fit to bbox">
            <IconButton size="small" onClick={() => fitToBbox(flat)}><FitScreen /></IconButton>
          </Tooltip>
          <Tooltip title={tool === 'ruler' ? 'Switch to pan' : 'Switch to ruler'}>
            <IconButton
              size="small"
              color={tool === 'ruler' ? 'primary' : 'default'}
              onClick={() => setTool(t => (t === 'ruler' ? 'pan' : 'ruler'))}
            >
              <Straighten />
            </IconButton>
          </Tooltip>
          <Tooltip title={defFlat ? (tool === 'pick' ? 'Switch to pan' : 'Pick net (click a pin)') : 'Net pick requires DEF+LEF'}>
            <span>
              <IconButton
                size="small"
                color={tool === 'pick' ? 'primary' : 'default'}
                disabled={!defFlat}
                onClick={() => setTool(t => (t === 'pick' ? 'pan' : 'pick'))}
              >
                <MyLocation />
              </IconButton>
            </span>
          </Tooltip>
          {highlightedNet && (
            <Chip
              size="small"
              label={`net: ${highlightedNet.id}`}
              onDelete={() => setHighlightedNet(null)}
            />
          )}
          {ruler && (
            <Tooltip title="Clear ruler">
              <IconButton size="small" onClick={() => setRuler(null)}><Clear /></IconButton>
            </Tooltip>
          )}

          <Divider orientation="vertical" flexItem />

          <Typography variant="caption" color="text.secondary">Top cell:</Typography>
          <Select
            size="small" value={topCell}
            onChange={(e) => setTopCell(e.target.value)}
            sx={{ minWidth: 140 }}
          >
            {lib.structures.map(s => <MenuItem key={s.name} value={s.name}>{s.name}</MenuItem>)}
          </Select>

          <Divider orientation="vertical" flexItem />

          <Button size="small" startIcon={<BugReport />} onClick={runDrcOnFlat} variant="outlined" color="warning">
            Run DRC
          </Button>
          <Button size="small" component="label" variant="outlined">
            Load .lyrdb
            <input hidden type="file" accept=".lyrdb,.xml" onChange={onLoadLyrdb} />
          </Button>
          <Button size="small" variant="outlined" onClick={onSaveLyrdb} disabled={violations.length === 0}>
            Save .lyrdb
          </Button>

          <Box sx={{ flex: 1 }} />
          <Chip size="small" label={`${flat.layers.length} layers`} />
          <Chip size="small" label={`${flat.shapeCount} shapes`} />
          {flat.bbox && (
            <Chip size="small" variant="outlined" label={
              `bbox ${(flat.bbox.xh - flat.bbox.xl).toFixed(0)}×${(flat.bbox.yh - flat.bbox.yl).toFixed(0)}`
            } />
          )}
        </Stack>
      </Paper>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: tabbed side panel */}
        <Box sx={{ width: 280, display: 'flex', flexDirection: 'column', borderRight: '1px solid', borderColor: 'divider' }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
            <Tab value="layers" label="Layers" icon={<LayersIcon fontSize="small" />} iconPosition="start" />
            <Tab value="cells"  label="Cells"  icon={<AccountTree fontSize="small" />} iconPosition="start" />
            <Tab value="drc"    label={`DRC ${violations.length ? `(${violations.length})` : ''}`} icon={<BugReport fontSize="small" />} iconPosition="start" />
            <Tab value="bool"   label="Bool" icon={<FunctionsOutlined fontSize="small" />} iconPosition="start" />
            <Tab value="density" label="Dens" icon={<GridOn fontSize="small" />} iconPosition="start" />
            <Tab value="stats"   label="Stats" icon={<Assessment fontSize="small" />} iconPosition="start" />
          </Tabs>
          <Divider />
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {tab === 'layers' && (
              <LayerPanel
                layers={flat.layers}
                lyp={lypMap}
                visible={visible}
                onToggle={toggleVisible}
                onIsolate={isolate}
                onShowAll={showAll}
              />
            )}
            {tab === 'cells' && (
              <CellHierarchyTree
                root={hierarchy}
                selectedPath={selectedCellPath}
                onSelect={(node) => {
                  setSelectedCellPath(node.path);
                  // Double-click semantics aren't trivial in MUI; instead a
                  // click on a leaf cell promotes it to the viewer's top
                  // cell only if it's a non-cyclic descendant. Otherwise we
                  // just track selection.
                  if (!node.cyclic && node.name !== topCell) {
                    setTopCell(node.name);
                  }
                }}
              />
            )}
            {tab === 'drc' && (
              <DrcMarkerViewer
                violations={violations}
                geometryBboxes={geometryBboxes}
                onSelect={selectMarker}
                selectedKey={selectedKey}
              />
            )}
            {tab === 'bool' && (
              <Box sx={{ p: 2 }}>
                <Typography variant="overline">Boolean tool</Typography>
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  <Select size="small" value={boolA} displayEmpty onChange={(e) => setBoolA(e.target.value)}>
                    <MenuItem value=""><em>Layer A</em></MenuItem>
                    {flat.layers.map(l => {
                      const k = lypKey(l.layer, l.datatype);
                      return <MenuItem key={k} value={k}>{(lypMap.get(k) ?? defaultLypEntry(l.layer, l.datatype)).name}</MenuItem>;
                    })}
                  </Select>
                  <Select size="small" value={boolB} displayEmpty onChange={(e) => setBoolB(e.target.value)}>
                    <MenuItem value=""><em>Layer B</em></MenuItem>
                    {flat.layers.map(l => {
                      const k = lypKey(l.layer, l.datatype);
                      return <MenuItem key={k} value={k}>{(lypMap.get(k) ?? defaultLypEntry(l.layer, l.datatype)).name}</MenuItem>;
                    })}
                  </Select>
                  <Select size="small" value={boolOp} onChange={(e) => setBoolOp(e.target.value as BoolOp)}>
                    {(['AND', 'OR', 'XOR', 'NOT'] as BoolOp[]).map(op => <MenuItem key={op} value={op}>{op}</MenuItem>)}
                  </Select>
                  <Button size="small" variant="contained" onClick={runBool} disabled={!boolA || !boolB}>
                    Run {boolOp}
                  </Button>
                  <Divider />
                  <Typography variant="caption" color="text.secondary">SIZE (offset Layer A by Δ)</Typography>
                  <TextField
                    size="small" type="number" label="Δ (µm)"
                    value={sizeDelta} onChange={(e) => setSizeDelta(Number(e.target.value))}
                  />
                  <Button size="small" variant="outlined" onClick={runSize} disabled={!boolA}>
                    Run SIZE
                  </Button>
                  {boolResultArea !== null && (
                    <Alert severity="info">Result area: {boolResultArea.toFixed(2)} µm²</Alert>
                  )}
                </Stack>
              </Box>
            )}
            {tab === 'density' && (
              <Box sx={{ p: 2 }}>
                <Typography variant="overline">Density map</Typography>
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  <TextField
                    size="small" type="number" label="bins (X)"
                    value={densityBins}
                    onChange={(e) => setDensityBins(Math.max(1, Math.min(400, Number(e.target.value))))}
                  />
                  <Select
                    size="small" value={densityLayerKey} displayEmpty
                    onChange={(e) => setDensityLayerKey(e.target.value)}
                  >
                    <MenuItem value=""><em>All layers</em></MenuItem>
                    {flat.layers.map(l => {
                      const k = lypKey(l.layer, l.datatype);
                      return <MenuItem key={k} value={k}>
                        {(lypMap.get(k) ?? defaultLypEntry(l.layer, l.datatype)).name}
                      </MenuItem>;
                    })}
                  </Select>
                  <Button
                    size="small" variant="contained"
                    onClick={() => {
                      const layers = densityLayerKey
                        ? [(() => {
                            const [layer, datatype] = densityLayerKey.split('/').map(Number);
                            return { layer, datatype };
                          })()]
                        : undefined;
                      setDensityResult(computeDensity(flat, { binsX: densityBins, layers }));
                    }}
                  >
                    Compute
                  </Button>
                  <Button
                    size="small" variant="outlined" disabled={!densityResult}
                    onClick={() => setDensityResult(null)}
                  >
                    Clear
                  </Button>
                  <FormControlLabel
                    control={<Switch
                      checked={densityVisible}
                      onChange={(e) => setDensityVisible(e.target.checked)}
                    />}
                    label="Show overlay"
                  />
                  {densityResult && (
                    <>
                      <Divider />
                      <Typography variant="caption">
                        bins: {densityResult.binsX} × {densityResult.binsY}<br />
                        bin size: {densityResult.binW.toFixed(2)} × {densityResult.binH.toFixed(2)}<br />
                        min: {(densityResult.min * 100).toFixed(1)}%, mean: {(densityResult.mean * 100).toFixed(1)}%, max: {(densityResult.max * 100).toFixed(1)}%
                      </Typography>
                    </>
                  )}
                </Stack>
              </Box>
            )}
            {tab === 'stats' && (() => {
              const stats = computeLayerStats(flat);
              return (
                <Box sx={{ p: 2, overflowY: 'auto', maxHeight: '100%' }}>
                  <Typography variant="overline">Layer stats</Typography>
                  <Stack spacing={0.25} sx={{ mt: 1, mb: 2, fontSize: 12 }}>
                    <div>top cell: <code>{stats.topCell}</code></div>
                    <div>layers: {stats.totals.layerCount}</div>
                    <div>rects: {stats.totals.rects.toLocaleString()}</div>
                    <div>polygons: {stats.totals.polygons.toLocaleString()}</div>
                    <div>paths: {stats.totals.paths.toLocaleString()}</div>
                    <div>summed area: {stats.totals.summedArea.toFixed(1)} u²</div>
                    {stats.bbox && (
                      <div>
                        bbox: ({stats.bbox.xl.toFixed(1)}, {stats.bbox.yl.toFixed(1)}) →
                        ({stats.bbox.xh.toFixed(1)}, {stats.bbox.yh.toFixed(1)})
                      </div>
                    )}
                  </Stack>
                  <Divider sx={{ mb: 1 }} />
                  <Box sx={{ fontSize: 12 }}>
                    {stats.layers.map(l => {
                      const k = lypKey(l.layer, l.datatype);
                      const meta = lypMap.get(k) ?? defaultLypEntry(l.layer, l.datatype);
                      return (
                        <Box key={k} sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', columnGap: 1, rowGap: 0.25, alignItems: 'center', mb: 0.75 }}>
                          <Box sx={{ width: 10, height: 10, bgcolor: meta.fillColor ?? '#888', border: '1px solid #555' }} />
                          <Box sx={{ fontFamily: 'monospace' }}>{meta.name}</Box>
                          <Box sx={{ textAlign: 'right' }}>{l.area.toFixed(1)}</Box>
                          <Box />
                          <Box sx={{ color: 'text.secondary', fontSize: 10 }}>
                            rects: {l.rects} · polys: {l.polygons} · paths: {l.paths}
                          </Box>
                          <Box sx={{ textAlign: 'right', color: 'text.secondary', fontSize: 10 }}>u²</Box>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              );
            })()}
          </Box>
        </Box>

        {/* Right: canvas */}
        <Box sx={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <GdsCanvas
            layers={flat.layers}
            lyp={lypMap}
            visible={visible}
            view={view}
            onView={setView}
            highlight={highlight}
            tool={tool}
            ruler={ruler}
            onRulerChange={setRuler}
            highlightRects={highlightedNet?.rects ?? []}
            densityOverlay={densityVisible && densityResult ? {
              bbox: densityResult.bbox,
              binW: densityResult.binW,
              binH: densityResult.binH,
              density: densityResult.density,
              color: (d: number) => densityColor(d, 0.55),
            } : null}
            onPick={(x, y) => {
              if (!defFlat) return;
              const n = pickNetAt(defFlat, x, y);
              if (n) {
                setHighlightedNet({ id: n, rects: defFlat.netIndex.get(n) ?? [] });
                setInfo(`net "${n}": ${(defFlat.netIndex.get(n) ?? []).length} rects`);
              } else {
                setHighlightedNet(null);
                setInfo('no net under cursor');
              }
            }}
          />
          {flat.shapeCount === 0 && (
            <Alert severity="info" sx={{ position: 'absolute', top: 16, left: 16 }}>
              No shapes — load a GDS or pick a non-empty top cell.
            </Alert>
          )}
        </Box>
      </Box>

      {error && <Snackbar open autoHideDuration={6000} onClose={() => setError(null)} message={error} />}
      {info  && <Snackbar open autoHideDuration={4000} onClose={() => setInfo(null)}  message={info} />}
    </Box>
  );
}
