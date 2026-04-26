'use client';
/** JTAG TAP / boundary-scan builder view. */
import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, TextField,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { buildJtag, type JtagPin } from '@/lib/tools/jtag';

const PINS: JtagPin[] = [
  { name: 'clk',   dir: 'input' },
  { name: 'rst_n', dir: 'input' },
  { name: 'data',  dir: 'bidir' },
  { name: 'addr',  dir: 'output' },
  { name: 'irq',   dir: 'output' },
];

export default function JtagPage() {
  const [tmsStr, setTmsStr] = useState('011110011001');
  const tms = useMemo(() =>
    tmsStr.split('').filter(c => c === '0' || c === '1').map(c => +c as 0 | 1),
    [tmsStr]);
  const r = useMemo(() => buildJtag({ pins: PINS, tms, start: 'TLR' }), [tms]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">JTAG / Boundary-Scan</Typography>
        <Chip label={`BSR: ${r.bsrLength}`} sx={{ bgcolor: '#4f46e5', color: 'white' }} />
        <Chip label={`final: ${r.finalState}`}
          sx={{ bgcolor: '#0ea5e9', color: 'white' }} />
        <Chip label={`shift: ${r.extestShiftCycles} cyc`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <TextField fullWidth size="small" label="TMS bits"
          value={tmsStr} onChange={e => setTmsStr(e.target.value)}
          sx={{ mb: 2 }} />
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2">BSR cells</Typography>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>#</TableCell>
                <TableCell>Pin</TableCell>
                <TableCell>Type</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {r.bsr.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell>{i}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{c.pin}</TableCell>
                    <TableCell>{c.type}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2">TAP trace</Typography>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>cyc</TableCell>
                <TableCell>TMS</TableCell>
                <TableCell>state</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {r.trace.map(t => (
                  <TableRow key={t.cycle}>
                    <TableCell>{t.cycle}</TableCell>
                    <TableCell>{t.tms}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{t.state}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
