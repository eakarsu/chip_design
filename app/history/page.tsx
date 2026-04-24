'use client';

import { useEffect, useState } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody, TableCell,
  TableHead, TableRow, Chip, TextField, MenuItem, Alert, CircularProgress,
  IconButton, Collapse,
} from '@mui/material';
import { ExpandMore, ExpandLess, Refresh, CompareArrows, Download } from '@mui/icons-material';
import Link from 'next/link';

interface RunRow {
  id: string;
  designId?: string;
  category: string;
  algorithm: string;
  parameters: Record<string, any>;
  result: Record<string, any>;
  runtimeMs: number;
  success: boolean;
  createdAt: string;
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [compareSel, setCompareSel] = useState<string[]>([]);

  const toggleCompare = (id: string) => {
    setCompareSel(sel =>
      sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id].slice(-2),
    );
  };

  const downloadSvg = async (run: RunRow) => {
    const cells = (run.parameters as any)?.cells ?? [];
    const nets  = (run.parameters as any)?.nets  ?? [];
    const cw = (run.parameters as any)?.chipWidth  ?? 1000;
    const ch = (run.parameters as any)?.chipHeight ?? 1000;
    if (!Array.isArray(cells) || cells.length === 0) {
      alert('This run has no cell array stored — SVG export only works for placement-style runs.');
      return;
    }
    const r = await fetch('/api/render/svg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cells, nets, chipWidth: cw, chipHeight: ch }),
    });
    const text = await r.text();
    const blob = new Blob([text], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${run.algorithm}-${run.id.slice(0, 8)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/history');
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? 'Failed to load');
      setRuns(j.runs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const categories = Array.from(new Set(runs.map(r => r.category))).sort();
  const filtered = runs.filter(r => {
    if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
    if (filter && !`${r.algorithm} ${r.category}`.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 1 }}>
        <Typography variant="h4" sx={{ flexGrow: 1, fontWeight: 700 }}>
          Run History
        </Typography>
        {compareSel.length === 2 && (
          <IconButton
            component={Link}
            href={`/history/compare?a=${compareSel[0]}&b=${compareSel[1]}`}
            color="primary"
            aria-label="compare"
            title="Compare selected"
          >
            <CompareArrows />
          </IconButton>
        )}
        <IconButton onClick={load} disabled={loading} aria-label="refresh">
          <Refresh />
        </IconButton>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Persisted log of every algorithm execution dispatched through{' '}
        <code>/api/algorithms</code>. Useful for reproducing prior runs and
        comparing parameter sweeps.
      </Typography>

      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          label="Filter"
          size="small"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="algorithm or category"
          sx={{ flexGrow: 1, minWidth: 240 }}
        />
        <TextField
          select
          size="small"
          label="Category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="all">All ({runs.length})</MenuItem>
          {categories.map(c => (
            <MenuItem key={c} value={c}>
              {c} ({runs.filter(r => r.category === c).length})
            </MenuItem>
          ))}
        </TextField>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}

      {!loading && filtered.length === 0 && (
        <Alert severity="info">
          No runs yet. Execute any algorithm from the{' '}
          <a href="/algorithms">Algorithms</a> page and it'll appear here.
        </Alert>
      )}

      {!loading && filtered.length > 0 && (
        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={32} />
                <TableCell width={32}>vs</TableCell>
                <TableCell>When</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Algorithm</TableCell>
                <TableCell align="right">Runtime</TableCell>
                <TableCell>Status</TableCell>
                <TableCell width={32} />
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((r) => (
                <>
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => setExpanded(e => ({ ...e, [r.id]: !e[r.id] }))}
                        aria-label={expanded[r.id] ? 'collapse' : 'expand'}
                      >
                        {expanded[r.id] ? <ExpandLess /> : <ExpandMore />}
                      </IconButton>
                    </TableCell>
                    <TableCell padding="checkbox">
                      <input
                        type="checkbox"
                        checked={compareSel.includes(r.id)}
                        onChange={() => toggleCompare(r.id)}
                        aria-label="select for compare"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {new Date(r.createdAt).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={r.category} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{r.algorithm}</TableCell>
                    <TableCell align="right">{r.runtimeMs} ms</TableCell>
                    <TableCell>
                      <Chip
                        label={r.success ? 'ok' : 'failed'}
                        size="small"
                        color={r.success ? 'success' : 'error'}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => downloadSvg(r)}
                        aria-label="download svg"
                        title="Download placement as SVG"
                      >
                        <Download fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={8} sx={{ py: 0, border: 0 }}>
                      <Collapse in={!!expanded[r.id]}>
                        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Parameters</Typography>
                            <Box component="pre" sx={{
                              fontSize: 12, p: 1, mt: 0.5, m: 0,
                              bgcolor: 'action.hover', borderRadius: 1,
                              maxHeight: 200, overflow: 'auto',
                            }}>
                              {JSON.stringify(r.parameters, null, 2)}
                            </Box>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Result summary</Typography>
                            <Box component="pre" sx={{
                              fontSize: 12, p: 1, mt: 0.5, m: 0,
                              bgcolor: 'action.hover', borderRadius: 1,
                              maxHeight: 200, overflow: 'auto',
                            }}>
                              {JSON.stringify(r.result, null, 2)}
                            </Box>
                          </Box>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Container>
  );
}
