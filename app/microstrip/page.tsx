'use client';
/** Microstrip / CPW Z₀ calculator. */
import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { calcLine, type LineKind } from '@/lib/tools/microstrip';

export default function MicrostripPage() {
  const [kind, setKind] = useState<LineKind>('microstrip');
  const [wUm, setW] = useState(150);
  const [hUm, setH] = useState(100);
  const [sUm, setS] = useState(80);
  const [er, setEr] = useState(4.4);
  const [fGhz, setF] = useState(2.4);
  const r = useMemo(() => {
    try {
      return calcLine({ kind, wUm, hUm, sUm, er, fGhz });
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [kind, wUm, hUm, sUm, er, fGhz]);
  const isErr = (x: unknown): x is { error: string } =>
    typeof (x as { error?: unknown })?.error === 'string';

  return (
    <Box p={3}>
      <Typography variant="h4" mb={2}>Microstrip / CPW Z₀</Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <ToggleButtonGroup exclusive value={kind} size="small"
            onChange={(_, v) => v && setKind(v)}>
            <ToggleButton value="microstrip">Microstrip</ToggleButton>
            <ToggleButton value="cpw">CPW</ToggleButton>
          </ToggleButtonGroup>
          <Stack direction="row" spacing={2}>
            <Box flex={1}>
              <Typography variant="caption">W: {wUm} μm</Typography>
              <Slider size="small" min={20} max={500} step={5}
                value={wUm} onChange={(_, v) => setW(v as number)} />
              {kind === 'microstrip' ? (
                <>
                  <Typography variant="caption">H: {hUm} μm</Typography>
                  <Slider size="small" min={20} max={500} step={5}
                    value={hUm} onChange={(_, v) => setH(v as number)} />
                </>
              ) : (
                <>
                  <Typography variant="caption">Gap S: {sUm} μm</Typography>
                  <Slider size="small" min={5} max={300} step={5}
                    value={sUm} onChange={(_, v) => setS(v as number)} />
                </>
              )}
            </Box>
            <Box flex={1}>
              <Typography variant="caption">εr: {er.toFixed(2)}</Typography>
              <Slider size="small" min={1.1} max={12} step={0.1}
                value={er} onChange={(_, v) => setEr(v as number)} />
              <Typography variant="caption">f: {fGhz.toFixed(1)} GHz</Typography>
              <Slider size="small" min={0.1} max={50} step={0.1}
                value={fGhz} onChange={(_, v) => setF(v as number)} />
            </Box>
          </Stack>
        </Stack>
      </Paper>
      {isErr(r) ? (
        <Chip color="error" label={r.error} />
      ) : (
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <Chip color="primary" label={`Z₀ = ${r.z0.toFixed(1)} Ω`} />
          <Chip label={`εeff = ${r.eEff.toFixed(2)}`} />
          <Chip label={`vp = ${(r.vp / 1e8).toFixed(2)}·10⁸ m/s`} />
          {r.lambdaMm > 0 && <Chip label={`λ = ${r.lambdaMm.toFixed(2)} mm`} />}
          {r.notes.map((n, i) => <Chip key={i} variant="outlined" color="warning" label={n} />)}
        </Stack>
      )}
    </Box>
  );
}
