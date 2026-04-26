'use client';
/** CDC checker UI. */
import { useMemo } from 'react';
import {
  Box, Stack, Typography, Paper, Chip,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { checkCdc } from '@/lib/tools/cdc';

const SIGNALS = [
  { name: 'rst_a',   srcClk: 'clk_a', width: 1 },
  { name: 'data_a',  srcClk: 'clk_a', width: 8 },
  { name: 'data_b',  srcClk: 'clk_a', width: 8, gray: true },
  { name: 'cmd',     srcClk: 'clk_a', width: 4, handshakeWith: 'cmd_ack' },
  { name: 'stat',    srcClk: 'clk_a', width: 1 },
];
const CROSSINGS = [
  { src: 'rst_a',  dst: 'rst_b',     dstClk: 'clk_b', syncDepth: 2 },
  { src: 'data_a', dst: 'd_b',       dstClk: 'clk_b', syncDepth: 2 },
  { src: 'data_b', dst: 'g_b',       dstClk: 'clk_b', syncDepth: 2 },
  { src: 'cmd',    dst: 'cmd_b',     dstClk: 'clk_b', syncDepth: 2 },
  { src: 'stat',   dst: 'stat_b1',   dstClk: 'clk_b', syncDepth: 2 },
  { src: 'stat',   dst: 'stat_b2',   dstClk: 'clk_b', syncDepth: 2 },
];

const SEV: Record<string, string> = { ok: '#16a34a', warn: '#f59e0b', error: '#dc2626' };

export default function CdcPage() {
  const r = useMemo(() => checkCdc(SIGNALS, CROSSINGS), []);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">CDC Checker</Typography>
        <Chip label={`errors: ${r.errors}`}
          sx={{ bgcolor: r.errors > 0 ? '#dc2626' : '#16a34a', color: 'white' }} />
        <Chip label={`warn: ${r.warnings}`}
          sx={{ bgcolor: '#f59e0b', color: 'white' }} />
        <Chip label={`domains: ${r.domains.join(', ')}`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>Src</TableCell>
            <TableCell>Dst</TableCell>
            <TableCell>From → To</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Message</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {r.reports.map((rep, i) => (
              <TableRow key={i}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{rep.src}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{rep.dst}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>
                  {rep.srcClk} → {rep.dstClk}
                </TableCell>
                <TableCell>
                  <Chip size="small" label={rep.status}
                    sx={{ bgcolor: SEV[rep.severity], color: 'white' }} />
                </TableCell>
                <TableCell>{rep.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
