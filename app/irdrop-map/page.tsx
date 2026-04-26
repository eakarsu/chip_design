'use client';

/**
 * IR-drop map viewer.
 *
 * Loads an OpenROAD IR-drop report (per-instance + per-net) and renders:
 *   - a per-instance scatter heatmap on the design floorplan;
 *   - a binned density heatmap so cluster hotspots stand out;
 *   - a per-net summary table;
 *   - a "worst-N" instance table.
 *
 * Companion to `/ir-drop` which simulates IR drop from PDN parameters —
 * this page visualises real signoff results.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider,
  TextField, Snackbar, Table, TableBody, TableCell, TableHead, TableRow,
  ToggleButton, ToggleButtonGroup, FormControlLabel, Switch,
} from '@mui/material';
import { UploadFile, PlayArrow } from '@mui/icons-material';

import {
  parseIRReport, rasteriseIR, irColor,
  type IRReport, type IRInstance,
} from '@/lib/tools/irdrop';

const SAMPLE = `Instance         Layer    Voltage   IR_drop
inst_1/VDD       metal4   0.8950    0.0050   100  100
inst_2/VDD       metal4   0.8910    0.0090   200  100
inst_3/VDD       metal4   0.8800    0.0200   300  300
inst_4/VDD       metal4   0.8700    0.0300   100  300
inst_5/VDD       metal4   0.8920    0.0080   400  150
inst_6/VDD       metal4   0.8750    0.0250   320  280
inst_7/VDD       metal4   0.8830    0.0170   220  220
inst_8/VDD       metal4   0.8650    0.0350   150  340

Net VDD: max IR drop = 0.0350 V at inst_8/VDD, mean = 0.0185 V
Net VSS: max IR drop = 0.0150 V, mean = 0.0070 V
`;

export default function IRDropMapPage() {
  const [text, setText] = useState<string>(SAMPLE);
  const [report, setReport] = useState<IRReport>(() => parseIRReport(SAMPLE));
  const [view, setView] = useState<'scatter' | 'heatmap'>('scatter');
  const [bins, setBins] = useState<number>(8);
  const [showLabels, setShowLabels] = useState<boolean>(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<IRInstance | null>(null);

  function parseLocal() {
    const r = parseIRReport(text);
    setReport(r);
    setInfo(`Parsed ${r.instances.length} instances, ${r.nets.length} nets`);
  }
  async function parseRemote() {
    try {
      const r = await fetch('/api/openroad/irdrop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stdout: text }),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setReport(j);
      setInfo(`API parsed ${j.instances.length} instances`);
    } catch (e) {
      setError(`API parse failed: ${(e as Error).message}`);
    }
  }
  async function importFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const txt = await f.text();
      setText(txt);
      setReport(parseIRReport(txt));
      setInfo(`Loaded ${f.name}`);
    } catch (e) {
      setError(`Load failed: ${(e as Error).message}`);
    } finally {
      ev.target.value = '';
    }
  }

  const placed = useMemo(
    () => report.instances.filter(i => i.x !== undefined && i.y !== undefined),
    [report],
  );
  const worstN = useMemo(
    () => [...report.instances].sort((a, b) => b.drop - a.drop).slice(0, 20),
    [report],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Paper square sx={{ p: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Typography variant="h6" sx={{ mr: 2 }}>IR-drop map</Typography>

          <Button size="small" component="label" variant="outlined" startIcon={<UploadFile />}>
            Load report
            <input hidden type="file" accept=".rpt,.txt,.log" onChange={importFile} />
          </Button>
          <Button size="small" variant="contained" startIcon={<PlayArrow />} onClick={parseLocal}>Parse</Button>
          <Button size="small" variant="outlined" onClick={parseRemote}>Parse via API</Button>
          <Button size="small" onClick={() => { setText(SAMPLE); setReport(parseIRReport(SAMPLE)); }}>Demo</Button>

          <Divider orientation="vertical" flexItem />

          <ToggleButtonGroup
            size="small" exclusive
            value={view} onChange={(_, v) => v && setView(v)}
          >
            <ToggleButton value="scatter">Scatter</ToggleButton>
            <ToggleButton value="heatmap">Heatmap</ToggleButton>
          </ToggleButtonGroup>

          {view === 'heatmap' && (
            <TextField
              size="small" label="Bins" type="number" value={bins}
              onChange={(e) => setBins(Math.max(2, Math.min(64, Number(e.target.value))))}
              sx={{ width: 90 }}
            />
          )}
          <FormControlLabel
            control={<Switch checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />}
            label="Labels"
          />

          <Box sx={{ flex: 1 }} />
          <Chip size="small" label={`${report.instances.length} instances`} />
          <Chip
            size="small"
            color={report.worstDrop > 0.05 ? 'error' : (report.worstDrop > 0.025 ? 'warning' : 'success')}
            label={`worst: ${(report.worstDrop * 1000).toFixed(1)} mV`}
          />
          <Chip size="small" variant="outlined" label={`mean: ${(report.meanDrop * 1000).toFixed(1)} mV`} />
        </Stack>
      </Paper>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: input + tables */}
        <Box sx={{ width: 420, borderRight: '1px solid', borderColor: 'divider', overflowY: 'auto', p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Report text</Typography>
          <TextField
            value={text}
            onChange={(e) => setText(e.target.value)}
            multiline minRows={8} maxRows={16} fullWidth
            slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 11 } } }}
          />

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Per-net summary</Typography>
          {report.nets.length === 0 ? (
            <Alert severity="info">No per-net summary lines.</Alert>
          ) : (
            <Paper variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Net</TableCell>
                    <TableCell align="right">Max drop</TableCell>
                    <TableCell align="right">Mean</TableCell>
                    <TableCell>Worst inst.</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.nets.map(n => (
                    <TableRow key={n.net}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{n.net}</TableCell>
                      <TableCell align="right">
                        <Chip
                          size="small"
                          color={n.maxDrop > 0.05 ? 'error' : (n.maxDrop > 0.025 ? 'warning' : 'success')}
                          label={`${(n.maxDrop * 1000).toFixed(1)} mV`}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {n.meanDrop !== undefined ? `${(n.meanDrop * 1000).toFixed(1)} mV` : '—'}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                        {n.worstInstance ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Worst instances</Typography>
          <Paper variant="outlined" sx={{ maxHeight: 280, overflowY: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Instance</TableCell>
                  <TableCell align="right">Voltage</TableCell>
                  <TableCell align="right">IR drop</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {worstN.map(i => (
                  <TableRow
                    key={i.instance}
                    hover selected={hover?.instance === i.instance}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{i.instance}</TableCell>
                    <TableCell align="right">{i.voltage.toFixed(4)}</TableCell>
                    <TableCell align="right" sx={{
                      color: i.drop > 0.05 ? '#dc2626' : (i.drop > 0.025 ? '#d97706' : '#059669'),
                    }}>
                      {(i.drop * 1000).toFixed(2)} mV
                    </TableCell>
                  </TableRow>
                ))}
                {worstN.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Typography variant="caption" color="text.secondary">No instances parsed.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>

          {report.warnings.length > 0 && (
            <Stack spacing={1} sx={{ mt: 2 }}>
              {report.warnings.map((w, i) => (
                <Alert key={i} severity="warning" variant="outlined">{w}</Alert>
              ))}
            </Stack>
          )}
        </Box>

        {/* Right: viewer */}
        <Box sx={{ flex: 1, position: 'relative', minWidth: 0 }}>
          {placed.length === 0 ? (
            <Box sx={{ p: 4 }}>
              <Alert severity="info">
                No coordinate-tagged instances parsed. The viewer needs `X Y` columns
                (microns) on each instance row, e.g.<br />
                <code>inst_1/VDD metal4 0.895 0.005 100 100</code>
              </Alert>
            </Box>
          ) : (
            <IRViewer
              instances={placed}
              worstDrop={report.worstDrop}
              view={view}
              bins={bins}
              showLabels={showLabels}
              hover={hover}
              onHover={setHover}
            />
          )}
        </Box>
      </Box>

      {error && <Snackbar open autoHideDuration={6000} onClose={() => setError(null)} message={error} />}
      {info  && <Snackbar open autoHideDuration={3500} onClose={() => setInfo(null)}  message={info} />}
    </Box>
  );
}

// --------------------------------------------------------------------------

interface IRViewerProps {
  instances: IRInstance[];
  worstDrop: number;
  view: 'scatter' | 'heatmap';
  bins: number;
  showLabels: boolean;
  hover: IRInstance | null;
  onHover: (i: IRInstance | null) => void;
}

function IRViewer({ instances, worstDrop, view, bins, showLabels, hover, onHover }: IRViewerProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current.parentElement!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const xform = useMemo(() => {
    let xl = Infinity, yl = Infinity, xh = -Infinity, yh = -Infinity;
    for (const i of instances) {
      xl = Math.min(xl, i.x!); xh = Math.max(xh, i.x!);
      yl = Math.min(yl, i.y!); yh = Math.max(yh, i.y!);
    }
    if (xh === xl) xh = xl + 1;
    if (yh === yl) yh = yl + 1;
    const m = 30;
    const w = xh - xl, h = yh - yl;
    const sx = (size.w - 2 * m) / w;
    const sy = (size.h - 2 * m) / h;
    const s = Math.min(sx, sy);
    const ox = m + (size.w - 2 * m - w * s) / 2 - xl * s;
    const oy = size.h - m - (size.h - 2 * m - h * s) / 2 + yl * s;
    return { s, ox, oy, xl, yl, xh, yh, worldToScreen: (x: number, y: number) => ({ x: ox + x * s, y: oy - y * s }) };
  }, [instances, size]);

  const grid = useMemo(() => {
    if (view !== 'heatmap') return null;
    return rasteriseIR(instances, bins, bins);
  }, [view, bins, instances]);

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

    const norm = (v: number) => worstDrop > 0 ? v / worstDrop : 0;

    // Frame
    const a = xform.worldToScreen(xform.xl, xform.yh);
    const b = xform.worldToScreen(xform.xh, xform.yl);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.strokeRect(a.x - 0.5, a.y - 0.5, b.x - a.x + 1, b.y - a.y + 1);

    if (grid) {
      // Heatmap: paint binned cells
      const wx = (xform.xh - xform.xl) / grid.cols;
      const wy = (xform.yh - xform.yl) / grid.rows;
      for (let r = 0; r < grid.rows; r++) {
        for (let cc = 0; cc < grid.cols; cc++) {
          const v = grid.drop[r][cc];
          if (v === 0) continue;
          const tl = xform.worldToScreen(xform.xl + cc * wx, xform.yl + (r + 1) * wy);
          const br = xform.worldToScreen(xform.xl + (cc + 1) * wx, xform.yl + r * wy);
          ctx.fillStyle = irColor(norm(v));
          ctx.globalAlpha = 0.85;
          ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Scatter dots (always drawn — hover relies on them)
    for (const i of instances) {
      const p = xform.worldToScreen(i.x!, i.y!);
      const r = i === hover ? 6 : 4;
      ctx.beginPath();
      ctx.fillStyle = irColor(norm(i.drop));
      ctx.strokeStyle = i === hover ? '#0f172a' : 'rgba(15,23,42,0.6)';
      ctx.lineWidth = i === hover ? 2 : 1;
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (showLabels && view === 'scatter') {
        ctx.fillStyle = '#0f172a';
        ctx.font = '10px system-ui';
        ctx.fillText(i.instance, p.x + 6, p.y - 4);
      }
    }

    // Hover tip
    if (hover) {
      const p = xform.worldToScreen(hover.x!, hover.y!);
      const lines = [
        hover.instance,
        `V: ${hover.voltage.toFixed(4)}`,
        `IR drop: ${(hover.drop * 1000).toFixed(2)} mV`,
        ...(hover.layer ? [`layer: ${hover.layer}`] : []),
      ];
      ctx.font = '11px system-ui';
      const lw = Math.max(...lines.map(s => ctx.measureText(s).width)) + 12;
      const lh = lines.length * 14 + 8;
      let bx = p.x + 10, by = p.y - lh - 8;
      if (bx + lw > size.w) bx = p.x - lw - 10;
      if (by < 0) by = p.y + 12;
      ctx.fillStyle = 'rgba(15,23,42,0.92)';
      ctx.fillRect(bx, by, lw, lh);
      ctx.fillStyle = '#f1f5f9';
      lines.forEach((s, i) => ctx.fillText(s, bx + 6, by + 16 + i * 14));
    }
  }, [instances, size, xform, grid, view, hover, worstDrop, showLabels]);

  function onMove(ev: React.MouseEvent<HTMLCanvasElement>) {
    const rect = ev.currentTarget.getBoundingClientRect();
    const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
    let best: { i: IRInstance; d2: number } | null = null;
    for (const i of instances) {
      const p = xform.worldToScreen(i.x!, i.y!);
      const dx = px - p.x, dy = py - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 64 && (!best || d2 < best.d2)) best = { i, d2 };
    }
    onHover(best?.i ?? null);
  }

  return (
    <Box sx={{ width: '100%', height: '100%', bgcolor: 'background.default' }}>
      <canvas
        ref={ref}
        style={{ display: 'block' }}
        onMouseMove={onMove}
        onMouseLeave={() => onHover(null)}
      />
    </Box>
  );
}
