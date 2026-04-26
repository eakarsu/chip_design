'use client';

/**
 * Antenna-violations viewer.
 *
 * Paste an OpenROAD `check_antennas` report (or click Run to drive the
 * subprocess / fallback) and the page renders:
 *   - top-line counts (total / violated / worst ratio)
 *   - sortable per-net table with expandable per-layer rows
 *   - a filter for violated-only / search-by-net
 *
 * The parser tolerates a couple of common output shapes (Layer X PAR:
 * a/b, "<layer> PAR: x ratio CAR: y ratio") so it works on real
 * OpenROAD output and on synthetic / vendor variants.
 */

import { useMemo, useState } from 'react';
import {
  Box, Container, Typography, Paper, Stack, Button, TextField,
  Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel,
  Chip, Alert, FormControlLabel, Switch, IconButton, Collapse, Tooltip,
} from '@mui/material';
import {
  PlayArrow, Search, ContentPaste, Clear, ExpandMore, ChevronRight,
} from '@mui/icons-material';
import type { AntennaNetReport } from '@/lib/tools/antennas';

const SAMPLE = `[INFO ANT-0001] Found 2 antenna violations.
Net: clk
  Layer met1  PAR: 350.0 / 400.0  [PASS]
  Layer met2  PAR: 850.0 / 400.0  [FAIL]
Net: data[0]
  Layer met1  PAR: 200.0 / 400.0  [PASS]
Antenna violation: rst
  Layer met3  PAR: 1500.0 / 400.0  [FAIL]
`;

type SortKey = 'net' | 'worstRatio' | 'violated';

