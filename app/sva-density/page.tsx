'use client';
/** SVA density map. */
import { useMemo } from 'react';
import {
  Box, Stack, Typography, Paper, Chip,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { computeSvaDensity } from '@/lib/tools/sva_density';

function fakeMod(name: string, loc: number, asserts: number, covers: number) {
  const lines: string[] = [`module ${name};`];
  for (let i = 0; i < loc; i++) lines.push(`  logic w${i};`);
  for (let i = 0; i < asserts; i++) lines.push(`  assert property (@(posedge clk) a${i});`);
  for (let i = 0; i < covers; i++) lines.push(`  cover property (@(posedge clk) c${i});`);
  lines.push('endmodule');
  return { name, source: lines.join('\n') };
}

const MODULES = [
  fakeMod('cpu_core',    600, 18,  6),
  fakeMod('icache',      300,  9,  4),
  fakeMod('dcache',      350,  7,  5),
  fakeMod('fpu',         420,  3,  1),
  fakeMod('mmu',         260,  1,  0),
  fakeMod('uart',        180,  0,  0),
  fakeMod('debug',       240,  2,  0),
];

const BAND: Record<string, string> = {
  high: '#16a34a', mid: '#0ea5e9', low: '#dc2626',
};

export default function SvaDensityPage() {
  const r = useMemo(() => computeSvaDensity({ modules: MODULES }), []);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">SVA Density</Typography>
        <Chip label={`overall: ${r.overallDensity.toFixed(1)} / kLOC`}
          sx={{ bgcolor: '#4f46e5', color: 'white' }} />
        <Chip label={`Σ asserts: ${r.totalAsserts}`} />
        <Chip label={`Σ covers: ${r.totalCovers}`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>Module</TableCell>
            <TableCell align="right">LOC</TableCell>
            <TableCell align="right">A</TableCell>
            <TableCell align="right">C</TableCell>
            <TableCell align="right">Density</TableCell>
            <TableCell>Band</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {r.reports.map(rep => (
              <TableRow key={rep.module}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{rep.module}</TableCell>
                <TableCell align="right">{rep.loc}</TableCell>
                <TableCell align="right">{rep.asserts}</TableCell>
                <TableCell align="right">{rep.covers}</TableCell>
                <TableCell align="right">{rep.density.toFixed(1)}</TableCell>
                <TableCell>
                  <Chip size="small" label={rep.band}
                    sx={{ bgcolor: BAND[rep.band], color: 'white' }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
