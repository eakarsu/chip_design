'use client';
/** Spiral inductor Q estimator (Modified Wheeler). */
import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
} from '@mui/material';
import { estimateSpiralQ } from '@/lib/tools/spiral_q';

export default function SpiralQPage() {
  const [doutUm, setDout] = useState(200);
  const [dinUm, setDin]   = useState(80);
  const [N, setN]         = useState(4);
  const [wUm, setW]       = useState(8);
  const [sUm, setS]       = useState(2);
  const [rsOhmSq, setRs]  = useState(0.05);
  const [fGhz, setF]      = useState(2.4);

  const r = useMemo(() => {
    try {
      return estimateSpiralQ({ doutUm, dinUm, N, wUm, sUm, rsOhmSq, fGhz });
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [doutUm, dinUm, N, wUm, sUm, rsOhmSq, fGhz]);

  const isErr = (x: unknown): x is { error: string } =>
    typeof (x as { error?: unknown })?.error === 'string';

  return (
    <Box p={3}>
      <Typography variant="h4" mb={2}>Spiral Inductor Q</Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <Box flex={1}>
              <Typography variant="caption">Dout: {doutUm} μm</Typography>
              <Slider size="small" min={50} max={400} step={10}
                value={doutUm} onChange={(_, v) => setDout(v as number)} />
              <Typography variant="caption">Din: {dinUm} μm</Typography>
              <Slider size="small" min={20} max={300} step={5}
                value={dinUm} onChange={(_, v) => setDin(v as number)} />
              <Typography variant="caption">Turns N: {N}</Typography>
              <Slider size="small" min={1} max={10} step={1}
                value={N} onChange={(_, v) => setN(v as number)} />
            </Box>
            <Box flex={1}>
              <Typography variant="caption">Width W: {wUm} μm</Typography>
              <Slider size="small" min={2} max={20} step={1}
                value={wUm} onChange={(_, v) => setW(v as number)} />
              <Typography variant="caption">Spacing S: {sUm} μm</Typography>
              <Slider size="small" min={1} max={10} step={1}
                value={sUm} onChange={(_, v) => setS(v as number)} />
              <Typography variant="caption">Rs: {rsOhmSq.toFixed(3)} Ω/sq</Typography>
              <Slider size="small" min={0.01} max={0.2} step={0.005}
                value={rsOhmSq} onChange={(_, v) => setRs(v as number)} />
              <Typography variant="caption">f: {fGhz.toFixed(1)} GHz</Typography>
              <Slider size="small" min={0.5} max={30} step={0.1}
                value={fGhz} onChange={(_, v) => setF(v as number)} />
            </Box>
          </Stack>
        </Stack>
      </Paper>
      {isErr(r) ? (
        <Chip color="error" label={r.error} />
      ) : (
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <Chip color="primary" label={`L = ${r.L_nH.toFixed(2)} nH`} />
          <Chip label={`R = ${r.R_ohm.toFixed(2)} Ω`} />
          <Chip color={r.Q > 8 ? 'success' : 'warning'}
            label={`Q = ${r.Q.toFixed(2)}`} />
          <Chip label={`length ≈ ${(r.lengthUm / 1000).toFixed(2)} mm`} />
          {r.pastSelfResonance && <Chip color="error" label="past self-resonance" />}
          {r.notes.map((n, i) => <Chip key={i} variant="outlined" label={n} />)}
        </Stack>
      )}
    </Box>
  );
}