export default function AntennasPage() {
  const [stdout, setStdout] = useState('');
  const [nets, setNets] = useState<AntennaNetReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forceFallback, setForceFallback] = useState(true);
  const [filter, setFilter] = useState('');
  const [violatedOnly, setViolatedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('worstRatio');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    let rows = nets;
    if (violatedOnly) rows = rows.filter(n => n.violated);
    if (filter) {
      const q = filter.toLowerCase();
      rows = rows.filter(n => n.net.toLowerCase().includes(q));
    }
    rows = [...rows].sort((a, b) => {
      const av: any = a[sortKey];
      const bv: any = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [nets, filter, violatedOnly, sortKey, sortDir]);

  const totalViolated = nets.filter(n => n.violated).length;
  const worstRatio = nets.length ? Math.max(...nets.map(n => n.worstRatio)) : 0;

  async function handleParse() {
    setError(null);
    try {
      const res = await fetch('/api/openroad/antennas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stdout }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? 'parse failed');
      setNets(json.report?.nets ?? []);
      if ((json.report?.nets ?? []).length === 0) {
        setError('No antenna entries recognized. The parser looks for "Net:" / "Antenna violation:" headers and per-layer PAR lines.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRun() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/openroad/antennas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceFallback }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? 'run failed');
      setNets(json.report?.nets ?? []);
      setStdout(json.stdoutTail ?? '');
      if (!json.ranReal && (json.report?.nets?.length ?? 0) === 0) {
        setError('OpenROAD binary not found and the fallback does not synthesise antenna reports — paste real check_antennas output above.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'worstRatio' ? 'desc' : 'asc'); }
  }

  function toggleRow(net: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(net)) next.delete(net); else next.add(net);
      return next;
    });
  }

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Typography variant="h5" gutterBottom>Antenna violations viewer</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Parse OpenROAD <code>check_antennas</code> output into a per-net table with
        expandable per-layer ratios. Supports both pasted reports and on-demand runs.
      </Typography>

      {error && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Run check_antennas</Typography>
          <FormControlLabel
            control={<Switch checked={forceFallback} onChange={e => setForceFallback(e.target.checked)} />}
            label="Force fallback"
          />
          <br />
          <Button
            variant="contained" startIcon={<PlayArrow />}
            onClick={handleRun} disabled={loading} sx={{ mt: 1 }}
          >
            Run
          </Button>
        </Paper>

        <Paper sx={{ p: 2, flex: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle2">check_antennas output</Typography>
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Load sample report">
                <IconButton size="small" onClick={() => setStdout(SAMPLE)}>
                  <ContentPaste fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Clear">
                <IconButton size="small" onClick={() => { setStdout(''); setNets([]); }}>
                  <Clear fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
          <TextField
            multiline rows={6} fullWidth value={stdout}
            onChange={e => setStdout(e.target.value)}
            placeholder="Paste check_antennas output here…"
            slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 12 } } }}
          />
          <Button
            sx={{ mt: 1 }} variant="outlined" startIcon={<Search />}
            onClick={handleParse} disabled={!stdout.trim()}
          >
            Parse pasted text
          </Button>
        </Paper>
      </Stack>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Chip label={`${nets.length} nets`} />
          <Chip color={totalViolated > 0 ? 'error' : 'success'} label={`${totalViolated} violated`} />
          {nets.length > 0 && (
            <Chip color={worstRatio > 1 ? 'error' : 'success'} label={`Worst ratio ${worstRatio.toFixed(1)}`} />
          )}
          <TextField
            size="small" placeholder="filter by net…"
            value={filter} onChange={e => setFilter(e.target.value)} sx={{ ml: 'auto', width: 280 }}
          />
          <FormControlLabel
            control={<Switch checked={violatedOnly} onChange={e => setViolatedOnly(e.target.checked)} />}
            label="Violated only"
          />
        </Stack>
      </Paper>

      <Paper sx={{ p: 1, overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>
                <TableSortLabel
                  active={sortKey === 'net'}
                  direction={sortKey === 'net' ? sortDir : 'asc'}
                  onClick={() => toggleSort('net')}
                >
                  net
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortKey === 'violated'}
                  direction={sortKey === 'violated' ? sortDir : 'desc'}
                  onClick={() => toggleSort('violated')}
                >
                  status
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortKey === 'worstRatio'}
                  direction={sortKey === 'worstRatio' ? sortDir : 'desc'}
                  onClick={() => toggleSort('worstRatio')}
                >
                  worst PAR/CAR
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">layers</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>
                  No nets to display. Paste a report and click Parse, or click Run.
                </TableCell>
              </TableRow>
            )}
            {visible.map(n => (
              <RowGroup key={n.net} net={n} expanded={expanded.has(n.net)} onToggle={() => toggleRow(n.net)} />
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Container>
  );
}

function RowGroup({
  net, expanded, onToggle,
}: { net: AntennaNetReport; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <TableRow hover sx={{ cursor: 'pointer' }} onClick={onToggle}>
        <TableCell sx={{ width: 32 }}>
          <IconButton size="small">
            {expanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{net.net}</TableCell>
        <TableCell>
          <Chip
            size="small" label={net.violated ? 'VIOLATED' : 'OK'}
            color={net.violated ? 'error' : 'success'} variant="outlined"
          />
        </TableCell>
        <TableCell align="right" sx={{ color: net.violated ? 'error.main' : undefined }}>
          {net.worstRatio.toFixed(1)}
        </TableCell>
        <TableCell align="right">{net.layers.length}</TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={5} sx={{ p: 0, border: 0 }}>
          <Collapse in={expanded} unmountOnExit>
            <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>layer</TableCell>
                    <TableCell align="right">PAR</TableCell>
                    <TableCell align="right">PAR limit</TableCell>
                    <TableCell align="right">CAR</TableCell>
                    <TableCell align="right">CAR limit</TableCell>
                    <TableCell>status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {net.layers.map((l, i) => (
                    <TableRow key={`${l.layer}-${i}`}>
                      <TableCell>{l.layer}</TableCell>
                      <TableCell align="right">{l.par != null ? l.par.toFixed(1) : '–'}</TableCell>
                      <TableCell align="right">{l.parLimit != null ? l.parLimit.toFixed(1) : '–'}</TableCell>
                      <TableCell align="right">{l.car != null ? l.car.toFixed(1) : '–'}</TableCell>
                      <TableCell align="right">{l.carLimit != null ? l.carLimit.toFixed(1) : '–'}</TableCell>
                      <TableCell>
                        <Chip
                          size="small" label={l.violated ? 'FAIL' : 'PASS'}
                          color={l.violated ? 'error' : 'success'} variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}
