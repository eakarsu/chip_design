'use client';

/**
 * Wafer / reticle planner.
 *
 * Two views in one page:
 *
 *   - "DPW" — dies-per-wafer with edge exclusion + Murphy yield.
 *   - "Reticle" — pack one or more die types into the lithography
 *     reticle window with NFDH shelf packing.
 *
 * Both views are entirely client-side; the API is exercised by the small
 * "API" button on each panel for round-trip verification.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Alert, Chip, Divider,
  Snackbar, Slider, ToggleButton, ToggleButtonGroup, Button,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';

import {
  computeDiesPerWafer, packReticle,
  type WaferResult, type ReticleResult,
} from '@/lib/tools/wafer';

export default function WaferPage() {
  const [tab, setTab] = useState<'dpw' | 'reticle'>('dpw');

  // DPW state.
  const [waferDiameter, setWaferDiameter] = useState(300);
  const [edgeExclusion, setEdgeExclusion] = useState(3);
  const [dieW, setDieW] = useState(10);
  const [dieH, setDieH] = useState(10);
  const [scribe, setScribe] = useState(0.1);
  const [defectDensity, setDefectDensity] = useState(0.2);

  // Reticle state — fixed example die mix.
  const reticleDies = useMemo(() => ([
    { name: 'CPU',   width: 12, height: 14 },
    { name: 'GPU',   width: 14, height: 18 },
    { name: 'NPU',   width:  8, height:  8 },
    { name: 'IO0',   width:  4, height:  4 },
    { name: 'IO1',   width:  4, height:  4 },
    { name: 'IO2',   width:  4, height:  4 },
    { name: 'PHY',   width:  6, height:  4 },
    { name: 'TEST',  width:  3, height:  3 },
  ]), []);

  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dpw: WaferResult = useMemo(
    () => computeDiesPerWafer({
      waferDiameter, edgeExclusion,
      dieWidth: dieW, dieHeight: dieH, scribeWidth: scribe,
      defectDensity,
    }),
    [waferDiameter, edgeExclusion, dieW, dieH, scribe, defectDensity],
  );
  const ret: ReticleResult = useMemo(
    () => packReticle({
      reticleWidth: 26, reticleHeight: 33, gap: 0.1,
      dies: reticleDies,
    }),
    [reticleDies],
  );

  // DPW canvas.
  const dpwRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = dpwRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const r = waferDiameter / 2;
    const pad = 18;
    const s = Math.min((W - 2 * pad) / waferDiameter, (H - 2 * pad) / waferDiameter);
    const cx = W / 2, cy = H / 2;
    // Wafer.
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath(); ctx.arc(cx, cy, r * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#475569'; ctx.stroke();
    // Edge exclusion ring.
    ctx.strokeStyle = '#cbd5e1';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, (r - edgeExclusion) * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Dies.
    for (const d of dpw.dies) {
      const x = cx + d.x * s;
      const y = cy - d.y * s - dieH * s;
      ctx.fillStyle = 'rgba(34,197,94,0.45)';
      ctx.fillRect(x, y, dieW * s, dieH * s);
      ctx.strokeStyle = '#15803d';
      ctx.strokeRect(x, y, dieW * s, dieH * s);
    }
    // Notch.
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(cx - 4, cy + r * s - 2, 8, 6);
  }, [waferDiameter, edgeExclusion, dieW, dieH, scribe, dpw]);

  // Reticle canvas.
  const retRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = retRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const rw = 26, rh = 33;
    const pad = 24;
    const s = Math.min((W - 2 * pad) / rw, (H - 2 * pad) / rh);
    const ox = (W - rw * s) / 2;
    const oy = pad;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeRect(ox, oy, rw * s, rh * s);
    const palette = ['#4f46e5', '#dc2626', '#16a34a', '#f59e0b',
      '#0891b2', '#a855f7', '#db2777', '#65a30d'];
    let i = 0;
    for (const p of ret.placements) {
      ctx.fillStyle = palette[i % palette.length] + 'cc';
      ctx.strokeStyle = palette[i % palette.length];
      ctx.fillRect(ox + p.x * s, oy + p.y * s, p.width * s, p.height * s);
      ctx.strokeRect(ox + p.x * s, oy + p.y * s, p.width * s, p.height * s);
      ctx.fillStyle = 'white';
      ctx.font = '11px sans-serif';
      ctx.fillText(p.name, ox + p.x * s + 4, oy + p.y * s + 14);
      i++;
    }
  }, [ret]);

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap">
        <Typography variant="h4">Wafer / Reticle Planner</Typography>
        <ToggleButtonGroup exclusive size="small" value={tab}
          onChange={(_, v) => v && setTab(v as 'dpw' | 'reticle')}>
          <ToggleButton value="dpw">Dies/wafer</ToggleButton>
          <ToggleButton value="reticle">Reticle pack</ToggleButton>
        </ToggleButtonGroup>
        {tab === 'dpw' && (
          <>
            <Chip label={`gross: ${dpw.grossDies}`}
              sx={{ bgcolor: '#16a34a', color: 'white' }} />
            {dpw.yieldPerDie != null && (
              <>
                <Chip label={`yield: ${(dpw.yieldPerDie * 100).toFixed(1)}%`}
                  sx={{ bgcolor: '#4f46e5', color: 'white' }} />
                <Chip label={`good: ${dpw.goodDies?.toFixed(0)}`}
                  sx={{ bgcolor: '#0891b2', color: 'white' }} />
              </>
            )}
            <Chip label={`util: ${(dpw.utilisation * 100).toFixed(1)}%`} />
          </>
        )}
        {tab === 'reticle' && (
          <>
            <Chip label={`placed: ${ret.placements.length}`}
              sx={{ bgcolor: '#16a34a', color: 'white' }} />
            <Chip label={`util: ${(ret.utilisation * 100).toFixed(1)}%`} />
            {ret.unplaced.length > 0 && (
              <Chip label={`unplaced: ${ret.unplaced.length}`} color="error" />
            )}
          </>
        )}
      </Stack>

      {tab === 'dpw' ? (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Paper sx={{ p: 2, width: { xs: '100%', md: 320 } }}>
            <Typography variant="subtitle1" mb={1}>Wafer</Typography>
            <Box mb={1}>
              <Typography variant="caption">diameter (mm): {waferDiameter}</Typography>
              <Slider size="small" min={100} max={450} step={10}
                value={waferDiameter} onChange={(_, v) => setWaferDiameter(v as number)} />
            </Box>
            <Box mb={1}>
              <Typography variant="caption">
                edge exclusion (mm): {edgeExclusion.toFixed(1)}
              </Typography>
              <Slider size="small" min={0} max={10} step={0.5}
                value={edgeExclusion} onChange={(_, v) => setEdgeExclusion(v as number)} />
            </Box>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2">Die</Typography>
            <Box mb={1}>
              <Typography variant="caption">width (mm): {dieW.toFixed(2)}</Typography>
              <Slider size="small" min={1} max={30} step={0.5}
                value={dieW} onChange={(_, v) => setDieW(v as number)} />
            </Box>
            <Box mb={1}>
              <Typography variant="caption">height (mm): {dieH.toFixed(2)}</Typography>
              <Slider size="small" min={1} max={30} step={0.5}
                value={dieH} onChange={(_, v) => setDieH(v as number)} />
            </Box>
            <Box mb={1}>
              <Typography variant="caption">scribe (mm): {scribe.toFixed(2)}</Typography>
              <Slider size="small" min={0} max={1} step={0.05}
                value={scribe} onChange={(_, v) => setScribe(v as number)} />
            </Box>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2">Yield</Typography>
            <Box mb={1}>
              <Typography variant="caption">
                D₀ (defects/cm²): {defectDensity.toFixed(2)}
              </Typography>
              <Slider size="small" min={0} max={2} step={0.05}
                value={defectDensity} onChange={(_, v) => setDefectDensity(v as number)} />
            </Box>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={async () => {
                try {
                  const r = await fetch('/api/wafer', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ mode: 'dpw', spec: {
                      waferDiameter, edgeExclusion,
                      dieWidth: dieW, dieHeight: dieH, scribeWidth: scribe,
                      defectDensity,
                    }}),
                  });
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                  const j = await r.json();
                  setInfo(`API gross dies: ${j.grossDies}`);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}>API</Button>
            </Stack>
          </Paper>

          <Paper sx={{ p: 2, flex: 1 }}>
            <Typography variant="subtitle1" mb={1}>Wafer map</Typography>
            <canvas ref={dpwRef} width={520} height={520}
              style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 620 }} />
          </Paper>
        </Stack>
      ) : (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Paper sx={{ p: 2, width: { xs: '100%', md: 360 } }}>
            <Typography variant="subtitle1" mb={1}>Reticle dies (mm)</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Die</TableCell>
                  <TableCell align="right">W</TableCell>
                  <TableCell align="right">H</TableCell>
                  <TableCell>State</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reticleDies.map(d => {
                  const placed = ret.placements.find(p => p.name === d.name);
                  return (
                    <TableRow key={d.name}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{d.name}</TableCell>
                      <TableCell align="right">{d.width}</TableCell>
                      <TableCell align="right">{d.height}</TableCell>
                      <TableCell>
                        <Chip size="small"
                          label={placed ? `(${placed.x.toFixed(1)},${placed.y.toFixed(1)})` : 'unplaced'}
                          sx={{ bgcolor: placed ? '#16a34a' : '#dc2626', color: 'white' }} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
          <Paper sx={{ p: 2, flex: 1 }}>
            <Typography variant="subtitle1" mb={1}>26 × 33 mm reticle window</Typography>
            <canvas ref={retRef} width={520} height={620}
              style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 520 }} />
          </Paper>
        </Stack>
      )}

      <Snackbar open={!!info} autoHideDuration={3000}
        onClose={() => setInfo(null)} message={info ?? ''} />
      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Box>
  );
}
