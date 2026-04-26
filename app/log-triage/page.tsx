'use client';
/** Simulator log triage view. */
import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, TextField,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { triageLog } from '@/lib/tools/log_triage';

const DEFAULT_LOG = `UVM_INFO @ 0ns [TOP] starting test
UVM_INFO @ 100ns [DRV] sending xact 0xdeadbeef
UVM_ERROR @ 200ns [SCB] mismatch at addr 0x1000 exp=0x55 got=0xaa
UVM_ERROR @ 250ns [SCB] mismatch at addr 0x2000 exp=0x77 got=0xbb
UVM_ERROR @ 280ns [SCB] mismatch at addr 0x3000 exp=0x88 got=0xcc
UVM_WARNING @ 300ns [DRV] backpressure stalled
UVM_WARNING @ 320ns [DRV] backpressure stalled
UVM_FATAL @ 500ns [ENV] timeout waiting for ack
INFO simulation aborted
`;

const SEV: Record<string, string> = {
  UVM_FATAL: '#7c3aed',
  UVM_ERROR: '#dc2626',
  UVM_WARNING: '#f59e0b',
  UVM_INFO: '#0ea5e9',
  INFO: '#16a34a',
  OTHER: '#475569',
};

export default function LogTriagePage() {
  const [log, setLog] = useState(DEFAULT_LOG);
  const r = useMemo(() => triageLog(log), [log]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">Log Triage</Typography>
        {(Object.keys(r.bySeverity) as (keyof typeof r.bySeverity)[]).map(k => (
          <Chip key={k} label={`${k}: ${r.bySeverity[k]}`} size="small"
            sx={{ bgcolor: SEV[k], color: 'white' }} />
        ))}
        {r.firstFatal && (
          <Chip label={`first fatal @ line ${r.firstFatal}`}
            sx={{ bgcolor: '#7c3aed', color: 'white' }} />
        )}
      </Stack>
      <Paper sx={{ p: 2 }}>
        <TextField fullWidth multiline minRows={6} value={log}
          onChange={e => setLog(e.target.value)}
          slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 11 } } }} />
        <Typography variant="subtitle2" sx={{ mt: 2 }}>
          Buckets ({r.buckets.length})
        </Typography>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell align="right">Count</TableCell>
            <TableCell>Sev</TableCell>
            <TableCell>First @</TableCell>
            <TableCell>Example</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {r.buckets.slice(0, 12).map((b, i) => (
              <TableRow key={i}>
                <TableCell align="right">{b.count}</TableCell>
                <TableCell>
                  <Chip size="small" label={b.severity}
                    sx={{ bgcolor: SEV[b.severity], color: 'white' }} />
                </TableCell>
                <TableCell>{b.firstLine}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                  {b.example}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
