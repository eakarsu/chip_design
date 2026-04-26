'use client';

/**
 * STA timing-path explorer.
 *
 * Two ways to use it:
 * 1. Paste OpenSTA `report_checks` output into the text area → get a
 *    sortable table of paths and a per-path stage drill-down.
 * 2. Click "Run report_checks" to invoke the OpenROAD subprocess
 *    (or fallback) via /api/openroad/timing-paths with a configurable
 *    -path_count and -path_delay.
 *
 * The aim is to turn the wall of text from STA reports into something a
 * designer can scan / sort / search.
 */

import { useMemo, useState } from 'react';
import {
  Box, Container, Typography, Paper, Stack, Button, TextField,
  Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel,
  Chip, Alert, FormControlLabel, Switch, MenuItem, IconButton, Tooltip,
} from '@mui/material';
import { PlayArrow, Search, ContentPaste, Clear } from '@mui/icons-material';
import type { TimingPath } from '@/lib/tools/openroad';

const SAMPLE = `Startpoint: reg1/CK (rising edge-triggered flip-flop clocked by clk)
Endpoint: reg2/D (rising edge-triggered flip-flop clocked by clk)
Path Group: clk
Path Type: max

   Delay    Time   Description
---------------------------------------------------------
   0.00    0.00   clock clk (rise edge)
   0.00    0.00   clock network delay (ideal)
   0.00    0.00 ^ reg1/CK (DFF_X1)
   0.05    0.05 v reg1/Q (DFF_X1)
   0.20    0.25 v u_and/Z (AND2_X1)
   0.30    0.55   data arrival time

   1.00    1.00   clock clk (rise edge)
   0.00    1.00   clock network delay (ideal)
  -0.05    0.95   clock uncertainty
   0.95    0.95   data required time
---------------------------------------------------------
   0.95    0.95   data required time
  -0.55   -0.55   data arrival time
---------------------------------------------------------
   0.40    0.40   slack (MET)
`;

type SortKey = 'startpoint' | 'endpoint' | 'arrival' | 'required' | 'slack' | 'status';

