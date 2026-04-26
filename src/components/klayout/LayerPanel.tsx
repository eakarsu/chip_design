'use client';

/**
 * KLayout-style layer panel.
 *
 * Displays one row per (layer, datatype) tuple present in the layout.
 * Each row shows a colour swatch (sourced from the .lyp entry), the
 * human name, and a visibility toggle. Clicking the swatch isolates the
 * row (everyone else off, this one on).
 */

import { Box, IconButton, Stack, Typography, Tooltip, Divider } from '@mui/material';
import { Visibility, VisibilityOff, RadioButtonUnchecked } from '@mui/icons-material';
import type { FlatLayer } from '@/lib/klayout/flatten';
import type { LypLayer } from '@/lib/klayout/lyp';
import { defaultLypEntry, lypKey } from '@/lib/klayout/lyp';

interface Props {
  layers: FlatLayer[];
  /** lyp lookup keyed by `${layer}/${datatype}` — falls back to the
   *  auto-palette entry if the .lyp file didn't mention this tuple. */
  lyp: Map<string, LypLayer>;
  /** Per-key visibility — controlled by the parent so the viewer can
   *  cross-reference it without duplication. */
  visible: Set<string>;
  onToggle: (key: string) => void;
  onIsolate: (key: string) => void;
  onShowAll: () => void;
}

export default function LayerPanel({ layers, lyp, visible, onToggle, onIsolate, onShowAll }: Props) {
  return (
    <Box sx={{ width: 260, borderRight: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', overflowY: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1 }}>
        <Typography variant="overline" sx={{ flex: 1 }}>Layers</Typography>
        <Tooltip title="Show all">
          <IconButton size="small" onClick={onShowAll}>
            <Visibility fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Divider />
      {layers.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: 'block' }}>
          (no layers — load a GDS)
        </Typography>
      )}
      {layers.map(l => {
        const k = lypKey(l.layer, l.datatype);
        const meta = lyp.get(k) ?? defaultLypEntry(l.layer, l.datatype);
        const on = visible.has(k);
        const fill = meta.fillColor ?? '#888';
        const frame = meta.frameColor ?? fill;
        return (
          <Stack
            key={k}
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ px: 1.5, py: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
          >
            <Tooltip title="Click: isolate · Shift-click: toggle">
              <Box
                role="button"
                onClick={(e) => (e.shiftKey ? onToggle(k) : onIsolate(k))}
                sx={{
                  width: 20, height: 14, borderRadius: 0.5, cursor: 'pointer',
                  bgcolor: fill, border: `1px solid ${frame}`,
                  opacity: on ? 1 : 0.25,
                }}
              />
            </Tooltip>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" noWrap sx={{ display: 'block', fontFamily: 'monospace' }}>
                {meta.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                {l.layer}/{l.datatype} · {l.rects.length} rects
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => onToggle(k)}>
              {on ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
            </IconButton>
          </Stack>
        );
      })}
    </Box>
  );
}
