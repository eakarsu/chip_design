'use client';

/**
 * Multi-layer heatmap renderer.
 *
 * Accepts an ordered list of named 2D scalar grids (layers) and renders them
 * stacked on a single canvas with per-layer visibility + opacity controls.
 * All layers must share the same (rows × cols) shape — the caller is
 * responsible for resampling before passing them in; mismatched layers are
 * rendered individually with a warning.
 *
 * Designed for the case where you want to see congestion, IR-drop and
 * thermal on the same die footprint without flipping between three tabs.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Paper, Typography, Stack, Checkbox, Slider, FormControlLabel,
} from '@mui/material';

export interface HeatLayer {
  id: string;
  name: string;
  /** rows × cols grid of non-negative scalars. */
  data: number[][];
  /**
   * Three-stop colour ramp [low, mid, high] as CSS hex. Each layer keeps
   * its own palette so viewers can tell congestion red from IR-drop red.
   */
  palette: [string, string, string];
  defaultOpacity?: number;
}

export interface LayeredHeatmapProps {
  layers: HeatLayer[];
  width?: number;
  height?: number;
  title?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function mixColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function sampleColor(palette: [string, string, string], t: number): [number, number, number] {
  const [lo, mid, hi] = palette.map(hexToRgb) as [number, number, number][];
  const clamped = Math.max(0, Math.min(1, t));
  return clamped < 0.5
    ? mixColor(lo, mid, clamped * 2)
    : mixColor(mid, hi, (clamped - 0.5) * 2);
}

function gridMinMax(data: number[][]): [number, number] {
  let min = Infinity, max = -Infinity;
  for (const row of data) {
    for (const v of row) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return [min, max];
}

export default function LayeredHeatmap({
  layers,
  width = 560,
  height = 420,
  title = 'Die heatmap',
}: LayeredHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Per-layer UI state (visibility + opacity). Keyed by layer id so
  // reordering or swapping layers doesn't reset unrelated sliders.
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [opacity, setOpacity] = useState<Record<string, number>>({});

  // Seed state when new layer ids appear.
  useEffect(() => {
    setVisible(prev => {
      const next = { ...prev };
      for (const l of layers) if (next[l.id] === undefined) next[l.id] = true;
      return next;
    });
    setOpacity(prev => {
      const next = { ...prev };
      for (const l of layers) if (next[l.id] === undefined) next[l.id] = l.defaultOpacity ?? 0.7;
      return next;
    });
  }, [layers]);

  // Detect shape mismatches and fall back to per-layer rendering of the
  // reference shape only (others still render but with their own grid).
  const refShape = useMemo(() => {
    if (layers.length === 0) return null;
    return { rows: layers[0].data.length, cols: layers[0].data[0]?.length ?? 0 };
  }, [layers]);

  const mismatch = useMemo(() => {
    if (!refShape) return false;
    return layers.some(l => l.data.length !== refShape.rows || l.data[0]?.length !== refShape.cols);
  }, [layers, refShape]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    for (const layer of layers) {
      if (!visible[layer.id]) continue;
      const rows = layer.data.length;
      const cols = layer.data[0]?.length ?? 0;
      if (rows === 0 || cols === 0) continue;

      const [lo, hi] = gridMinMax(layer.data);
      const range = hi - lo || 1;
      const cw = width / cols;
      const ch = height / rows;
      const a = opacity[layer.id] ?? 0.7;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const t = (layer.data[r][c] - lo) / range;
          const [R, G, B] = sampleColor(layer.palette, t);
          ctx.fillStyle = `rgba(${R},${G},${B},${a})`;
          ctx.fillRect(c * cw, r * ch, cw + 0.5, ch + 0.5);
        }
      }
    }
  }, [layers, visible, opacity, width, height]);

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: `${width}px 1fr` },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', width, height }}>
          <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block' }} />
        </Box>

        <Stack spacing={1.5}>
          {mismatch && (
            <Typography variant="caption" color="warning.main">
              Layers have different grid shapes — overlay alignment may be misleading.
            </Typography>
          )}
          {layers.map(layer => (
            <Box key={layer.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={visible[layer.id] ?? true}
                      onChange={(e) => setVisible(s => ({ ...s, [layer.id]: e.target.checked }))}
                    />
                  }
                  label={layer.name}
                  sx={{ flex: 1, mr: 0 }}
                />
                <Box
                  sx={{
                    width: 56, height: 10, borderRadius: 0.5,
                    background: `linear-gradient(to right, ${layer.palette[0]}, ${layer.palette[1]}, ${layer.palette[2]})`,
                    border: 1, borderColor: 'divider',
                  }}
                  aria-hidden
                />
              </Box>
              <Box sx={{ px: 1 }}>
                <Slider
                  size="small"
                  value={opacity[layer.id] ?? 0.7}
                  onChange={(_, v) => setOpacity(s => ({ ...s, [layer.id]: v as number }))}
                  min={0}
                  max={1}
                  step={0.05}
                  disabled={!(visible[layer.id] ?? true)}
                  aria-label={`${layer.name} opacity`}
                />
              </Box>
            </Box>
          ))}
        </Stack>
      </Box>
    </Paper>
  );
}
