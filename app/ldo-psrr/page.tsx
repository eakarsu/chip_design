'use client';
/** LDO PSRR estimator. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
} from '@mui/material';
import { estimateLdoPsrr } from '@/lib/tools/ldo_psrr';

export default function LdoPsrrPage() {
  const [A0db, setA0db] = useState(60);
  const [fp1, setFp1] = useState(100);
  const [esr, setEsr] = useState(0.05);
  const [coutUf, setCoutUf] = useState(1);
  const r = useMemo(() => estimateLdoPsrr({
    A0: Math.pow(10, A0db / 20), fp1, esr, cout: coutUf * 1e-6,
    beta: 0.5, gmp: 1e-3, iload: 0.05,
  }), [A0db, fp1, esr, coutUf]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const pts = r.samples;
    const minDb = Math.min(...pts.map(p => p.psrrDb), 0);
    const maxDb = Math.max(...pts.map(p => p.psrrDb), 100);
    const fMin = pts[0].f, fMax = pts[pts.length - 1].f;
    ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = ((Math.log10(p.f) - Math.log10(fMin)) / (Math.log10(fMax) - Math.log10(fMin))) * (W - 40) + 30;
      const y = H - 20 - ((p.psrrDb - minDb) / (maxDb - minDb)) * (H - 40);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = '#475569'; ctx.font = '10px sans-serif';
    ctx.fillText('frequency (log)', W - 90, H - 4);
    ctx.fillText(`${Math.round(maxDb)} dB`, 4, 14);
    ctx.fillText(`${Math.round(minDb)} dB`, 4, H - 24);
  }, [r]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">LDO PSRR</Typography>
        <Chip label={`DC ${r.dcDb.toFixed(0)} dB`} color="primary" />
        <Chip label={`60-dB BW ${(r.fAtTarget / 1e3).toFixed(1)} kHz`} />
        <Chip label={`fz(ESR) ${(r.fEsrZero / 1e3).toFixed(1)} kHz`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">A0: {A0db} dB</Typography>
            <Slider size="small" min={20} max={100} step={2}
              value={A0db} onChange={(_, v) => setA0db(v as number)} />
            <Typography variant="caption">fp1: {fp1} Hz</Typography>
            <Slider size="small" min={1} max={10000} step={10}
              value={fp1} onChange={(_, v) => setFp1(v as number)} />
            <Typography variant="caption">ESR: {esr.toFixed(2)} Ω</Typography>
            <Slider size="small" min={0.001} max={1} step={0.01}
              value={esr} onChange={(_, v) => setEsr(v as number)} />
            <Typography variant="caption">Cout: {coutUf} μF</Typography>
            <Slider size="small" min={0.1} max={47} step={0.1}
              value={coutUf} onChange={(_, v) => setCoutUf(v as number)} />
          </Box>
          <Box sx={{ flex: 2 }}>
            <canvas ref={ref} width={520} height={220}
              style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 600 }} />
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
