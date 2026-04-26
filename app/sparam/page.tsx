'use client';
/** Touchstone (.s2p) S-parameter viewer. */
import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, TextField, Table, TableHead,
  TableRow, TableCell, TableBody,
} from '@mui/material';
import { parseTouchstone, vswrFromS11, returnLossDb } from '@/lib/tools/sparam';

const SAMPLE = `# GHz S MA R 50
1.0 0.30 -45 0.95 -10 0.05 90 0.20 -30
2.0 0.20 -90 0.90 -20 0.06 60 0.18 -45
3.0 0.15 -135 0.85 -30 0.08 30 0.16 -60
4.0 0.18 175 0.82 -40 0.10 0 0.15 -75
`;

export default function SparamPage() {
  const [text, setText] = useState(SAMPLE);
  const r = useMemo(() => {
    try {
      const f = parseTouchstone(text);
      return f;
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [text]);
  const isErr = (x: unknown): x is { error: string } =>
    typeof (x as { error?: unknown })?.error === 'string';

  return (
    <Box p={3}>
      <Typography variant="h4" mb={2}>S-Parameter Viewer</Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="caption" mb={1} display="block">
          Touchstone v1 (.s2p) — header `# GHz S MA R 50` and 9-column rows.
        </Typography>
        <TextField fullWidth multiline minRows={6} maxRows={14}
          value={text} onChange={e => setText(e.target.value)}
          slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 12 } } }}
        />
      </Paper>
      {isErr(r) ? (
        <Chip color="error" label={r.error} />
      ) : (
        <>
          <Stack direction="row" spacing={2} mb={2}>
            <Chip color="primary" label={`${r.samples.length} sample(s)`} />
            <Chip label={`${r.units} ${r.format}`} />
            <Chip label={`Z₀ = ${r.z0} Ω`} />
          </Stack>
          <Paper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>f (GHz)</TableCell>
                  <TableCell>|S11|</TableCell>
                  <TableCell>|S21| (dB)</TableCell>
                  <TableCell>VSWR</TableCell>
                  <TableCell>RL (dB)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {r.samples.map((s, i) => {
                  const s11 = Math.hypot(s.S11.re, s.S11.im);
                  const s21db = 20 * Math.log10(Math.max(1e-12, Math.hypot(s.S21.re, s.S21.im)));
                  return (
                    <TableRow key={i}>
                      <TableCell>{(s.fHz / 1e9).toFixed(3)}</TableCell>
                      <TableCell>{s11.toFixed(3)}</TableCell>
                      <TableCell>{s21db.toFixed(2)}</TableCell>
                      <TableCell>{vswrFromS11(s.S11.re, s.S11.im).toFixed(2)}</TableCell>
                      <TableCell>{returnLossDb(s.S11.re, s.S11.im).toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}
    </Box>
  );
}
