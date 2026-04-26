'use client';

/**
 * Floorplan editor.
 *
 * Edit a die/core rectangle and drag macros around inside the core. Live
 * validation flags overlap and out-of-core errors. Export emits a minimal
 * DEF the OpenROAD composer can ingest (or downloads it as text).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider, IconButton,
  Tooltip, MenuItem, Select, TextField, Snackbar, Table, TableBody,
  TableCell, TableHead, TableRow, FormControlLabel, Switch,
} from '@mui/material';
import {
  Add, Delete, Save, UploadFile, FitScreen, ContentCopy,
} from '@mui/icons-material';

import {
  blankFloorplan, exampleFloorplan, validateFloorplan, generateRows,
  macroRect, floorplanToDef, type Floorplan, type FpMacro, type FpIssue,
} from '@/lib/algorithms/floorplan';
import { writeDef } from '@/lib/parsers/def';

type Orient = FpMacro['orient'];
const ORIENTS: Orient[] = ['N', 'S', 'E', 'W', 'FN', 'FS', 'FE', 'FW'];

export default function FloorplanPage() {
  const [fp, setFp] = useState<Floorplan>(() => exampleFloorplan());
  const [selected, setSelected] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHalos, setShowHalos] = useState(true);

  const issues = useMemo(() => validateFloorplan(fp), [fp]);
  const errorCount = issues.filter(i => i.severity === 'error').length;

  // ---------- Patch helpers ----------
  function patch(p: Partial<Floorplan>) { setFp(prev => ({ ...prev, ...p })); }

  function updateMacro(name: string, p: Partial<FpMacro>) {
    setFp(prev => ({
      ...prev,
      macros: prev.macros.map(m => m.name === name ? { ...m, ...p } : m),
    }));
  }

  function addMacro() {
    let i = 0;
    let n = 'macro_0';
    while (fp.macros.some(m => m.name === n)) { i++; n = `macro_${i}`; }
    const m: FpMacro = {
      name: n, master: 'CELL', x: fp.core.xl + 20, y: fp.core.yl + 20,
      width: 100, height: 100, halo: 5, orient: 'N', fixed: false,
    };
    patch({ macros: [...fp.macros, m] });
    setSelected(n);
  }

  function removeMacro(name: string) {
    patch({ macros: fp.macros.filter(m => m.name !== name) });
    if (selected === name) setSelected(null);
  }

  function makeRows() {
    const rh = 10;
    const rows = generateRows(fp, { site: 'core', siteWidth: 1, rowHeight: rh });
    patch({ rows });
    setInfo(`Generated ${rows.length} rows (height ${rh}µm)`);
  }

  // ---------- Import / export ----------
  async function importJson(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const txt = await f.text();
      const obj = JSON.parse(txt);
      if (!obj || typeof obj !== 'object' || !Array.isArray(obj.macros)) throw new Error('not a floorplan');
      setFp(obj);
      setInfo(`Imported ${f.name}`);
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`);
    } finally {
      ev.target.value = '';
    }
  }

  function exportJson() {
    download(JSON.stringify(fp, null, 2), `${fp.designName || 'floorplan'}.json`, 'application/json');
    setInfo('Exported floorplan JSON');
  }

  function exportDef() {
    if (errorCount > 0) {
      setError('Cannot export DEF — fix errors first');
      return;
    }
    const def = writeDef(floorplanToDef(fp));
    download(def, `${fp.designName || 'floorplan'}.def`, 'text/plain');
    setInfo('Exported DEF');
  }

  async function exportDefViaApi() {
    if (errorCount > 0) {
      setError('Cannot export DEF — fix errors first');
      return;
    }
    try {
      const r = await fetch('/api/floorplan/def', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ floorplan: fp }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? r.statusText);
      download(j.def, `${fp.designName || 'floorplan'}.def`, 'text/plain');
      setInfo('Exported via /api/floorplan/def');
    } catch (e) {
      setError(`API export failed: ${(e as Error).message}`);
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Paper square sx={{ p: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Typography variant="h6" sx={{ mr: 2 }}>Floorplan editor</Typography>
          <TextField
            size="small" label="Design name" value={fp.designName}
            onChange={(e) => patch({ designName: e.target.value })}
            sx={{ width: 180 }}
          />
          <TextField
            size="small" label="DBU/µm" type="number" value={fp.dbu}
            onChange={(e) => patch({ dbu: Math.max(1, Number(e.target.value)) })}
            sx={{ width: 100 }}
          />

          <Divider orientation="vertical" flexItem />

          <Button size="small" variant="outlined" startIcon={<Add />} onClick={addMacro}>Macro</Button>
          <Button size="small" variant="outlined" onClick={makeRows}>Generate rows</Button>
          <Button size="small" variant="outlined" onClick={() => setFp(exampleFloorplan())}>Demo</Button>
          <Button size="small" variant="outlined" onClick={() => setFp(blankFloorplan())}>Reset</Button>

          <Divider orientation="vertical" flexItem />

          <Button size="small" component="label" variant="outlined" startIcon={<UploadFile />}>
            Import JSON
            <input hidden type="file" accept=".json,application/json" onChange={importJson} />
          </Button>
          <Button size="small" variant="outlined" startIcon={<Save />} onClick={exportJson}>JSON</Button>
          <Button size="small" variant="contained" startIcon={<Save />} onClick={exportDef}>DEF</Button>
          <Button size="small" variant="outlined" onClick={exportDefViaApi}>DEF (API)</Button>
          <Button
            size="small" variant="outlined" startIcon={<ContentCopy />}
            onClick={() => { navigator.clipboard.writeText(writeDef(floorplanToDef(fp))); setInfo('DEF copied'); }}
            disabled={errorCount > 0}
          >
            Copy DEF
          </Button>

          <Box sx={{ flex: 1 }} />
          <FormControlLabel
            control={<Switch checked={showHalos} onChange={(e) => setShowHalos(e.target.checked)} />}
            label="Halos"
          />
          <Chip size="small" label={`${fp.macros.length} macros`} />
          <Chip size="small" label={`${fp.rows.length} rows`} />
          <Chip
            size="small"
            color={errorCount > 0 ? 'error' : (issues.length > 0 ? 'warning' : 'success')}
            label={errorCount > 0 ? `${errorCount} errors` : `${issues.length} warnings`}
          />
        </Stack>
      </Paper>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: canvas */}
        <Box sx={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <FloorplanCanvas
            fp={fp}
            selected={selected}
            onSelect={setSelected}
            onMoveMacro={(name, x, y) => updateMacro(name, { x, y })}
            showHalos={showHalos}
          />
        </Box>

        {/* Right: properties */}
        <Box sx={{ width: 380, borderLeft: '1px solid', borderColor: 'divider', overflowY: 'auto' }}>
          <DiePanel fp={fp} onPatch={patch} />
          <Divider />
          <MacroPanel
            fp={fp}
            selected={selected}
            onSelect={setSelected}
            onUpdate={updateMacro}
            onRemove={removeMacro}
          />
          <Divider />
          <IssuesPanel issues={issues} onFocus={(name) => setSelected(name)} />
        </Box>
      </Box>

      {error && <Snackbar open autoHideDuration={6000} onClose={() => setError(null)} message={error} />}
      {info  && <Snackbar open autoHideDuration={3500} onClose={() => setInfo(null)}  message={info} />}
    </Box>
  );
}

