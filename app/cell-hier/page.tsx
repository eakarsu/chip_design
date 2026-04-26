'use client';

/**
 * Cell hierarchy browser.
 *
 * Paste a GdsLibrary JSON, select a top cell, and walk an expandable tree
 * of children. Shows per-cell stats (element counts, bbox, layers used)
 * and a flattened-instance leaderboard for the selected root.
 */

import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider,
  TextField, Snackbar, Table, TableBody, TableCell, TableHead, TableRow,
  IconButton, Select, MenuItem,
} from '@mui/material';
import { ChevronRight, ExpandMore } from '@mui/icons-material';

import {
  analyseHierarchy, flattenCounts,
  type CellNode, type HierarchyResult,
} from '@/lib/tools/gds_hier';
import type { GdsLibrary } from '@/lib/gds/types';

const SAMPLE: GdsLibrary = {
  libname: 'CHIP', version: 600,
  units: { userPerDb: 1e-3, metersPerDb: 1e-9 },
  structures: [
    { name: 'CHIP_TOP', elements: [
      { type: 'sref', sname: 'CORE', origin: { x: 0, y: 0 } },
      { type: 'aref', sname: 'IO_PAD', origin: { x: 0, y: 0 },
        cols: 8, rows: 1, rowVector: { x: 0, y: 0 }, colVector: { x: 100, y: 0 } },
    ] },
    { name: 'CORE', elements: [
      { type: 'sref', sname: 'CPU', origin: { x: 0, y: 0 } },
      { type: 'sref', sname: 'CACHE', origin: { x: 200, y: 0 } },
      { type: 'sref', sname: 'CACHE', origin: { x: 400, y: 0 } },
    ] },
    { name: 'CPU', elements: [
      { type: 'aref', sname: 'AND2_X1', origin: { x: 0, y: 0 },
        cols: 50, rows: 20, rowVector: { x: 0, y: 10 }, colVector: { x: 5, y: 0 } },
      { type: 'aref', sname: 'DFF_X1', origin: { x: 0, y: 0 },
        cols: 30, rows: 10, rowVector: { x: 0, y: 10 }, colVector: { x: 8, y: 0 } },
    ] },
    { name: 'CACHE', elements: [
      { type: 'aref', sname: 'SRAM_BIT', origin: { x: 0, y: 0 },
        cols: 64, rows: 32, rowVector: { x: 0, y: 1 }, colVector: { x: 1, y: 0 } },
    ] },
    { name: 'IO_PAD', elements: [
      { type: 'boundary', layer: 1, datatype: 0, points: [
        { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }, { x: 0, y: 0 },
      ] },
    ] },
    { name: 'AND2_X1', elements: [
      { type: 'boundary', layer: 1, datatype: 0, points: [
        { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 0 },
      ] },
    ] },
    { name: 'DFF_X1', elements: [
      { type: 'boundary', layer: 1, datatype: 0, points: [
        { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 0 },
      ] },
    ] },
    { name: 'SRAM_BIT', elements: [
      { type: 'boundary', layer: 2, datatype: 0, points: [
        { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }, { x: 0, y: 0.5 }, { x: 0, y: 0 },
      ] },
    ] },
  ],
};

