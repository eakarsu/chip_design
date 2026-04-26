'use client';
/** Coverage merger UI. */
import { useMemo } from 'react';
import {
  Box, Stack, Typography, Paper, Chip,
  Table, TableBody, TableCell, TableHead, TableRow, LinearProgress,
} from '@mui/material';
import { mergeCoverage } from '@/lib/tools/cov_merge';

const DBS = [
  {
    name: 'regress_a',
    bins: {
      'cpu.alu.add':    3, 'cpu.alu.sub':    1, 'cpu.alu.mul':    0,
      'cpu.fpu.fmul':   2, 'cpu.fpu.fdiv':   0,
      'mem.tlb.hit':    8, 'mem.tlb.miss':   0,
      'noc.flit.head':  4, 'noc.flit.tail':  4,
    },
  },
  {
    name: 'regress_b',
    bins: {
      'cpu.alu.add':    1, 'cpu.alu.sub':    2, 'cpu.alu.mul':    1,
      'cpu.fpu.fmul':   1, 'cpu.fpu.fdiv':   3,
      'mem.tlb.hit':    5, 'mem.tlb.miss':   2,
      'noc.flit.head':  0, 'noc.flit.tail':  0,
    },
  },
  {
    name: 'random_c',
    bins: {
      'cpu.alu.add':    9, 'cpu.alu.sub':    7, 'cpu.alu.mul':    4,
      'cpu.fpu.fmul':   0, 'cpu.fpu.fdiv':   1,
      'mem.tlb.hit':    2, 'mem.tlb.miss':   3,
      'noc.flit.head':  6, 'noc.flit.tail':  6,
    },
  },
];

export default function CovMergePage() {
  const r = useMemo(() => mergeCoverage({ dbs: DBS }), []);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">Coverage Merger</Typography>
        <Chip label={`coverage: ${(r.coverage * 100).toFixed(1)}%`}
          sx={{ bgcolor: '#4f46e5', color: 'white' }} />
        <Chip label={`${r.covered}/${r.totalBins} bins`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>By Module</Typography>
        <Table size="small" sx={{ mb: 3 }}>
          <TableHead><TableRow>
            <TableCell>Module</TableCell>
            <TableCell align="right">Bins</TableCell>
            <TableCell align="right">Cov</TableCell>
            <TableCell sx={{ width: '40%' }}>Coverage</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {r.byModule.map(b => (
              <TableRow key={b.module}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{b.module}</TableCell>
                <TableCell align="right">{b.total}</TableCell>
                <TableCell align="right">{(b.coverage * 100).toFixed(0)}%</TableCell>
                <TableCell>
                  <LinearProgress variant="determinate" value={b.coverage * 100} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Per-DB unique hits</Typography>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>DB</TableCell>
            <TableCell align="right">Unique Bins</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {r.perDbUnique.map(d => (
              <TableRow key={d.name}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{d.name}</TableCell>
                <TableCell align="right">{d.uniqueHits}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
