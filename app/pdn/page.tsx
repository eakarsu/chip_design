'use client';

/**
 * PDN generator UI.
 *
 * Edit a parametric spec, preview the rings/stripes/straps on a canvas,
 * inspect the generated DEF SPECIALNETS block, and copy it to the
 * clipboard. Each input updates the preview in real time.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider,
  TextField, Snackbar, Slider,
} from '@mui/material';
import { ContentCopy } from '@mui/icons-material';

import {
  generatePdn, emitDef, exampleSpec, type PdnSpec, type Rect, type PdnResult,
} from '@/lib/tools/pdn';

const NET_COLOR = { VDD: '#ef4444', VSS: '#3b82f6' } as const;

export default function PdnPage() {
  const [spec, setSpec] = useState<PdnSpec>(exampleSpec);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const result: PdnResult | null = useMemo(() => {
    try { return generatePdn(spec); }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [spec]);

  const def = useMemo(
    () => result ? emitDef(result, spec) : '',
    [result, spec],
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !result) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    const cw = spec.core.x2 - spec.core.x1;
    const ch = spec.core.y2 - spec.core.y1;
    const pad = 20;
    const sx = (W - 2 * pad) / cw;
    const sy = (H - 2 * pad) / ch;
    const s = Math.min(sx, sy);
    const ox = (W - cw * s) / 2;
    const oy = (H - ch * s) / 2;

    ctx.strokeStyle = '#94a3b8';
    ctx.strokeRect(ox, oy, cw * s, ch * s);

    function draw(r: Rect, alpha: number) {
      const x = ox + (r.x1 - spec.core.x1) * s;
      const y = oy + (spec.core.y2 - r.y2) * s;
      const w = (r.x2 - r.x1) * s;
      const h = (r.y2 - r.y1) * s;
      ctx!.fillStyle = NET_COLOR[r.net];
      ctx!.globalAlpha = alpha;
      ctx!.fillRect(x, y, Math.max(1, w), Math.max(1, h));
      ctx!.globalAlpha = 1;
    }
    for (const r of result.straps)  draw(r, 0.45);
    for (const r of result.stripes) draw(r, 0.7);
    for (const r of result.rings)   draw(r, 0.95);
  }, [result, spec]);

  function patch<K extends keyof PdnSpec>(k: K, v: PdnSpec[K]) {
    setSpec(prev => ({ ...prev, [k]: v }));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(def);
      setInfo('DEF copied');
    } catch {
      setError('Clipboard write failed');
    }
  }

  async function callApi() {
    try {
      const r = await fetch('/api/pdn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ spec }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setInfo(`API: ${j.metrics.rings} rings, ${j.metrics.stripes} stripes, ${j.metrics.straps} straps`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <Typography variant="h4">PDN Generator</Typography>
        {result && (
          <>
            <Chip label={`rings: ${result.metrics.rings}`} />
            <Chip label={`stripes: ${result.metrics.stripes}`} />
            <Chip label={`straps: ${result.metrics.straps}`} />
            <Chip
              label={`coverage: ${(result.metrics.coverage * 100).toFixed(1)}%`}
              color={result.metrics.coverage > 0.5 ? 'warning' : 'default'}
            />
          </>
        )}
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, width: { xs: '100%', md: 360 } }}>
          <Typography variant="subtitle1" mb={1}>Spec</Typography>
          <Stack spacing={1.5}>
            <CoreField spec={spec} setSpec={setSpec} />
            <RowSlider
              label="ringWidth (μm)"
              min={1} max={10} step={0.5}
              value={spec.ringWidth}
              onChange={v => patch('ringWidth', v)}
            />
            <RowSlider
              label="ringOffset (μm)"
              min={0} max={10} step={0.5}
              value={spec.ringOffset}
              onChange={v => patch('ringOffset', v)}
            />
            <RowSlider
              label="stripeWidth (μm)"
              min={0.5} max={6} step={0.25}
              value={spec.stripeWidth}
              onChange={v => patch('stripeWidth', v)}
            />
            <RowSlider
              label="stripePitch (μm)"
              min={5} max={80} step={1}
              value={spec.stripePitch}
              onChange={v => patch('stripePitch', v)}
            />
            <RowSlider
              label="strapWidth (μm)"
              min={0.1} max={3} step={0.1}
              value={spec.strapWidth ?? 0.5}
              onChange={v => patch('strapWidth', v)}
            />
            <RowSlider
              label="strapPitch (μm)"
              min={2} max={40} step={1}
              value={spec.strapPitch ?? 8}
              onChange={v => patch('strapPitch', v)}
            />
            <Stack direction="row" spacing={1}>
              <TextField
                size="small" label="ring H layer"
                value={spec.ringLayers[0]}
                onChange={e => patch('ringLayers', [e.target.value, spec.ringLayers[1]])}
              />
              <TextField
                size="small" label="ring V layer"
                value={spec.ringLayers[1]}
                onChange={e => patch('ringLayers', [spec.ringLayers[0], e.target.value])}
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small" label="stripe layer"
                value={spec.stripeLayer}
                onChange={e => patch('stripeLayer', e.target.value)}
              />
              <TextField
                size="small" label="strap layer"
                value={spec.strapLayer ?? ''}
                onChange={e => patch('strapLayer', e.target.value || undefined)}
              />
            </Stack>
            <Button variant="outlined" onClick={callApi}>Validate via API</Button>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle1" mb={1}>Preview</Typography>
          <canvas
            ref={canvasRef}
            width={520}
            height={420}
            style={{ border: '1px solid #cbd5e1', width: '100%' }}
          />
          <Stack direction="row" spacing={1} mt={1}>
            <Chip
              size="small"
              label="VDD"
              sx={{ bgcolor: NET_COLOR.VDD, color: 'white' }}
            />
            <Chip
              size="small"
              label="VSS"
              sx={{ bgcolor: NET_COLOR.VSS, color: 'white' }}
            />
          </Stack>
        </Paper>
      </Stack>

      <Divider sx={{ my: 3 }} />

      <Paper sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="subtitle1">DEF SPECIALNETS</Typography>
          <Button startIcon={<ContentCopy />} size="small" onClick={copy}>Copy</Button>
        </Stack>
        <TextField
          multiline
          fullWidth
          minRows={10}
          maxRows={20}
          value={def}
          InputProps={{ readOnly: true, style: { fontFamily: 'monospace', fontSize: 12 } }}
        />
      </Paper>

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
  label, value, onChange, min, max, step,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number;
}) {
  return (
    <Box>
      <Typography variant="caption">{label}: {value}</Typography>
      <Slider
        size="small" min={min} max={max} step={step} value={value}
        onChange={(_, v) => onChange(v as number)}
      />
    </Box>
  );
}

function CoreField({
  spec, setSpec,
}: {
  spec: PdnSpec; setSpec: (fn: (p: PdnSpec) => PdnSpec) => void;
}) {
  const setBound = (k: 'x1' | 'y1' | 'x2' | 'y2', v: number) =>
    setSpec(prev => ({ ...prev, core: { ...prev.core, [k]: v } }));
  return (
    <Box>
      <Typography variant="caption">Core (μm)</Typography>
      <Stack direction="row" spacing={1}>
        <TextField size="small" label="x1" type="number" value={spec.core.x1}
          onChange={e => setBound('x1', Number(e.target.value))} />
        <TextField size="small" label="y1" type="number" value={spec.core.y1}
          onChange={e => setBound('y1', Number(e.target.value))} />
        <TextField size="small" label="x2" type="number" value={spec.core.x2}
          onChange={e => setBound('x2', Number(e.target.value))} />
        <TextField size="small" label="y2" type="number" value={spec.core.y2}
          onChange={e => setBound('y2', Number(e.target.value))} />
      </Stack>
    </Box>
  );
}