export default function CellHierPage() {
  const [libText, setLibText] = useState<string>(JSON.stringify(SAMPLE, null, 2));
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lib = useMemo<GdsLibrary | null>(() => {
    try { return JSON.parse(libText); }
    catch { return null; }
  }, [libText]);

  const hier: HierarchyResult | null = useMemo(
    () => lib ? analyseHierarchy(lib) : null,
    [lib],
  );

  const [root, setRoot] = useState<string>('');
  const effectiveRoot = root || hier?.tops[0] || '';
  const [selected, setSelected] = useState<string>('');
  const cellByName = useMemo(() => {
    const m = new Map<string, CellNode>();
    if (hier) for (const c of hier.cells) m.set(c.name, c);
    return m;
  }, [hier]);
  const sel = selected ? cellByName.get(selected) : null;

  const flattened = useMemo(() => {
    if (!hier || !effectiveRoot) return [];
    return flattenCounts(hier, effectiveRoot);
  }, [hier, effectiveRoot]);

  async function callApi() {
    if (!lib) return;
    try {
      const r = await fetch('/api/gds/hierarchy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lib, root: effectiveRoot }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setInfo(`API: ${j.hierarchy.cells.length} cells, ${j.flattened?.length ?? 0} flattened`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap">
        <Typography variant="h4">Cell Hierarchy</Typography>
        {hier && (
          <>
            <Chip label={`cells: ${hier.cells.length}`} />
            <Chip label={`tops: ${hier.tops.length}`} />
            {hier.unresolved.length > 0 && (
              <Chip label={`unresolved: ${hier.unresolved.length}`} color="warning" />
            )}
          </>
        )}
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, width: { xs: '100%', md: 360 } }}>
          <Typography variant="subtitle1" mb={1}>Library JSON</Typography>
          <TextField
            multiline minRows={10} maxRows={20} fullWidth
            value={libText}
            onChange={e => setLibText(e.target.value)}
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 11 } }}
          />
          {!lib && <Alert severity="error" sx={{ mt: 1 }}>Invalid JSON</Alert>}
          {hier && (
            <Stack direction="row" spacing={1} alignItems="center" mt={1}>
              <Typography variant="caption">root:</Typography>
              <Select
                size="small"
                value={effectiveRoot}
                onChange={e => setRoot(e.target.value)}
              >
                {hier.cells.map(c => (
                  <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
                ))}
              </Select>
              <Button size="small" variant="outlined" onClick={callApi}>API</Button>
            </Stack>
          )}
        </Paper>

        <Paper sx={{ p: 2, flex: 1, minHeight: 320 }}>
          <Typography variant="subtitle1" mb={1}>Tree</Typography>
          {hier && effectiveRoot ? (
            <TreeNode
              name={effectiveRoot}
              mult={1}
              cellByName={cellByName}
              onSelect={setSelected}
              selected={selected}
              path={new Set<string>()}
              depth={0}
            />
          ) : (
            <Alert severity="info">Pick a root cell to begin.</Alert>
          )}
        </Paper>

        <Paper sx={{ p: 2, flex: 1, minHeight: 320 }}>
          <Typography variant="subtitle1" mb={1}>Stats</Typography>
          {sel ? <CellStatsPanel node={sel} /> : <Alert severity="info">Click a cell.</Alert>}
        </Paper>
      </Stack>

      <Divider sx={{ my: 3 }} />

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" mb={1}>
          Flattened instance counts under <code>{effectiveRoot}</code>
        </Typography>
        {flattened.length === 0 ? (
          <Alert severity="info">no data</Alert>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Cell</TableCell>
                <TableCell align="right">Flattened count</TableCell>
                <TableCell align="right">Elements</TableCell>
                <TableCell align="right">Children</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {flattened.slice(0, 20).map(c => {
                const n = cellByName.get(c.name);
                return (
                  <TableRow
                    key={c.name}
                    hover
                    selected={selected === c.name}
                    onClick={() => setSelected(c.name)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ fontFamily: 'monospace' }}>{c.name}</TableCell>
                    <TableCell align="right">{c.count}</TableCell>
                    <TableCell align="right">{n?.stats.total ?? 0}</TableCell>
                    <TableCell align="right">{n?.children.length ?? 0}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
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

function TreeNode({
  name, mult, cellByName, onSelect, selected, path, depth,
}: {
  name: string;
  mult: number;
  cellByName: Map<string, CellNode>;
  onSelect: (n: string) => void;
  selected: string;
  path: Set<string>;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  const node = cellByName.get(name);
  const cyclic = path.has(name);
  const hasChildren = !!node && node.children.length > 0 && !cyclic;
  return (
    <Box sx={{ ml: depth * 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        {hasChildren ? (
          <IconButton size="small" onClick={() => setOpen(o => !o)}>
            {open ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
          </IconButton>
        ) : (
          <Box sx={{ width: 28 }} />
        )}
        <Box
          onClick={() => onSelect(name)}
          sx={{
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontWeight: selected === name ? 'bold' : 'normal',
            color: !node ? 'error.main' : 'text.primary',
          }}
        >
          {name}
          {mult > 1 && <span style={{ color: '#64748b' }}> ×{mult}</span>}
          {!node && <span style={{ color: '#dc2626' }}> (unresolved)</span>}
          {cyclic && <span style={{ color: '#b45309' }}> (cycle)</span>}
        </Box>
      </Stack>
      {open && hasChildren && node && (
        <Box>
          {node.children.map((c, i) => (
            <TreeNode
              key={i}
              name={c.name}
              mult={c.count}
              cellByName={cellByName}
              onSelect={onSelect}
              selected={selected}
              path={new Set([...path, name])}
              depth={depth + 1}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

function CellStatsPanel({ node }: { node: CellNode }) {
  return (
    <Box>
      <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>{node.name}</Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
        <Chip size="small" label={`boundary: ${node.stats.boundary}`} />
        <Chip size="small" label={`path: ${node.stats.path}`} />
        <Chip size="small" label={`text: ${node.stats.text}`} />
        <Chip size="small" label={`sref: ${node.stats.sref}`} />
        <Chip size="small" label={`aref: ${node.stats.aref}`} />
      </Stack>
      {node.stats.bbox && (
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
          bbox: ({node.stats.bbox.x1}, {node.stats.bbox.y1}) →{' '}
          ({node.stats.bbox.x2}, {node.stats.bbox.y2})
        </Typography>
      )}
      <Typography variant="subtitle2" mt={2}>Layers</Typography>
      {node.stats.layers.length === 0 ? (
        <Typography variant="body2" color="text.secondary">none</Typography>
      ) : (
        <Stack direction="row" spacing={0.5} flexWrap="wrap">
          {node.stats.layers.map((l, i) => (
            <Chip key={i} size="small" label={`${l.layer}/${l.datatype}`} />
          ))}
        </Stack>
      )}
      <Typography variant="subtitle2" mt={2}>Parents</Typography>
      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
        {node.parents.length ? node.parents.join(', ') : '— (top)'}
      </Typography>
      <Typography variant="subtitle2" mt={2}>Children ({node.children.length})</Typography>
      <Stack direction="row" spacing={0.5} flexWrap="wrap">
        {node.children.map((c, i) => (
          <Chip key={i} size="small" label={`${c.name} ×${c.count}`} />
        ))}
      </Stack>
    </Box>
  );
}
