'use client';

/**
 * Tap-cell / endcap inserter UI.
 *
 * Shows a floorplan with rows + macros, lets you tweak tap pitch and cell
 * sizes, and overlays the inserted taps (green) and endcaps (purple). The
 * left panel summarises per-row counts; the API button forwards the same
 * call to the server for verification.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider,
  TextField, Snackbar, Slider, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { ContentCopy } from '@mui/icons-material';

import {
  exampleFloorplan, generateRows, type Floorplan, type FpMacro,
} from '@/lib/algorithms/floorplan';
import {
  insertTapsAndEndcaps, type TapSpec, type TapResult,
} from '@/lib/tools/tap_endcap';

function defaultFloorplan(): Floorplan {
  const fp = exampleFloorplan();
  fp.rows = generateRows(fp, { site: 'unit', siteWidth: 0.46, rowHeight: 2.72 });
  return fp;
}

export default function TapEndcapPage() {
  const [fp, setFp] = useState<Floorplan>(defaultFloorplan);
  const [pitch, setPitch] = useState(25);
  const [tapW, setTapW] = useState(0.46);
  const [tapH, setTapH] = useState(2.72);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spec: TapSpec = useMemo(() => ({
    tapMaster: 'TAPCELL_X1',
    endcapMaster: 'ENDCAP_X1',
    tapPitch: pitch,
    siteWidth: 0.46,
    tapWidth: tapW,
    tapHeight: tapH,
  }), [pitch, tapW, tapH]);

  const result: TapResult | null = useMemo(() => {
    try { return insertTapsAndEndcaps(fp, spec); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return null; }
  }, [fp, spec]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const cw = fp.die.xh - fp.die.xl;
    const ch = fp.die.yh - fp.die.yl;
    const pad = 16;
    const sx = (W - 2 * pad) / cw;
    const sy = (H - 2 * pad) / ch;
    const s = Math.min(sx, sy);
    const ox = (W - cw * s) / 2;
    const oy = (H - ch * s) / 2;
    function flipY(y: number) { return oy + (fp.die.yh - y) * s; }
    function box(r: { x: number; y: number; w: number; h: number }, fill: string, stroke: string) {
      const x = ox + (r.x - fp.die.xl) * s;
      const y = flipY(r.y + r.h);
      const w = r.w * s;
      const h = r.h * s;
      ctx!.fillStyle = fill;
      ctx!.fillRect(x, y, w, h);
      ctx!.strokeStyle = stroke;
      ctx!.strokeRect(x, y, w, h);
    }
    // Die border
    ctx.strokeStyle = '#0f172a';
    ctx.strokeRect(ox, oy, cw * s, ch * s);
    // Core
    ctx.strokeStyle = '#94a3b8';
    ctx.strokeRect(
      ox + (fp.core.xl - fp.die.xl) * s,
      flipY(fp.core.yh),
      (fp.core.xh - fp.core.xl) * s,
      (fp.core.yh - fp.core.yl) * s,
    );
    // Rows
    for (const row of fp.rows) {
      const y = flipY(row.y + tapH);
      const x = ox + (row.x - fp.die.xl) * s;
      const w = row.numX * row.stepX * s;
      const h = tapH * s;
      ctx.fillStyle = 'rgba(148,163,184,0.08)';
      ctx.fillRect(x, y, w, h);
    }
    // Existing macros
    for (const m of fp.macros) {
      box({ x: m.x, y: m.y, w: m.width, h: m.height },
        'rgba(99,102,241,0.25)', '#3730a3');
    }
    // Inserted components
    if (result) {
      for (const c of result.components) {
        const isTap = c.master === spec.tapMaster;
        box({ x: c.x, y: c.y, w: c.width, h: c.height },
          isTap ? 'rgba(34,197,94,0.65)' : 'rgba(168,85,247,0.7)',
          isTap ? '#15803d' : '#7e22ce');
      }
    }
  }, [fp, result, spec, tapH]);

  function addBlockingMacro() {
    const next = { ...fp, macros: [...fp.macros] };
    const m: FpMacro = {
      name: `BLK_${fp.macros.length}`,
      master: 'MACRO_BIG',
      x: fp.core.xl + 5 + Math.random() * 10,
      y: fp.core.yl + 5 + Math.random() * 10,
      width: 12, height: 12,
      halo: 0, orient: 'N', fixed: true,
    };
    next.macros.push(m);
    setFp(next);
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.components, null, 2));
      setInfo(`Copied ${result.components.length} components`);
    } catch { setError('Clipboard write failed'); }
  }

  async function callApi() {
    try {
      const r = await fetch('/api/tap-endcap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ floorplan: fp, spec }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setInfo(`API: ${j.totalTaps} taps, ${j.totalEndcaps} endcaps`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap">
        <Typography variant="h4">Tap Cell + Endcap Inserter</Typography>
        {result && (
          <>
            <Chip label={`taps: ${result.totalTaps}`}
              sx={{ bgcolor: '#22c55e', color: 'white' }} />
            <Chip label={`endcaps: ${result.totalEndcaps}`}
              sx={{ bgcolor: '#a855f7', color: 'white' }} />
            <Chip label={`rows: ${fp.rows.length}`} />
            {result.warnings.length > 0 && (
              <Chip label={`warn: ${result.warnings.length}`} color="warning" />
            )}
          </>
        )}
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, width: { xs: '100%', md: 320 } }}>
          <Typography variant="subtitle1" mb={1}>Spec</Typography>
          <Box mb={1}>
            <Typography variant="caption">tapPitch (μm): {pitch}</Typography>
            <Slider size="small" min={5} max={80} step={1} value={pitch}
              onChange={(_, v) => setPitch(v as number)} />
          </Box>
          <Box mb={1}>
            <Typography variant="caption">tapWidth (μm): {tapW.toFixed(2)}</Typography>
            <Slider size="small" min={0.4} max={2.0} step={0.05} value={tapW}
              onChange={(_, v) => setTapW(v as number)} />
          </Box>
          <Box mb={1}>
            <Typography variant="caption">tapHeight (μm): {tapH.toFixed(2)}</Typography>
            <Slider size="small" min={1.0} max={5.0} step={0.1} value={tapH}
              onChange={(_, v) => setTapH(v as number)} />
          </Box>
          <Stack direction="row" spacing={1} mt={1}>
            <Button size="small" variant="outlined" onClick={addBlockingMacro}>
              Add fixed macro
            </Button>
            <Button size="small" onClick={() => setFp(defaultFloorplan())}>Reset</Button>
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" onClick={callApi}>API</Button>
            <Button size="small" startIcon={<ContentCopy />} onClick={copy}>Copy</Button>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle1" mb={1}>Floorplan preview</Typography>
          <canvas ref={canvasRef} width={620} height={520}
            style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 720 }} />
          <Stack direction="row" spacing={1} mt={1}>
            <Chip size="small" label="row"
              sx={{ bgcolor: 'rgba(148,163,184,0.4)' }} />
            <Chip size="small" label="macro"
              sx={{ bgcolor: 'rgba(99,102,241,0.4)', color: '#3730a3' }} />
            <Chip size="small" label="tap"
              sx={{ bgcolor: '#22c55e', color: 'white' }} />
            <Chip size="small" label="endcap"
              sx={{ bgcolor: '#a855f7', color: 'white' }} />
          </Stack>
        </Paper>
      </Stack>

      <Divider sx={{ my: 3 }} />

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" mb={1}>Per-row counts</Typography>
        {result && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Row</TableCell>
                <TableCell align="right">Taps</TableCell>
                <TableCell align="right">Endcaps</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.perRow.map((r, i) => (
                <TableRow key={i}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{r.row}</TableCell>
                  <TableCell align="right">{r.taps}</TableCell>
                  <TableCell align="right">{r.endcaps}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {result && result.warnings.length > 0 && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Typography variant="subtitle1" mb={1}>Warnings</Typography>
          {result.warnings.map((w, i) => (
            <Alert key={i} severity="warning" sx={{ mb: 0.5 }}>{w}</Alert>
          ))}
        </Paper>
      )}

      <Snackbar open={!!info} autoHideDuration={3000} onClose={() => setInfo(null)} message={info ?? ''} />
      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Box>
  );
}
