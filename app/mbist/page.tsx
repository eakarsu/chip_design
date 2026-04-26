'use client';
/** MBIST inserter view. */
import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { planMbist } from '@/lib/tools/mbist';

const MACROS = [
  { name: 'L1I',  depth: 4096,  width: 64 },
  { name: 'L1D',  depth: 8192,  width: 64 },
  { name: 'L2',   depth: 65536, width: 256 },
  { name: 'TLB',  depth: 64,    width: 32 },
  { name: 'BHT',  depth: 1024,  width: 8 },
];

export default function MbistPage() {
  const [clockNs, setClockNs] = useState(2);
  const r = useMemo(() => planMbist({ macros: MACROS, clockNs }), [clockNs]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">MBIST Insertion</Typography>
        <Chip label={`Σ test: ${r.totalTestTimeUs.toFixed(1)} μs`}
          sx={{ bgcolor: '#4f46e5', color: 'white' }} />
        <Chip label={`Σ wrap: ${r.totalWrapperAreaUm2.toFixed(0)} μm²`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Typography variant="caption">{r.algorithm}</Typography>
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption">test clock period: {clockNs} ns</Typography>
          <Slider size="small" min={1} max={10} step={1}
            value={clockNs} onChange={(_, v) => setClockNs(v as number)} />
        </Box>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>Macro</TableCell>
            <TableCell align="right">Bits</TableCell>
            <TableCell align="right">Cycles</TableCell>
            <TableCell align="right">Test (μs)</TableCell>
            <TableCell align="right">Wrap (μm²)</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {r.macros.map(m => (
              <TableRow key={m.name}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{m.name}</TableCell>
                <TableCell align="right">{m.bits.toLocaleString()}</TableCell>
                <TableCell align="right">{m.cycles.toLocaleString()}</TableCell>
                <TableCell align="right">{m.testTimeUs.toFixed(2)}</TableCell>
                <TableCell align="right">{m.wrapperAreaUm2.toFixed(0)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
