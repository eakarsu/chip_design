'use client';

/**
 * Congestion-map viewer.
 *
 * Loads an OpenROAD `report_congestion` / `report_global_route` text dump
 * (paste into the textarea or upload a `.rpt` file) and paints a per-tile
 * heatmap onto a canvas, with overflow tiles flagged in red.
 *
 * Companion to `/congestion` which estimates congestion *pre*-routing from
 * net bboxes — this page visualises real router output.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider, IconButton,
  Tooltip, MenuItem, Select, TextField, Snackbar, Table, TableBody,
  TableCell, TableHead, TableRow, FormControlLabel, Switch,
} from '@mui/material';
import { UploadFile, PlayArrow } from '@mui/icons-material';

import {
  parseCongestionReport, tilesToGrid, congestionColor,
  type CongestionReport,
} from '@/lib/tools/congestion_report';

const SAMPLE = `Layer    Resource    Demand    Usage    Max H/V
metal2   12345       6000      48.6%    5 / 8
metal3   8000        7800      97.5%    7 / 9
metal4   6000        2200      36.7%    2 / 4

GCell (0, 0) H: used/cap = 4/16 V: used/cap = 3/16
GCell (1, 0) H: used/cap = 7/16 V: used/cap = 9/16
GCell (2, 0) H: used/cap = 9/16 V: used/cap = 6/16
GCell (3, 0) H: used/cap = 12/16 V: used/cap = 8/16
GCell (0, 1) H: used/cap = 5/16 V: used/cap = 10/16
GCell (1, 1) H: used/cap = 18/16 V: used/cap = 14/16
GCell (2, 1) H: used/cap = 11/16 V: used/cap = 12/16
GCell (3, 1) H: used/cap = 6/16 V: used/cap = 8/16
GCell (0, 2) H: used/cap = 3/16 V: used/cap = 4/16
GCell (1, 2) H: used/cap = 9/16 V: used/cap = 11/16
GCell (2, 2) H: used/cap = 13/16 V: used/cap = 17/16
GCell (3, 2) H: used/cap = 7/16 V: used/cap = 5/16
GCell (0, 3) H: used/cap = 2/16 V: used/cap = 1/16
GCell (1, 3) H: used/cap = 4/16 V: used/cap = 6/16
GCell (2, 3) H: used/cap = 8/16 V: used/cap = 9/16
GCell (3, 3) H: used/cap = 5/16 V: used/cap = 7/16
`;

export default function CongestionMapPage() {
  const [text, setText] = useState<string>(SAMPLE);
  const [report, setReport] = useState<CongestionReport | null>(() => parseCongestionReport(SAMPLE));
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOverflow, setShowOverflow] = useState(true);
  const [hover, setHover] = useState<{ col: number; row: number; t: number } | null>(null);

  const grid = useMemo(() => report ? tilesToGrid(report) : null, [report]);

  function parseLocal() {
    const r = parseCongestionReport(text);
    setReport(r);
    setInfo(`Parsed ${r.tiles.length} tiles, ${r.layers.length} layers`);
  }

  async function parseRemote() {
    try {
      const r = await fetch('/api/openroad/congestion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stdout: text }),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setReport(j);
      setInfo(`API parsed ${j.tiles.length} tiles, ${j.layers.length} layers`);
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
      setReport(parseCongestionReport(txt));
      setInfo(`Loaded ${f.name}`);
    } catch (e) {
      setError(`Load failed: ${(e as Error).message}`);
    } finally {
      ev.target.value = '';
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Paper square sx={{ p: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Typography variant="h6" sx={{ mr: 2 }}>Congestion map</Typography>

          <Button size="small" component="label" variant="outlined" startIcon={<UploadFile />}>
            Load report
            <input hidden type="file" accept=".rpt,.txt,.log" onChange={importFile} />
          </Button>
          <Button size="small" variant="contained" onClick={parseLocal} startIcon={<PlayArrow />}>
            Parse
          </Button>
          <Button size="small" variant="outlined" onClick={parseRemote}>Parse via API</Button>
          <Button size="small" onClick={() => { setText(SAMPLE); setReport(parseCongestionReport(SAMPLE)); }}>
            Demo
          </Button>

          <Divider orientation="vertical" flexItem />

          <FormControlLabel
            control={<Switch checked={showOverflow} onChange={(e) => setShowOverflow(e.target.checked)} />}
            label="Highlight overflow"
          />

          <Box sx={{ flex: 1 }} />
          {report && (
            <>
              <Chip size="small" label={`tiles: ${report.tiles.length}`} />
              <Chip size="small" label={`grid: ${report.cols}×${report.rows}`} />
              <Chip
                size="small"
                color={report.peakUsage > 1 ? 'error' : (report.peakUsage > 0.85 ? 'warning' : 'success')}
                label={`peak: ${(report.peakUsage * 100).toFixed(1)}%`}
              />
              <Chip size="small" variant="outlined" label={`mean: ${(report.meanUsage * 100).toFixed(1)}%`} />
            </>
          )}
        </Stack>
      </Paper>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: input + tables */}
        <Box sx={{ width: 420, borderRight: '1px solid', borderColor: 'divider', overflowY: 'auto', p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Report text</Typography>
          <TextField
            value={text}
            onChange={(e) => setText(e.target.value)}
            multiline minRows={10} maxRows={20} fullWidth
            slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 11 } } }}
          />

          {report && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Per-layer summary</Typography>
              {report.layers.length === 0 ? (
                <Alert severity="info">No per-layer table found.</Alert>
              ) : (
                <Paper variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Layer</TableCell>
                        <TableCell align="right">Demand</TableCell>
                        <TableCell align="right">Usage</TableCell>
                        <TableCell align="right">Max H/V</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {report.layers.map((l) => (
                        <TableRow key={l.layer}>
                          <TableCell sx={{ fontFamily: 'monospace' }}>{l.layer}</TableCell>
                          <TableCell align="right">{l.demand}</TableCell>
                          <TableCell align="right">
                            <Chip
                              size="small"
                              color={l.usage > 0.95 ? 'error' : (l.usage > 0.85 ? 'warning' : 'success')}
                              label={`${(l.usage * 100).toFixed(1)}%`}
                            />
                          </TableCell>
                          <TableCell align="right">{l.maxH} / {l.maxV}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>
              )}

              {report.warnings.length > 0 && (
                <Stack spacing={1} sx={{ mt: 2 }}>
                  {report.warnings.map((w, i) => (
                    <Alert key={i} severity="warning" variant="outlined">{w}</Alert>
                  ))}
                </Stack>
              )}
            </>
          )}
        </Box>

        {/* Right: heatmap */}
        <Box sx={{ flex: 1, position: 'relative', minWidth: 0 }}>
          {grid && grid.cols > 0 && grid.rows > 0 ? (
            <CongestionHeatmap
              grid={grid.grid} cols={grid.cols} rows={grid.rows}
              showOverflow={showOverflow}
              onHover={setHover}
            />
          ) : (
            <Box sx={{ p: 4 }}>
              <Alert severity="info">No tile data — paste an OpenROAD congestion report and press Parse.</Alert>
            </Box>
          )}
          {hover && (
            <Box sx={{
              position: 'absolute', bottom: 12, left: 12,
              bgcolor: 'background.paper', border: '1px solid',
              borderColor: 'divider', borderRadius: 1, p: 1, fontSize: 12,
              fontFamily: 'monospace', boxShadow: 1, pointerEvents: 'none',
            }}>
              gcell ({hover.col}, {hover.row}) — usage {(hover.t * 100).toFixed(1)}%
              {hover.t > 1 && <span style={{ color: 'red', marginLeft: 6 }}>OVERFLOW</span>}
            </Box>
          )}
        </Box>
      </Box>

      {error && <Snackbar open autoHideDuration={6000} onClose={() => setError(null)} message={error} />}
      {info  && <Snackbar open autoHideDuration={3500} onClose={() => setInfo(null)}  message={info} />}
    </Box>
  );
}

