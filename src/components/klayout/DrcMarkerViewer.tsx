'use client';

/**
 * DRC marker viewer — KLayout-style violation list with jump-to-marker.
 *
 * Bound to a `runDrc()` report (or any `DrcViolation[]`). Lets the user:
 *   - filter by severity (errors / warnings)
 *   - filter by rule kind
 *   - click a row to centre the viewer on the offending geometry
 *   - "suppress" individual violations (just hides them locally — no
 *     file persistence; that's a follow-up if anyone needs it)
 *
 * The component itself only manages list state. Geometry lookup / pan-
 * to-marker is delegated via `onSelect(violation, geometryRect)`.
 */

import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Chip, ToggleButton, ToggleButtonGroup,
  TextField, IconButton, Tooltip, Divider,
} from '@mui/material';
import { VisibilityOff, FilterAlt, Search as SearchIcon, Restore } from '@mui/icons-material';
import type { DrcViolation } from '@/lib/algorithms/drc_ruledeck';
import type { Rect } from '@/lib/geometry/polygon';

export interface MarkerSelection {
  violation: DrcViolation;
  bbox: Rect | null;
}

interface Props {
  violations: DrcViolation[];
  /** Map: geometry id → its bounding box. Built once by the host page. */
  geometryBboxes: Map<string, Rect>;
  onSelect: (sel: MarkerSelection) => void;
  /** Current selection — highlights the matching row. */
  selectedKey?: string | null;
}

export default function DrcMarkerViewer({ violations, geometryBboxes, onSelect, selectedKey }: Props) {
  const [severity, setSeverity] = useState<'all' | 'error' | 'warning'>('all');
  const [kind, setKind] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [suppressed, setSuppressed] = useState<Set<string>>(new Set());

  const kinds = useMemo(() => {
    const s = new Set<string>();
    for (const v of violations) s.add(v.kind);
    return Array.from(s).sort();
  }, [violations]);

  const rows = useMemo(() => {
    return violations
      .map((v, i) => ({ v, i, key: violationKey(v, i) }))
      .filter(({ v, key }) => {
        if (suppressed.has(key)) return false;
        if (severity !== 'all' && v.severity !== severity) return false;
        if (kind !== 'all' && v.kind !== kind) return false;
        if (query) {
          const q = query.toLowerCase();
          if (!v.ruleName.toLowerCase().includes(q) && !v.message.toLowerCase().includes(q)) return false;
        }
        return true;
      });
  }, [violations, severity, kind, query, suppressed]);

  const errCount = rows.filter(r => r.v.severity === 'error').length;
  const warnCount = rows.filter(r => r.v.severity === 'warning').length;

  const select = (v: DrcViolation, key: string) => {
    const bbox = unionBbox(v.geometries.map(g => geometryBboxes.get(g)).filter(Boolean) as Rect[]);
    onSelect({ violation: v, bbox });
  };

  const suppress = (key: string) => {
    setSuppressed(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const unsuppressAll = () => setSuppressed(new Set());

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.paper' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1 }}>
        <Typography variant="overline" sx={{ flex: 1 }}>DRC Markers</Typography>
        <Chip size="small" label={`${errCount} err`} color={errCount > 0 ? 'error' : 'default'} />
        <Chip size="small" label={`${warnCount} warn`} color={warnCount > 0 ? 'warning' : 'default'} />
        {suppressed.size > 0 && (
          <Tooltip title={`Restore ${suppressed.size} suppressed`}>
            <IconButton size="small" onClick={unsuppressAll}><Restore fontSize="small" /></IconButton>
          </Tooltip>
        )}
      </Stack>
      <Divider />
      <Stack direction="row" spacing={1} sx={{ px: 1.5, py: 1 }} alignItems="center">
        <ToggleButtonGroup
          size="small" exclusive value={severity}
          onChange={(_, v) => v && setSeverity(v)}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="error">Err</ToggleButton>
          <ToggleButton value="warning">Warn</ToggleButton>
        </ToggleButtonGroup>
        <FilterAlt fontSize="small" color="disabled" />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          style={{ fontSize: 12, padding: 2 }}
        >
          <option value="all">all kinds</option>
          {kinds.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <TextField
          size="small" placeholder="filter…" value={query}
          onChange={(e) => setQuery(e.target.value)}
          InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 0.5 }} /> }}
          sx={{ flex: 1 }}
        />
      </Stack>
      <Divider />
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {rows.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ p: 2, display: 'block' }}>
            no violations match the current filters
          </Typography>
        )}
        {rows.map(({ v, key }) => (
          <Stack
            key={key}
            direction="row"
            spacing={1}
            sx={{
              px: 1.5, py: 0.75,
              borderLeft: 3, borderColor: v.severity === 'error' ? 'error.main' : 'warning.main',
              cursor: 'pointer',
              bgcolor: selectedKey === key ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
            }}
            onClick={() => select(v, key)}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }} noWrap>
                {v.ruleName}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>
                {v.message}
              </Typography>
              {v.geometries.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  {v.geometries.slice(0, 3).join(', ')}
                  {v.geometries.length > 3 ? ` +${v.geometries.length - 3}` : ''}
                </Typography>
              )}
            </Box>
            <Tooltip title="Suppress">
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); suppress(key); }}
              >
                <VisibilityOff fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        ))}
      </Box>
    </Box>
  );
}

export function violationKey(v: DrcViolation, idx: number): string {
  return `${v.kind}|${v.ruleName}|${v.geometries.join(',')}|${idx}`;
}

function unionBbox(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let xl = Infinity, yl = Infinity, xh = -Infinity, yh = -Infinity;
  for (const r of rects) {
    if (r.xl < xl) xl = r.xl;
    if (r.yl < yl) yl = r.yl;
    if (r.xh > xh) xh = r.xh;
    if (r.yh > yh) yh = r.yh;
  }
  return { xl, yl, xh, yh };
}
