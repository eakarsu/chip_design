'use client';
/** Latch-up rule check. */
import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { checkLatchup } from '@/lib/tools/latchup';

const DEVICES = [
  { name: 'N0', kind: 'nmos' as const, x: 5, y: 5 },
  { name: 'N1', kind: 'nmos' as const, x: 25, y: 25 },
  { name: 'N2', kind: 'nmos' as const, x: 100, y: 100 },
  { name: 'P0', kind: 'pmos' as const, x: 5, y: 50 },
  { name: 'P1', kind: 'pmos' as const, x: 80, y: 50 },
];
const TAPS = [
  { name: 'PT0', kind: 'ptap' as const, x: 8, y: 8 },
  { name: 'PT1', kind: 'ptap' as const, x: 22, y: 22 },
  { name: 'NT0', kind: 'ntap' as const, x: 10, y: 50 },
  { name: 'NT1', kind: 'ntap' as const, x: 80, y: 50 },
];

export default function LatchupPage() {
  const [maxD, setMaxD] = useState(15);
  const r = useMemo(() => checkLatchup(DEVICES, TAPS, maxD), [maxD]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">Latch-up Check</Typography>
        <Chip label={`failing: ${r.failing}`}
          sx={{ bgcolor: r.failing > 0 ? '#dc2626' : '#16a34a', color: 'white' }} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Typography variant="caption">max tap distance (μm): {maxD}</Typography>
        <Slider size="small" min={1} max={100} step={1}
          value={maxD} onChange={(_, v) => setMaxD(v as number)} />
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>Device</TableCell><TableCell>Kind</TableCell>
            <TableCell>Nearest tap</TableCell><TableCell align="right">d</TableCell>
            <TableCell>OK</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {r.reports.map(rep => (
              <TableRow key={rep.device}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{rep.device}</TableCell>
                <TableCell>{rep.kind}</TableCell>
                <TableCell>{rep.nearestTap ?? '—'}</TableCell>
                <TableCell align="right">
                  {Number.isFinite(rep.distance) ? rep.distance.toFixed(2) : '∞'}
                </TableCell>
                <TableCell>
                  <Chip size="small" label={rep.ok ? '✓' : '✗'}
                    sx={{ bgcolor: rep.ok ? '#16a34a' : '#dc2626', color: 'white' }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