// --------------------------------------------------------------------------

interface HeatmapProps {
  grid: number[][];
  cols: number;
  rows: number;
  showOverflow: boolean;
  onHover: (h: { col: number; row: number; t: number } | null) => void;
}

function CongestionHeatmap({ grid, cols, rows, showOverflow, onHover }: HeatmapProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current.parentElement!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit grid into canvas, preserving aspect.
  const tile = useMemo(() => {
    const tw = size.w / cols;
    const th = size.h / rows;
    return Math.max(2, Math.min(tw, th));
  }, [cols, rows, size]);

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

    const ox = (size.w - cols * tile) / 2;
    const oy = (size.h - rows * tile) / 2;

    for (let r = 0; r < rows; r++) {
      for (let cc = 0; cc < cols; cc++) {
        const t = grid[r][cc];
        ctx.fillStyle = congestionColor(Math.min(t, 1.0));
        ctx.fillRect(ox + cc * tile, oy + r * tile, tile + 0.5, tile + 0.5);
        if (showOverflow && t > 1) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.25;
          ctx.strokeRect(ox + cc * tile + 1, oy + r * tile + 1, tile - 2, tile - 2);
        }
      }
    }

    // Frame.
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox - 0.5, oy - 0.5, cols * tile + 1, rows * tile + 1);
  }, [grid, cols, rows, tile, size, showOverflow]);

  function onMove(ev: React.MouseEvent<HTMLCanvasElement>) {
    const rect = ev.currentTarget.getBoundingClientRect();
    const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
    const ox = (size.w - cols * tile) / 2;
    const oy = (size.h - rows * tile) / 2;
    const cc = Math.floor((px - ox) / tile);
    const r = Math.floor((py - oy) / tile);
    if (cc < 0 || cc >= cols || r < 0 || r >= rows) {
      onHover(null);
    } else {
      onHover({ col: cc, row: r, t: grid[r][cc] });
    }
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
