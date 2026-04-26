'use client';

/**
 * HPWL / wire-length report.
 *
 * Paste a list of nets (with terminal coordinates and an optional layer
 * hint), get back per-net HPWL, per-layer totals, and the longest net. We
 * pre-fill an example fanout so the page is useful out of the box.
 */

import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider,
  TextField, Snackbar, Table, TableBody, TableCell, TableHead,
  TableRow, TableSortLabel,
} from '@mui/material';
import { ContentCopy } from '@mui/icons-material';

import {
  computeWireLength, type WireNet, type WireLengthResult,
} from '@/lib/tools/wire_length';

function exampleNets(): WireNet[] {
  return [
    { name: 'clk',   layerHint: 'M5', terminals: [
      { x:  10, y:  10 }, { x: 100, y:  10 }, { x: 100, y: 100 },
      { x:  10, y: 100 }, { x:  50, y:  50 },
    ] },
    { name: 'reset', layerHint: 'M3', terminals: [
      { x:   0, y:  0 }, { x: 80, y: 0 }, { x: 40, y: 60 },
    ] },
    { name: 'data[0]', layerHint: 'M2', terminals: [
      { x:  20, y: 20 }, { x: 30, y: 25 },
    ] },
    { name: 'data[1]', layerHint: 'M2', terminals: [
      { x:  20, y: 30 }, { x: 35, y: 32 },
    ] },
    { name: 'enable', layerHint: 'M3', terminals: [
      { x:   5, y:  5 }, { x: 60, y: 40 },
    ] },
    { name: 'long_bus', layerHint: 'M6', terminals: [
      { x:   0, y:  0 }, { x: 200, y: 200 },
    ] },
  ];
}

type SortKey = 'name' | 'numTerms' | 'hpwl' | 'layer';

export default function WireLengthPage() {
  const [text, setText] = useState(() => JSON.stringify(exampleNets(), null, 2));
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('hpwl');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { result, parseError } = useMemo(() => {
    try {
      const nets = JSON.parse(text) as WireNet[];
      if (!Array.isArray(nets)) throw new Error('top level must be an array');
      return { result: computeWireLength(nets), parseError: null };
    } catch (e) {
      return { result: null as WireLengthResult | null,
               parseError: e instanceof Error ? e.message : String(e) };
    }
  }, [text]);

  function setSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'name' || k === 'layer' ? 'asc' : 'desc'); }
  }
  const sortedNets = useMemo(() => {
    if (!result) return [];
    const xs = [...result.perNet];
    xs.sort((a, b) => {
      const sign = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name') return sign * a.name.localeCompare(b.name);
      if (sortKey === 'layer')
        return sign * ((a.layer ?? '').localeCompare(b.layer ?? ''));
      return sign * (a[sortKey] - b[sortKey]);
    });
    return xs;
  }, [result, sortKey, sortDir]);

  async function copyReport() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setInfo('Report copied');
    } catch { setError('Clipboard write failed'); }
  }
  async function callApi() {
    try {
      const nets = JSON.parse(text);
      const r = await fetch('/api/wire-length', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nets }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setInfo(`API total HPWL: ${j.totalHpwl.toFixed(2)} μm`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap">
        <Typography variant="h4">Wire Length / HPWL Report</Typography>
        {result && (
          <>
            <Chip label={`nets: ${result.totalNets}`} />
            <Chip label={`Σ HPWL: ${result.totalHpwl.toFixed(2)} μm`}
              sx={{ bgcolor: '#4f46e5', color: 'white' }} />
            <Chip label={`max: ${result.maxNetHpwl.toFixed(2)}`}
              sx={{ bgcolor: '#dc2626', color: 'white' }} />
            <Chip label={`avg fanout: ${result.avgFanout.toFixed(2)}`} />
            {result.warnings.length > 0 && (
              <Chip label={`warn: ${result.warnings.length}`} color="warning" />
            )}
          </>
        )}
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, width: { xs: '100%', md: 460 } }}>
          <Typography variant="subtitle1" mb={1}>
            Nets (JSON: <code>{'{ name, terminals: [{x,y}], layerHint? }[]'}</code>)
          </Typography>
          <TextField multiline minRows={18} fullWidth value={text}
            onChange={e => setText(e.target.value)}
            slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 12 } } }}
          />
          {parseError && (
            <Alert severity="error" sx={{ mt: 1 }}>{parseError}</Alert>
          )}
          <Stack direction="row" spacing={1} mt={1}>
            <Button size="small" variant="outlined" onClick={callApi}>API</Button>
            <Button size="small" startIcon={<ContentCopy />} onClick={copyReport}>
              Copy report
            </Button>
            <Button size="small" onClick={() =>
              setText(JSON.stringify(exampleNets(), null, 2))
            }>Reset</Button>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle1" mb={1}>Per-layer totals</Typography>
          {result && result.perLayer.length > 0 ? (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Layer</TableCell>
                  <TableCell align="right">Nets</TableCell>
                  <TableCell align="right">Σ HPWL (μm)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.perLayer.map(l => (
                  <TableRow key={l.layer}>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{l.layer}</TableCell>
                    <TableCell align="right">{l.nets}</TableCell>
                    <TableCell align="right">{l.totalHpwl.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No layer hints supplied.
            </Typography>
          )}
        </Paper>
      </Stack>

      <Divider sx={{ my: 3 }} />

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" mb={1}>Per-net</Typography>
        {result && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel active={sortKey === 'name'} direction={sortDir}
                    onClick={() => setSort('name')}>Net</TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortKey === 'layer'} direction={sortDir}
                    onClick={() => setSort('layer')}>Layer</TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel active={sortKey === 'numTerms'} direction={sortDir}
                    onClick={() => setSort('numTerms')}>Terms</TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel active={sortKey === 'hpwl'} direction={sortDir}
                    onClick={() => setSort('hpwl')}>HPWL (μm)</TableSortLabel>
                </TableCell>
                <TableCell align="right">bbox W×H</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedNets.map(n => (
                <TableRow key={n.name}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{n.name}</TableCell>
                  <TableCell>{n.layer ?? '—'}</TableCell>
                  <TableCell align="right">{n.numTerms}</TableCell>
                  <TableCell align="right">{n.hpwl.toFixed(2)}</TableCell>
                  <TableCell align="right">
                    {n.bboxW.toFixed(1)} × {n.bboxH.toFixed(1)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {result && result.warnings.length > 0 && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Typography variant="subtitle1" mb={1}>Warnings</Typography>
          {result.warnings.map((w, i) => (
            <Alert key={i} severity="warning" sx={{ mb: 0.5 }}>{w}</Alert>
          ))}
        </Paper>
      )}

      <Snackbar open={!!info} autoHideDuration={3000}
        onClose={() => setInfo(null)} message={info ?? ''} />
      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Box>
  );
}
