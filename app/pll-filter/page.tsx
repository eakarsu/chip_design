'use client';
/** PLL loop-filter calculator. */
import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
  Table, TableBody, TableCell, TableRow,
} from '@mui/material';
import { calcPllFilter } from '@/lib/tools/pll_filter';

export default function PllFilterPage() {
  const [fvco, setFvco] = useState(2.5e9);
  const [fc, setFc] = useState(250e3);
  const [pmDeg, setPmDeg] = useState(60);
  const [icpUa, setIcpUa] = useState(100);
  const [kvco, setKvco] = useState(500e6);
  const r = useMemo(() => {
    try {
      return calcPllFilter({
        fref: 25e6, fvco, fc, pmDeg, kvco, icp: icpUa * 1e-6,
      });
    } catch (e) { return { error: (e as Error).message } as never; }
  }, [fvco, fc, pmDeg, icpUa, kvco]);
  const isErr = 'error' in (r as object);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">PLL Loop Filter</Typography>
        {!isErr && (
          <>
            <Chip label={`N = ${(r as ReturnType<typeof calcPllFilter>).N.toFixed(0)}`} color="primary" />
            <Chip label={`PM ${(r as ReturnType<typeof calcPllFilter>).pmActualDeg.toFixed(0)}°`} />
            <Chip label={`b = ${(r as ReturnType<typeof calcPllFilter>).b.toFixed(2)}`} />
          </>
        )}
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">fvco: {(fvco / 1e9).toFixed(2)} GHz</Typography>
            <Slider size="small" min={0.5e9} max={6e9} step={0.1e9}
              value={fvco} onChange={(_, v) => setFvco(v as number)} />
            <Typography variant="caption">fc (loop BW): {(fc / 1e3).toFixed(0)} kHz</Typography>
            <Slider size="small" min={10e3} max={2e6} step={10e3}
              value={fc} onChange={(_, v) => setFc(v as number)} />
            <Typography variant="caption">PM: {pmDeg}°</Typography>
            <Slider size="small" min={35} max={75} step={1}
              value={pmDeg} onChange={(_, v) => setPmDeg(v as number)} />
            <Typography variant="caption">Icp: {icpUa} μA</Typography>
            <Slider size="small" min={20} max={1000} step={10}
              value={icpUa} onChange={(_, v) => setIcpUa(v as number)} />
            <Typography variant="caption">Kvco: {(kvco / 1e6).toFixed(0)} MHz/V</Typography>
            <Slider size="small" min={50e6} max={2e9} step={50e6}
              value={kvco} onChange={(_, v) => setKvco(v as number)} />
          </Box>
          <Box sx={{ flex: 2 }}>
            {!isErr && (
              <Table size="small">
                <TableBody>
                  <TableRow><TableCell>R</TableCell>
                    <TableCell align="right">{((r as ReturnType<typeof calcPllFilter>).R / 1e3).toFixed(2)} kΩ</TableCell></TableRow>
                  <TableRow><TableCell>C1</TableCell>
                    <TableCell align="right">{((r as ReturnType<typeof calcPllFilter>).C1 * 1e12).toFixed(2)} pF</TableCell></TableRow>
                  <TableRow><TableCell>C2</TableCell>
                    <TableCell align="right">{((r as ReturnType<typeof calcPllFilter>).C2 * 1e12).toFixed(2)} pF</TableCell></TableRow>
                  <TableRow><TableCell>achieved PM</TableCell>
                    <TableCell align="right">{(r as ReturnType<typeof calcPllFilter>).pmActualDeg.toFixed(1)}°</TableCell></TableRow>
                </TableBody>
              </Table>
            )}
            {isErr && <Typography color="error">{(r as unknown as { error: string }).error}</Typography>}
            {!isErr && (r as ReturnType<typeof calcPllFilter>).notes.length > 0 && (
              <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
                {(r as ReturnType<typeof calcPllFilter>).notes.join(' · ')}
              </Typography>
            )}
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