// ============================================================================
// Canvas
// ============================================================================

interface FloorplanCanvasProps {
  fp: Floorplan;
  selected: string | null;
  onSelect: (name: string | null) => void;
  onMoveMacro: (name: string, x: number, y: number) => void;
  showHalos: boolean;
}

function FloorplanCanvas({ fp, selected, onSelect, onMoveMacro, showHalos }: FloorplanCanvasProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [drag, setDrag] = useState<{ name: string; ox: number; oy: number } | null>(null);

  // Resize observer
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current.parentElement!;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute world→screen transform: fit die into the canvas with margin.
  const xform = useMemo(() => {
    const { die } = fp;
    const dw = die.xh - die.xl, dh = die.yh - die.yl;
    const m = 24;
    const sx = (size.w - 2 * m) / Math.max(1, dw);
    const sy = (size.h - 2 * m) / Math.max(1, dh);
    const s = Math.min(sx, sy);
    const ox = m + (size.w - 2 * m - dw * s) / 2 - die.xl * s;
    // Y flip: world Y up, screen Y down.
    const oy = size.h - m - (size.h - 2 * m - dh * s) / 2 + die.yl * s;
    return {
      s,
      worldToScreen: (x: number, y: number) => ({ x: ox + x * s, y: oy - y * s }),
      screenToWorld: (px: number, py: number) => ({ x: (px - ox) / s, y: (oy - py) / s }),
    };
  }, [fp, size]);

  // Render
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    c.style.width = size.w + 'px';
    c.style.height = size.h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    // Die
    drawRect(ctx, fp.die, xform, '#1e293b', 'rgba(30,41,59,0.05)', 1);
    // Core
    drawRect(ctx, fp.core, xform, '#475569', 'rgba(71,85,105,0.07)', 1, [4, 4]);

    // Rows
    ctx.save();
    ctx.strokeStyle = 'rgba(100,116,139,0.35)';
    ctx.lineWidth = 0.5;
    for (const r of fp.rows) {
      const a = xform.worldToScreen(r.x, r.y);
      const b = xform.worldToScreen(r.x + r.numX * r.stepX, r.y);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();

    // Macros
    for (const m of fp.macros) {
      const r = macroRect(m);
      const isSel = m.name === selected;
      const fill = m.fixed ? 'rgba(59,130,246,0.30)' : 'rgba(34,197,94,0.30)';
      const stroke = isSel ? '#ef4444' : (m.fixed ? '#1d4ed8' : '#15803d');

      if (showHalos && m.halo > 0) {
        const h = { xl: r.xl - m.halo, yl: r.yl - m.halo, xh: r.xh + m.halo, yh: r.yh + m.halo };
        drawRect(ctx, h, xform, 'rgba(244,114,182,0.6)', 'rgba(244,114,182,0.10)', 1, [3, 3]);
      }

      drawRect(ctx, r, xform, stroke, fill, isSel ? 2.5 : 1.5);

      // Label
      const tl = xform.worldToScreen(r.xl, r.yh);
      ctx.save();
      ctx.fillStyle = '#0f172a';
      ctx.font = '11px system-ui';
      ctx.fillText(m.name, tl.x + 4, tl.y + 12);
      ctx.fillStyle = '#475569';
      ctx.fillText(m.master, tl.x + 4, tl.y + 24);
      ctx.restore();
    }
  }, [fp, size, xform, selected, showHalos]);

  // Hit test
  function macroAt(px: number, py: number): FpMacro | null {
    const w = xform.screenToWorld(px, py);
    // Iterate in reverse so the topmost macro wins.
    for (let i = fp.macros.length - 1; i >= 0; i--) {
      const m = fp.macros[i];
      const r = macroRect(m);
      if (w.x >= r.xl && w.x <= r.xh && w.y >= r.yl && w.y <= r.yh) return m;
    }
    return null;
  }

  function onMouseDown(ev: React.MouseEvent<HTMLCanvasElement>) {
    const rect = ev.currentTarget.getBoundingClientRect();
    const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
    const m = macroAt(px, py);
    if (m) {
      onSelect(m.name);
      if (!m.fixed) {
        const w = xform.screenToWorld(px, py);
        setDrag({ name: m.name, ox: w.x - m.x, oy: w.y - m.y });
      }
    } else {
      onSelect(null);
    }
  }

  function onMouseMove(ev: React.MouseEvent<HTMLCanvasElement>) {
    if (!drag) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const w = xform.screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
    onMoveMacro(drag.name, Math.round(w.x - drag.ox), Math.round(w.y - drag.oy));
  }

  function onMouseUp() { setDrag(null); }

  return (
    <Box sx={{ width: '100%', height: '100%', bgcolor: 'background.default' }}>
      <canvas
        ref={ref}
        style={{ display: 'block', cursor: drag ? 'grabbing' : 'default' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />
    </Box>
  );
}

interface Xform {
  s: number;
  worldToScreen: (x: number, y: number) => { x: number; y: number };
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  r: { xl: number; yl: number; xh: number; yh: number },
  xform: Xform,
  stroke: string,
  fill: string,
  lw: number,
  dash: number[] = [],
) {
  const a = xform.worldToScreen(r.xl, r.yh);
  const b = xform.worldToScreen(r.xh, r.yl);
  ctx.save();
  ctx.beginPath();
  ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  if (dash.length) ctx.setLineDash(dash);
  ctx.stroke();
  ctx.restore();
}

// ============================================================================
// Right-side panels
// ============================================================================

function DiePanel({ fp, onPatch }: { fp: Floorplan; onPatch: (p: Partial<Floorplan>) => void }) {
  const setDie = (k: keyof Floorplan['die'], v: number) => onPatch({ die: { ...fp.die, [k]: v } });
  const setCore = (k: keyof Floorplan['core'], v: number) => onPatch({ core: { ...fp.core, [k]: v } });
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Die / Core</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <NumField label="die xl" value={fp.die.xl} onChange={v => setDie('xl', v)} />
        <NumField label="die yl" value={fp.die.yl} onChange={v => setDie('yl', v)} />
        <NumField label="die xh" value={fp.die.xh} onChange={v => setDie('xh', v)} />
        <NumField label="die yh" value={fp.die.yh} onChange={v => setDie('yh', v)} />
      </Stack>
      <Stack direction="row" spacing={1}>
        <NumField label="core xl" value={fp.core.xl} onChange={v => setCore('xl', v)} />
        <NumField label="core yl" value={fp.core.yl} onChange={v => setCore('yl', v)} />
        <NumField label="core xh" value={fp.core.xh} onChange={v => setCore('xh', v)} />
        <NumField label="core yh" value={fp.core.yh} onChange={v => setCore('yh', v)} />
      </Stack>
    </Box>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <TextField
      size="small" label={label} type="number" value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      sx={{ width: 90 }}
      slotProps={{ inputLabel: { shrink: true } }}
    />
  );
}

