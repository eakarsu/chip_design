'use client';
/** Lifetime / FIT predictor. */
import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { computeFIT } from '@/lib/tools/fit_model';

export default function FitPage() {
  const [tempC, setTempC] = useState(85);
  const r = useMemo(() => computeFIT({
    useK: tempC + 273.15, stressK: 358.15,
    mechanisms: [
      { name: 'NBTI',     population: 1e7, baseFit: 0.5e-4, Ea: 0.7 },
      { name: 'HCI',      population: 1e7, baseFit: 0.3e-4, Ea: 0.5 },
      { name: 'TDDB',     population: 1e7, baseFit: 0.4e-4, Ea: 0.9 },
      { name: 'EM',       population: 1e3, baseFit: 1.0e-2, Ea: 0.9 },
      { name: 'Soft-err', population: 1,   baseFit: 100,    Ea: 0   },
    ],
  }), [tempC]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">Lifetime / FIT</Typography>
        <Chip label={`Σ FIT: ${r.totalFit.toFixed(1)}`}
          sx={{ bgcolor: '#4f46e5', color: 'white' }} />
        <Chip label={`MTTF: ${r.mttfYears.toFixed(2)} yr`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Typography variant="caption">use temp (°C): {tempC}</Typography>
        <Slider size="small" min={25} max={150} step={5}
          value={tempC} onChange={(_, v) => setTempC(v as number)} />
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>Mechanism</TableCell>
            <TableCell align="right">FIT</TableCell>
            <TableCell align="right">Share</TableCell>
            <TableCell align="right">MTTF (yr)</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {r.contributions.map(c => (
              <TableRow key={c.name}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{c.name}</TableCell>
                <TableCell align="right">{c.fit.toFixed(2)}</TableCell>
                <TableCell align="right">{(c.fraction * 100).toFixed(1)}%</TableCell>
                <TableCell align="right">
                  {Number.isFinite(c.mttfHours) ? (c.mttfHours / 8760).toFixed(1) : '∞'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
