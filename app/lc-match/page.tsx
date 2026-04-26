'use client';
/** Two-element L-section matching network synthesizer. */
import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider, Table, TableHead,
  TableRow, TableCell, TableBody,
} from '@mui/material';
import { designLcMatch } from '@/lib/tools/lc_match';

export default function LcMatchPage() {
  const [Rs, setRs] = useState(50);
  const [Rl, setRl] = useState(200);
  const [Xs, setXs] = useState(0);
  const [Xl, setXl] = useState(0);
  const [fMhz, setF] = useState(900);
  const r = useMemo(() => {
    try {
      return designLcMatch({ Rs, Rl, Xs, Xl, f: fMhz * 1e6 });
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [Rs, Rl, Xs, Xl, fMhz]);
  const isErr = (x: unknown): x is { error: string } =>
    typeof (x as { error?: unknown })?.error === 'string';
  const fmt = (t: 'L' | 'C', v: number) =>
    t === 'L' ? `${(v * 1e9).toFixed(2)} nH` : `${(v * 1e12).toFixed(2)} pF`;

  return (
    <Box p={3}>
      <Typography variant="h4" mb={2}>LC Matching Network</Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2}>
          <Box flex={1}>
            <Typography variant="caption">Rs: {Rs} Ω</Typography>
            <Slider size="small" min={1} max={500} step={1}
              value={Rs} onChange={(_, v) => setRs(v as number)} />
            <Typography variant="caption">Xs: {Xs} Ω</Typography>
            <Slider size="small" min={-500} max={500} step={5}
              value={Xs} onChange={(_, v) => setXs(v as number)} />
          </Box>
          <Box flex={1}>
            <Typography variant="caption">Rl: {Rl} Ω</Typography>
            <Slider size="small" min={1} max={500} step={1}
              value={Rl} onChange={(_, v) => setRl(v as number)} />
            <Typography variant="caption">Xl: {Xl} Ω</Typography>
            <Slider size="small" min={-500} max={500} step={5}
              value={Xl} onChange={(_, v) => setXl(v as number)} />
          </Box>
          <Box flex={1}>
            <Typography variant="caption">f: {fMhz} MHz</Typography>
            <Slider size="small" min={10} max={10000} step={10}
              value={fMhz} onChange={(_, v) => setF(v as number)} />
          </Box>
        </Stack>
      </Paper>
      {isErr(r) ? (
        <Chip color="error" label={r.error} />
      ) : r.solutions.length === 0 ? (
        <Chip label="Rs == Rl — no matching needed" />
      ) : (
        <>
          <Stack direction="row" spacing={2} mb={2}>
            <Chip color="primary" label={`Q = ${r.solutions[0].Q.toFixed(3)}`} />
            <Chip label={`topology = ${r.solutions[0].topology}`} />
            <Chip label={`Γ ≈ ${r.gammaDb} dB`} />
          </Stack>
          <Paper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Solution</TableCell>
                  <TableCell>Series</TableCell>
                  <TableCell>Shunt</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {r.solutions.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell>#{i + 1}</TableCell>
                    <TableCell>{s.series.type} = {fmt(s.series.type, s.series.value)}</TableCell>
                    <TableCell>{s.shunt.type} = {fmt(s.shunt.type, s.shunt.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}
    </Box>
  );
}