interface MacroPanelProps {
  fp: Floorplan;
  selected: string | null;
  onSelect: (name: string | null) => void;
  onUpdate: (name: string, p: Partial<FpMacro>) => void;
  onRemove: (name: string) => void;
}

function MacroPanel({ fp, selected, onSelect, onUpdate, onRemove }: MacroPanelProps) {
  const m = fp.macros.find(x => x.name === selected) ?? null;
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Macros</Typography>
      <Paper variant="outlined" sx={{ mb: 1, maxHeight: 180, overflowY: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Master</TableCell>
              <TableCell>Pos</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {fp.macros.map(mm => (
              <TableRow
                key={mm.name}
                hover
                selected={mm.name === selected}
                onClick={() => onSelect(mm.name)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{mm.name}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{mm.master}</TableCell>
                <TableCell sx={{ fontSize: 11 }}>({mm.x}, {mm.y})</TableCell>
                <TableCell padding="none">
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onRemove(mm.name); }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {fp.macros.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography variant="caption" color="text.secondary">No macros yet.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {m && (
        <Box>
          <Typography variant="overline">Selected: {m.name}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}>
            <TextField
              size="small" label="name" value={m.name}
              onChange={(e) => {
                // Disallow rename collision.
                const newName = e.target.value;
                if (!newName || fp.macros.some(x => x.name === newName && x !== m)) return;
                onUpdate(m.name, { name: newName });
                onSelect(newName);
              }}
              sx={{ width: 120 }}
            />
            <TextField
              size="small" label="master" value={m.master}
              onChange={(e) => onUpdate(m.name, { master: e.target.value })}
              sx={{ width: 120 }}
            />
            <Select
              size="small" value={m.orient}
              onChange={(e) => onUpdate(m.name, { orient: e.target.value as Orient })}
              sx={{ width: 80 }}
            >
              {ORIENTS.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
            </Select>
            <NumField label="x" value={m.x} onChange={v => onUpdate(m.name, { x: v })} />
            <NumField label="y" value={m.y} onChange={v => onUpdate(m.name, { y: v })} />
            <NumField label="w" value={m.width}  onChange={v => onUpdate(m.name, { width: v })} />
            <NumField label="h" value={m.height} onChange={v => onUpdate(m.name, { height: v })} />
            <NumField label="halo" value={m.halo} onChange={v => onUpdate(m.name, { halo: v })} />
            <FormControlLabel
              control={<Switch
                checked={m.fixed}
                onChange={(e) => onUpdate(m.name, { fixed: e.target.checked })}
              />}
              label="FIXED"
            />
          </Stack>
        </Box>
      )}
    </Box>
  );
}

function IssuesPanel({ issues, onFocus }: { issues: FpIssue[]; onFocus: (name: string) => void }) {
  if (issues.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="success" variant="outlined">No issues.</Alert>
      </Box>
    );
  }
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Issues</Typography>
      <Stack spacing={1}>
        {issues.map((iss, i) => (
          <Alert
            key={i}
            severity={iss.severity}
            variant="outlined"
            sx={{ cursor: iss.macros?.[0] ? 'pointer' : 'default' }}
            onClick={() => iss.macros?.[0] && onFocus(iss.macros[0])}
          >
            {iss.message}
          </Alert>
        ))}
      </Stack>
    </Box>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
