'use client';

/**
 * Density-fill inserter UI.
 *
 * Lay out an obstacle scene, set fill parameters, and visualise the
 * inserted dummy-fill rectangles on a canvas alongside before/after
 * density heatmaps.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider,
  Slider, Snackbar, TextField,
} from '@mui/material';
import { PlayArrow, ContentCopy } from '@mui/icons-material';

import {
  insertFill, type FillSpec, type FillReport, type FillRect,
} from '@/lib/tools/density_fill';

const SAMPLE_OBSTACLES: FillRect[] = [
  { x1: 4, y1: 4, x2: 8, y2: 8 },
  { x1: 12, y1: 6, x2: 14, y2: 14 },
  { x1: 2, y1: 14, x2: 7, y2: 16 },
];

export default function DensityFillPage() {
  const [target, setTarget]       = useState(0.4);
  const [cell, setCell]           = useState(0.8);
  const [pitch, setPitch]         = useState(1.2);
  const [minSpacing, setMinSpace] = useState(0.2);
  const [bins, setBins]           = useState(8);
  const [obstacleText, setObstacleText] = useState<string>(
    JSON.stringify(SAMPLE_OBSTACLES, null, 2),
  );
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const obstacles: FillRect[] | null = useMemo(() => {
    try {
      const arr = JSON.parse(obstacleText);
      if (!Array.isArray(arr)) return null;
      return arr;
    } catch { return null; }
  }, [obstacleText]);

  const spec: FillSpec = useMemo(() => ({
    window: { x1: 0, y1: 0, x2: 20, y2: 20 },
    obstacles: obstacles ?? [],
    targetDensity: target,
    cellW: cell, cellH: cell,
    pitch,
    minSpacing,
    bins,
  }), [obstacles, target, cell, pitch, minSpacing, bins]);

  const report: FillReport | null = useMemo(() => {
    if (!obstacles) return null;
    try { return insertFill(spec); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return null; }
  }, [spec, obstacles]);

  // ----- canvas -----
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !report || !obstacles) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const ww = spec.window.x2 - spec.window.x1;
    const wh = spec.window.y2 - spec.window.y1;
    const pad = 14;
    const sx = (W - 2 * pad) / ww;
    const sy = (H - 2 * pad) / wh;
    const s = Math.min(sx, sy);
    const ox = (W - ww * s) / 2;
    const oy = (H - wh * s) / 2;

    function flipY(y: number) {
      return oy + (spec.window.y2 - y) * s;
    }
    function drawRect(r: FillRect, fill: string, stroke?: string) {
      const x = ox + (r.x1 - spec.window.x1) * s;
      const y = flipY(r.y2);
      const w = (r.x2 - r.x1) * s;
      const h = (r.y2 - r.y1) * s;
      ctx!.fillStyle = fill;
      ctx!.fillRect(x, y, w, h);
      if (stroke) {
        ctx!.strokeStyle = stroke;
        ctx!.strokeRect(x, y, w, h);
      }
    }

    // Heatmap (after)
    const { binsX, binsY, binW, binH, after } = report;
    for (let by = 0; by < binsY; by++) {
      for (let bx = 0; bx < binsX; bx++) {
        const v = Math.min(1, after[by][bx] / Math.max(target, 0.01));
        const r = Math.floor(255 * (1 - v) * 0.7 + 80);
        const g = Math.floor(255 * v * 0.7 + 80);
        const bbl: FillRect = {
          x1: spec.window.x1 + bx * binW,
          y1: spec.window.y1 + by * binH,
          x2: spec.window.x1 + (bx + 1) * binW,
          y2: spec.window.y1 + (by + 1) * binH,
        };
        drawRect(bbl, `rgba(${r},${g},120,0.18)`);
      }
    }
    // Window border
    ctx.strokeStyle = '#0f172a';
    ctx.strokeRect(ox, oy, ww * s, wh * s);
    // Obstacles
    for (const o of obstacles) drawRect(o, '#475569', '#1e293b');
    // Fills
    for (const f of report.fills) drawRect(f, '#22c55e', '#15803d');
  }, [report, obstacles, spec, target]);

  async function copyFills() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report.fills, null, 2));
      setInfo(`Copied ${report.fills.length} fill rects`);
    } catch { setError('Clipboard write failed'); }
  }

  async function callApi() {
    try {
      const r = await fetch('/api/density-fill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(spec),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setInfo(`API: ${j.fills.length} fills, mean ${(j.meanAfter * 100).toFixed(1)}%`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <Typography variant="h4">Density Fill</Typography>
        {report && (
          <>
            <Chip label={`fills: ${report.fills.length}`} />
            <Chip
              label={`mean: ${(report.meanAfter * 100).toFixed(1)}%`}
              color={report.meanAfter >= target ? 'success' : 'warning'}
            />
            <Chip
              label={`target: ${(target * 100).toFixed(0)}%`}
            />
            <Chip
              label={`under: ${report.underfilled.length}`}
              color={report.underfilled.length > 0 ? 'warning' : 'default'}
            />
          </>
        )}
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, width: { xs: '100%', md: 320 } }}>
          <Typography variant="subtitle1" mb={1}>Parameters</Typography>
          <Stack spacing={1.5}>
            <RowSlider label="targetDensity" min={0} max={1} step={0.05}
              value={target} onChange={setTarget} fmt={v => `${(v * 100).toFixed(0)}%`} />
            <RowSlider label="cell size (μm)" min={0.2} max={3} step={0.1}
              value={cell} onChange={setCell} />
            <RowSlider label="pitch (μm)" min={0.5} max={6} step={0.1}
              value={pitch} onChange={setPitch} />
            <RowSlider label="minSpacing (μm)" min={0} max={1} step={0.05}
              value={minSpacing} onChange={setMinSpace} />
            <RowSlider label="bins" min={2} max={20} step={1}
              value={bins} onChange={setBins} fmt={v => v.toFixed(0)} />
          </Stack>

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" mb={1}>Obstacles JSON</Typography>
          <TextField
            multiline minRows={6} maxRows={12} fullWidth
            value={obstacleText}
            onChange={e => setObstacleText(e.target.value)}
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 11 } }}
          />
          {!obstacles && <Alert severity="error" sx={{ mt: 1 }}>Invalid JSON</Alert>}
          <Stack direction="row" spacing={1} mt={1}>
            <Button startIcon={<PlayArrow />} variant="outlined" onClick={callApi}>
              Run via API
            </Button>
            <Button startIcon={<ContentCopy />} onClick={copyFills}
              disabled={!report || report.fills.length === 0}>
              Copy fills
            </Button>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle1" mb={1}>Layout</Typography>
          <canvas
            ref={canvasRef}
            width={520}
            height={520}
            style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 600 }}
          />
          <Stack direction="row" spacing={1} mt={1}>
            <Chip size="small" label="obstacle"
              sx={{ bgcolor: '#475569', color: 'white' }} />
            <Chip size="small" label="fill"
              sx={{ bgcolor: '#22c55e', color: 'white' }} />
          </Stack>
        </Paper>
      </Stack>

      <Snackbar
        open={!!info}
        autoHideDuration={3000}
        onClose={() => setInfo(null)}
        message={info ?? ''}
      />
      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={() => setError(null)}
      >
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Box>
  );
}

function RowSlider({
  label, value, onChange, min, max, step, fmt,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number;
  fmt?: (v: number) => string;
}) {
  return (
    <Box>
      <Typography variant="caption">
        {label}: {fmt ? fmt(value) : value}
      </Typography>
      <Slider size="small" min={min} max={max} step={step} value={value}
        onChange={(_, v) => onChange(v as number)} />
    </Box>
  );
}