export default function TimingPathsPage() {
  const [stdout, setStdout] = useState<string>('');
  const [paths, setPaths] = useState<TimingPath[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pathCount, setPathCount] = useState(10);
  const [pathDelay, setPathDelay] = useState<'min' | 'max' | 'min_max'>('max');
  const [forceFallback, setForceFallback] = useState(true);
  const [filter, setFilter] = useState('');
  const [violatedOnly, setViolatedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('slack');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<TimingPath | null>(null);

  const parsed = useMemo(() => {
    let rows = paths;
    if (violatedOnly) rows = rows.filter(p => p.status === 'VIOLATED');
    if (filter) {
      const q = filter.toLowerCase();
      rows = rows.filter(p =>
        p.startpoint.toLowerCase().includes(q) ||
        p.endpoint.toLowerCase().includes(q),
      );
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
  }, [paths, filter, violatedOnly, sortKey, sortDir]);

  const violatedCount = paths.filter(p => p.status === 'VIOLATED').length;
  const wns = paths.length ? Math.min(...paths.map(p => p.slack)) : 0;

  async function handleParse() {
    setError(null);
    try {
      const res = await fetch('/api/openroad/timing-paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stdout }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? 'parse failed');
      setPaths(json.paths ?? []);
      if ((json.paths ?? []).length === 0) {
        setError('No timing paths recognized in the pasted text. Make sure the report includes "Startpoint:" / "Endpoint:" / "slack (MET|VIOLATED)" markers.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRun() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/openroad/timing-paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathCount, pathDelay, forceFallback }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? 'run failed');
      setPaths(json.paths ?? []);
      setStdout(json.stdoutTail ?? '');
      if (!json.ranReal) {
        setError('OpenROAD binary not found — falling back. Paste a real STA report into the text area to populate the table.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'slack' ? 'asc' : 'desc'); }
  }

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Typography variant="h5" gutterBottom>STA timing-path explorer</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Parse OpenSTA <code>report_checks</code> output into a sortable, filterable table.
        Supports both pasted reports and on-demand runs.
      </Typography>

      {error && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Run report_checks</Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <TextField
              size="small" type="number" label="path_count"
              value={pathCount} onChange={e => setPathCount(Number(e.target.value))}
              sx={{ width: 120 }}
            />
            <TextField
              size="small" select label="path_delay"
              value={pathDelay} onChange={e => setPathDelay(e.target.value as any)}
              sx={{ width: 140 }}
            >
              <MenuItem value="max">max</MenuItem>
              <MenuItem value="min">min</MenuItem>
              <MenuItem value="min_max">min_max</MenuItem>
            </TextField>
            <FormControlLabel
              control={<Switch checked={forceFallback} onChange={e => setForceFallback(e.target.checked)} />}
              label="Force fallback"
            />
          </Stack>
          <Button
            variant="contained" startIcon={<PlayArrow />}
            onClick={handleRun} disabled={loading}
          >
            Run
          </Button>
        </Paper>

        <Paper sx={{ p: 2, flex: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle2">OpenSTA report_checks output</Typography>
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Load sample report">
                <IconButton size="small" onClick={() => setStdout(SAMPLE)}>
                  <ContentPaste fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Clear">
                <IconButton size="small" onClick={() => { setStdout(''); setPaths([]); }}>
                  <Clear fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
          <TextField
            multiline rows={6} fullWidth value={stdout}
            onChange={e => setStdout(e.target.value)}
            placeholder="Paste OpenSTA report here…"
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
          <Chip label={`${paths.length} paths`} />
          <Chip color={violatedCount > 0 ? 'error' : 'success'} label={`${violatedCount} violated`} />
          {paths.length > 0 && (
            <Chip color={wns < 0 ? 'error' : 'success'} label={`WNS ${wns.toFixed(3)} ns`} />
          )}
          <TextField
            size="small" placeholder="filter by start/end…"
            value={filter} onChange={e => setFilter(e.target.value)} sx={{ ml: 'auto', width: 280 }}
          />
          <FormControlLabel
            control={<Switch checked={violatedOnly} onChange={e => setViolatedOnly(e.target.checked)} />}
            label="Violated only"
          />
        </Stack>
      </Paper>

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
        <Paper sx={{ p: 1, flex: 2, overflowX: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {(['startpoint','endpoint','arrival','required','slack','status'] as SortKey[]).map(k => (
                  <TableCell key={k}>
                    <TableSortLabel
                      active={sortKey === k}
                      direction={sortKey === k ? sortDir : 'asc'}
                      onClick={() => toggleSort(k)}
                    >
                      {k}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {parsed.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary' }}>
                    No paths to display. Paste a report and click Parse, or click Run.
                  </TableCell>
                </TableRow>
              )}
              {parsed.map((p, i) => (
                <TableRow
                  key={i} hover
                  selected={selected === p}
                  onClick={() => setSelected(p)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{p.startpoint}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{p.endpoint}</TableCell>
                  <TableCell align="right">{Number.isFinite(p.arrival) ? p.arrival.toFixed(3) : '–'}</TableCell>
                  <TableCell align="right">{Number.isFinite(p.required) ? p.required.toFixed(3) : '–'}</TableCell>
                  <TableCell align="right" sx={{ color: p.slack < 0 ? 'error.main' : 'success.main', fontWeight: 600 }}>
                    {p.slack.toFixed(3)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small" label={p.status}
                      color={p.status === 'MET' ? 'success' : 'error'} variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={{ p: 2, flex: 1, minHeight: 200 }}>
          <Typography variant="subtitle2">Stage breakdown</Typography>
          {!selected ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Select a row to see the per-stage delay breakdown.
            </Typography>
          ) : (
            <>
              <Box sx={{ mt: 1, mb: 1, fontSize: 12 }}>
                <div><strong>Start:</strong> {selected.startpoint}</div>
                <div><strong>End:</strong> {selected.endpoint}</div>
                {selected.pathGroup && <div><strong>Group:</strong> {selected.pathGroup}</div>}
                {selected.pathType && <div><strong>Type:</strong> {selected.pathType}</div>}
              </Box>
              <Box
                component="pre"
                sx={{
                  m: 0, fontFamily: 'monospace', fontSize: 11,
                  whiteSpace: 'pre', maxHeight: 360, overflow: 'auto',
                  bgcolor: 'action.hover', p: 1, borderRadius: 1,
                }}
              >
                {selected.stages.join('\n') || '(no per-stage rows captured)'}
              </Box>
            </>
          )}
        </Paper>
      </Stack>
    </Container>
  );
}
