'use client';
/** EM (electromigration) checker. Add segments, see J / Jmax ratio. */
import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Alert,
} from '@mui/material';
import { checkEM, type EmSegment, type EmLayerSpec } from '@/lib/tools/em_check';

const LAYERS: EmLayerSpec[] = [
  { name: 'M1', thickness: 0.25, jmax: 0.6 },
  { name: 'M3', thickness: 0.30, jmax: 0.8 },
  { name: 'M5', thickness: 0.50, jmax: 1.0 },
  { name: 'M6', thickness: 0.80, jmax: 1.5 },
];
const SAMPLE: EmSegment[] = [
  { name: 'core_strap_0', layer: 'M5', width: 2, length: 100, current: 0.0009 },
  { name: 'core_strap_1', layer: 'M5', width: 1, length: 100, current: 0.0006 },
  { name: 'mem_strap',    layer: 'M3', width: 0.5, length: 50, current: 0.0002 },
  { name: 'io_rail',      layer: 'M6', width: 4, length: 200, current: 0.005 },
];

export default function EmCheckPage() {
  const [text, setText] = useState(JSON.stringify(SAMPLE, null, 2));
  const [err, setErr] = useState<string | null>(null);
  const result = useMemo(() => {
    try {
      setErr(null);
      return checkEM(JSON.parse(text), LAYERS);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [text]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">EM Checker</Typography>
        {result && <>
          <Chip label={`fail: ${result.failing}`} sx={{ bgcolor: '#dc2626', color: 'white' }} />
          <Chip label={`warn: ${result.warning}`} sx={{ bgcolor: '#f59e0b', color: 'white' }} />
          <Chip label={`Σ length: ${result.totalLength.toFixed(0)} μm`} />
        </>}
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, width: { xs: '100%', md: 420 } }}>
          <Typography variant="subtitle2" mb={1}>Segments JSON</Typography>
          <TextField multiline minRows={14} fullWidth value={text}
            onChange={e => setText(e.target.value)}
            slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 12 } } }} />
          {err && <Alert severity="error" sx={{ mt: 1 }}>{err}</Alert>}
        </Paper>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle2" mb={1}>Per-segment</Typography>
          {result && (
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Segment</TableCell><TableCell>Layer</TableCell>
                <TableCell align="right">J (mA/μm²)</TableCell>
                <TableCell align="right">J/Jmax</TableCell><TableCell>Status</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {result.reports.map(r => (
                  <TableRow key={r.name}>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{r.name}</TableCell>
                    <TableCell>{r.layer}</TableCell>
                    <TableCell align="right">{(r.J * 1000).toFixed(3)}</TableCell>
                    <TableCell align="right">{r.ratio.toFixed(2)}</TableCell>
                    <TableCell><Chip size="small" label={r.status}
                      sx={{ bgcolor: r.status === 'fail' ? '#dc2626' :
                                     r.status === 'warn' ? '#f59e0b' : '#16a34a',
                            color: 'white' }} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      </Stack>
    </Box>
  );
}
