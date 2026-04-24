'use client';

/**
 * OpenLane layout viewer.
 *
 * Renders placed cells and routed wires as SVG.  Per-layer visibility
 * toggles and zoom controls — enough for educational inspection, not a
 * replacement for KLayout or Magic.
 */

import { useMemo, useState } from 'react';
import {
  Box, Paper, Chip, Stack, Typography, IconButton, Slider,
  FormControlLabel, Switch,
} from '@mui/material';
import { ZoomIn, ZoomOut, CenterFocusStrong } from '@mui/icons-material';
import type { OpenlaneLayout } from '@/lib/db';

// Consistent colour per layer so users can learn the convention.
const LAYER_COLOR: Record<number, string> = {
  1: '#42a5f5', // M1 blue
  2: '#66bb6a', // M2 green
  3: '#ffa726', // M3 orange
  4: '#ab47bc', // M4 purple
  5: '#ef5350', // M5 red
};
const layerName = (n: number) => `M${n}`;
const cellColor = (t: string) => t === 'ff' ? '#f59e0b' : '#90a4ae';

interface Props {
  layout: OpenlaneLayout;
}

export default function LayoutViewer({ layout }: Props) {
  // Older runs in the DB can have `layout = {}` (no cells/wires were persisted).
  // Default each field so downstream `.map`/`.length` calls don't throw before
  // the empty-state guard below gets to render its message.
  const chipWidth = layout?.chipWidth ?? 0;
  const chipHeight = layout?.chipHeight ?? 0;
  const cells = layout?.cells ?? [];
  const wires = layout?.wires ?? [];
  const allLayers = useMemo(
    () => Array.from(new Set(wires.map(w => w.layer))).sort((a, b) => a - b),
    [wires],
  );
  const [visible, setVisible] = useState<Set<number>>(() => new Set(allLayers));
  const [showCells, setShowCells] = useState(true);
  const [showWires, setShowWires] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<string | null>(null);

  const toggleLayer = (l: number) => {
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l); else next.add(l);
      return next;
    });
  };

  // Empty-state guard for runs that happened before layout data existed.
  if (!chipWidth || !chipHeight || cells.length === 0) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          No layout was stored for this run. Re-run the flow on this design
          and the viewer will have cell positions and routed wires to show.
        </Typography>
      </Paper>
    );
  }

  const pad = Math.max(chipWidth, chipHeight) * 0.03;
  const vbW = (chipWidth  + pad * 2) / zoom;
  const vbH = (chipHeight + pad * 2) / zoom;
  // Keep view centred as you zoom.
  const vbX = -pad + ((chipWidth  + pad * 2) - vbW) / 2;
  const vbY = -pad + ((chipHeight + pad * 2) - vbH) / 2;

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Typography variant="body2">
            Die: <b>{chipWidth}×{chipHeight}</b> · {cells.length} cells · {wires.length} wires
          </Typography>
          <FormControlLabel
            control={<Switch size="small" checked={showCells} onChange={e => setShowCells(e.target.checked)} />}
            label="Cells"
          />
          <FormControlLabel
            control={<Switch size="small" checked={showWires} onChange={e => setShowWires(e.target.checked)} />}
            label="Wires"
          />
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {allLayers.map(l => (
              <Chip
                key={l}
                label={layerName(l)}
                size="small"
                onClick={() => toggleLayer(l)}
                variant={visible.has(l) ? 'filled' : 'outlined'}
                sx={{
                  bgcolor: visible.has(l) ? LAYER_COLOR[l] ?? '#888' : undefined,
                  color: visible.has(l) ? 'white' : undefined,
                }}
              />
            ))}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto', width: 200 }}>
            <IconButton size="small" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>
              <ZoomOut fontSize="small" />
            </IconButton>
            <Slider
              size="small" value={zoom} min={0.5} max={8} step={0.25}
              onChange={(_, v) => setZoom(v as number)}
            />
            <IconButton size="small" onClick={() => setZoom(z => Math.min(8, z + 0.25))}>
              <ZoomIn fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => setZoom(1)}>
              <CenterFocusStrong fontSize="small" />
            </IconButton>
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: 0, overflow: 'hidden', bgcolor: '#1e272e' }}>
        <svg
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          width="100%"
          style={{ display: 'block', background: '#1e272e', maxHeight: 640 }}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* die outline */}
          <rect
            x={0} y={0} width={chipWidth} height={chipHeight}
            fill="none" stroke="#455a64"
            strokeWidth={Math.max(1, chipWidth / 500)}
          />

          {/* cells */}
          {showCells && cells.map(c => (
            <rect
              key={c.id}
              x={c.x} y={c.y} width={c.width} height={c.height}
              fill={cellColor(c.type)} fillOpacity={hover === c.id ? 1 : 0.85}
              stroke="#263238" strokeWidth={0.5}
              onMouseEnter={() => setHover(c.id)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${c.name} (${c.type}) @ ${c.x.toFixed(0)},${c.y.toFixed(0)} ${c.width}×${c.height}`}</title>
            </rect>
          ))}

          {/* wires */}
          {showWires && wires.filter(w => visible.has(w.layer)).map(w => {
            if (w.points.length < 2) return null;
            const d = w.points
              .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`)
              .join(' ');
            return (
              <path
                key={w.id}
                d={d}
                stroke={LAYER_COLOR[w.layer] ?? '#888'}
                strokeWidth={Math.max(1, chipWidth / 400)}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={0.85}
              >
                <title>{`wire ${w.id} (net ${w.netId}, ${layerName(w.layer)})`}</title>
              </path>
            );
          })}
        </svg>
      </Paper>

      {hover && (() => {
        const c = cells.find(x => x.id === hover);
        if (!c) return null;
        return (
          <Typography
            variant="caption" component="div"
            sx={{ mt: 1, fontFamily: 'monospace' }}
          >
            {c.name} · type={c.type} · bbox=({c.x.toFixed(0)},{c.y.toFixed(0)},{(c.x+c.width).toFixed(0)},{(c.y+c.height).toFixed(0)})
          </Typography>
        );
      })()}
    </Box>
  );
}
