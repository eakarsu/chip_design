'use client';

/**
 * Layer boolean operations playground.
 *
 * Define two rect lists "A" and "B", choose AND/OR/XOR/NOT/SIZE, and see
 * the result rendered alongside the inputs with overlay tinting.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider,
  TextField, Snackbar, ToggleButton, ToggleButtonGroup, Slider,
} from '@mui/material';
import { ContentCopy } from '@mui/icons-material';

import {
  layerBool, layerSize, totalArea, type Rect, type BoolOp,
} from '@/lib/tools/layer_bool';

type Op = BoolOp | 'size';

const SAMPLE_A: Rect[] = [
  { x1: 0,  y1: 0,  x2: 60, y2: 60 },
  { x1: 70, y1: 70, x2: 100, y2: 100 },
];
const SAMPLE_B: Rect[] = [
  { x1: 30, y1: 30, x2: 90, y2: 90 },
  { x1: 0,  y1: 70, x2: 20, y2: 95 },
];

export default function LayerBoolPage() {
  const [aText, setA] = useState(JSON.stringify(SAMPLE_A, null, 2));
  const [bText, setB] = useState(JSON.stringify(SAMPLE_B, null, 2));
  const [op, setOp] = useState<Op>('and');
  const [delta, setDelta] = useState<number>(2);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const a = useMemo(() => parseRects(aText), [aText]);
  const b = useMemo(() => parseRects(bText), [bText]);

  const result = useMemo(() => {
    if (!a) return [];
    if (op === 'size') return layerSize(a, delta);
    if (!b) return [];
    return layerBool(a, b, op);
  }, [a, b, op, delta]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    const all = [...(a ?? []), ...(b ?? []), ...result];
    if (all.length === 0) return;
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (const r of all) {
      if (r.x1 < xmin) xmin = r.x1;
      if (r.y1 < ymin) ymin = r.y1;
      if (r.x2 > xmax) xmax = r.x2;
      if (r.y2 > ymax) ymax = r.y2;
    }
    const pad = 16;
    const sx = (W - 2 * pad) / Math.max(1, xmax - xmin);
    const sy = (H - 2 * pad) / Math.max(1, ymax - ymin);
    const s = Math.min(sx, sy);
    const ox = pad - xmin * s;
    const oy = pad - ymin * s;

    function flipY(y: number) { return H - oy - y * s; }
    function box(r: Rect, fill: string, stroke: string) {
      const x = ox + r.x1 * s;
      const y = flipY(r.y2);
      const w = (r.x2 - r.x1) * s;
      const h = (r.y2 - r.y1) * s;
      ctx!.fillStyle = fill; ctx!.fillRect(x, y, w, h);
      ctx!.strokeStyle = stroke; ctx!.strokeRect(x, y, w, h);
    }
    if (a) for (const r of a) box(r, 'rgba(59,130,246,0.25)', '#1d4ed8');
    if (b && op !== 'size') for (const r of b) box(r, 'rgba(245,158,11,0.25)', '#b45309');
    for (const r of result) box(r, 'rgba(34,197,94,0.55)', '#15803d');
  }, [a, b, op, delta, result]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setInfo('Result copied');
    } catch { setError('Clipboard write failed'); }
  }

  async function callApi() {
    if (!a) return;
    try {
      const body = op === 'size' ? { op, a, delta } : { op, a, b: b ?? [] };
      const r = await fetch('/api/layer-bool', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setInfo(`API: ${j.count} rects, area=${j.area.toFixed(2)}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap">
        <Typography variant="h4">Layer Boolean</Typography>
        <Chip label={`A: ${a?.length ?? 0}`} sx={{ bgcolor: '#1d4ed8', color: 'white' }} />
        {op !== 'size' && (
          <Chip label={`B: ${b?.length ?? 0}`} sx={{ bgcolor: '#b45309', color: 'white' }} />
        )}
        <Chip label={`Result: ${result.length}`}
          sx={{ bgcolor: '#15803d', color: 'white' }} />
        <Chip label={`Area: ${totalArea(result).toFixed(2)}`} />
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, width: { xs: '100%', md: 300 } }}>
          <Typography variant="subtitle1" mb={1}>Operation</Typography>
          <ToggleButtonGroup
            exclusive size="small" value={op}
            onChange={(_, v) => v && setOp(v as Op)}
          >
            <ToggleButton value="and">AND</ToggleButton>
            <ToggleButton value="or">OR</ToggleButton>
            <ToggleButton value="xor">XOR</ToggleButton>
            <ToggleButton value="not">NOT</ToggleButton>
            <ToggleButton value="size">SIZE</ToggleButton>
          </ToggleButtonGroup>
          {op === 'size' && (
            <Box mt={2}>
              <Typography variant="caption">delta: {delta}</Typography>
              <Slider size="small" min={-10} max={20} step={0.5}
                value={delta} onChange={(_, v) => setDelta(v as number)} />
            </Box>
          )}
          <Stack direction="row" spacing={1} mt={2}>
            <Button size="small" variant="outlined" onClick={callApi}>
              Validate via API
            </Button>
            <Button size="small" startIcon={<ContentCopy />} onClick={copy}>Copy</Button>
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2">A (rects)</Typography>
          <TextField multiline minRows={5} maxRows={12} fullWidth
            value={aText}
            onChange={e => setA(e.target.value)}
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 11 } }} />
          {!a && <Alert severity="error" sx={{ mt: 1 }}>Invalid JSON</Alert>}
          {op !== 'size' && (
            <>
              <Typography variant="subtitle2" mt={2}>B (rects)</Typography>
              <TextField multiline minRows={5} maxRows={12} fullWidth
                value={bText}
                onChange={e => setB(e.target.value)}
                inputProps={{ style: { fontFamily: 'monospace', fontSize: 11 } }} />
              {!b && <Alert severity="error" sx={{ mt: 1 }}>Invalid JSON</Alert>}
            </>
          )}
        </Paper>

        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle1" mb={1}>Preview</Typography>
          <canvas ref={canvasRef} width={520} height={420}
            style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 720 }} />
          <Stack direction="row" spacing={1} mt={1}>
            <Chip size="small" label="A"
              sx={{ bgcolor: 'rgba(59,130,246,0.4)', color: '#1d4ed8' }} />
            {op !== 'size' && (
              <Chip size="small" label="B"
                sx={{ bgcolor: 'rgba(245,158,11,0.4)', color: '#b45309' }} />
            )}
            <Chip size="small" label="Result"
              sx={{ bgcolor: 'rgba(34,197,94,0.6)', color: '#15803d' }} />
          </Stack>
        </Paper>
      </Stack>

      <Snackbar open={!!info} autoHideDuration={3000} onClose={() => setInfo(null)} message={info ?? ''} />
      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Box>
  );
}

function parseRects(s: string): Rect[] | null {
  try {
    const j = JSON.parse(s);
    if (!Array.isArray(j)) return null;
    for (const r of j) {
      if (typeof r.x1 !== 'number' || typeof r.x2 !== 'number'
        || typeof r.y1 !== 'number' || typeof r.y2 !== 'number') return null;
    }
    return j as Rect[];
  } catch { return null; }
}
