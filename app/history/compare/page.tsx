'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box, Container, Typography, Paper, Alert, CircularProgress,
  Table, TableHead, TableRow, TableCell, TableBody, Chip, MenuItem, TextField,
} from '@mui/material';

interface RunRow {
  id: string;
  category: string;
  algorithm: string;
  parameters: Record<string, any>;
  result: Record<string, any>;
  runtimeMs: number;
  success: boolean;
  createdAt: string;
}

function flatten(obj: Record<string, any>): Record<string, any> {
  // Single-level flattening — values are already summarized scalars from the API.
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = v2;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function delta(a: any, b: any): { changed: boolean; pct?: string } {
  const an = typeof a === 'number';
  const bn = typeof b === 'number';
  if (an && bn) {
    const changed = a !== b;
    const pct = a !== 0 ? `${(((b - a) / Math.abs(a)) * 100).toFixed(1)}%` : undefined;
    return { changed, pct };
  }
  return { changed: JSON.stringify(a) !== JSON.stringify(b) };
}

export default function ComparePage() {
  const sp = useSearchParams();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [aId, setAId] = useState(sp.get('a') ?? '');
  const [bId, setBId] = useState(sp.get('b') ?? '');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null);
      try {
        const r = await fetch('/api/history');
        const j = await r.json();
        if (!r.ok) throw new Error(j.message ?? 'Load failed');
        setRuns(j.runs ?? []);
        if (!aId && j.runs?.[0]) setAId(j.runs[0].id);
        if (!bId && j.runs?.[1]) setBId(j.runs[1].id);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const a = useMemo(() => runs.find(r => r.id === aId), [runs, aId]);
  const b = useMemo(() => runs.find(r => r.id === bId), [runs, bId]);

  const diffSection = (label: string, av: Record<string, any>, bv: Record<string, any>) => {
    const aFlat = flatten(av);
    const bFlat = flatten(bv);
    const keys = Array.from(new Set([...Object.keys(aFlat), ...Object.keys(bFlat)])).sort();
    return (
      <Paper sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ p: 2, pb: 1 }}>{label}</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Key</TableCell>
              <TableCell>A</TableCell>
              <TableCell>B</TableCell>
              <TableCell align="right">Δ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {keys.map(k => {
              const d = delta(aFlat[k], bFlat[k]);
              return (
                <TableRow key={k} hover sx={d.changed ? { backgroundColor: 'action.selected' } : undefined}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{k}</TableCell>
                  <TableCell>{JSON.stringify(aFlat[k] ?? null)}</TableCell>
                  <TableCell>{JSON.stringify(bFlat[k] ?? null)}</TableCell>
                  <TableCell align="right">
                    {d.changed
                      ? <Chip size="small" label={d.pct ?? 'changed'} color={d.pct ? 'primary' : 'default'} />
                      : <Chip size="small" label="—" variant="outlined" />}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>
    );
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        Compare Runs
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Side-by-side diff of two persisted algorithm runs. Changed values are
        highlighted; numeric deltas are shown as percentages.
      </Typography>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      {!loading && (
        <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            select size="small" label="Run A" value={aId}
            onChange={e => setAId(e.target.value)} sx={{ minWidth: 360 }}
          >
            {runs.map(r => (
              <MenuItem key={r.id} value={r.id}>
                {r.algorithm} · {new Date(r.createdAt).toLocaleString()}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select size="small" label="Run B" value={bId}
            onChange={e => setBId(e.target.value)} sx={{ minWidth: 360 }}
          >
            {runs.map(r => (
              <MenuItem key={r.id} value={r.id}>
                {r.algorithm} · {new Date(r.createdAt).toLocaleString()}
              </MenuItem>
            ))}
          </TextField>
        </Paper>
      )}

      {a && b && (
        <>
          <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="subtitle2">A</Typography>
              <Chip label={`${a.category} · ${a.algorithm}`} sx={{ mr: 1 }} />
              <Chip label={`${a.runtimeMs} ms`} variant="outlined" />
            </Box>
            <Box>
              <Typography variant="subtitle2">B</Typography>
              <Chip label={`${b.category} · ${b.algorithm}`} sx={{ mr: 1 }} />
              <Chip label={`${b.runtimeMs} ms`} variant="outlined" />
            </Box>
          </Paper>
          {diffSection('Parameters', a.parameters, b.parameters)}
          {diffSection('Result summary', a.result, b.result)}
        </>
      )}

      {!loading && runs.length < 2 && (
        <Alert severity="info">
          Need at least two runs to compare. Execute algorithms from the{' '}
          <a href="/algorithms">Algorithms</a> page first.
        </Alert>
      )}
    </Container>
  );
}
