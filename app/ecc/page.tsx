'use client';
/** ECC / SECDED encoder + decoder visualizer. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider, MenuItem, Select, TextField,
  Table, TableBody, TableCell, TableHead, TableRow, Button,
} from '@mui/material';
import { encodeEcc, decodeEcc } from '@/lib/tools/ecc';

export default function EccPage() {
  const [dataBits, setDataBits] = useState(16);
  const [dataHex, setDataHex] = useState('CAFE');
  const [flip1, setFlip1] = useState(3);
  const [flip2, setFlip2] = useState(0); // 0 = no second flip
  const enc = useMemo(() => {
    try {
      const v = BigInt('0x' + (dataHex || '0').replace(/[^0-9a-fA-F]/g, '') || '0');
      const masked = v & ((1n << BigInt(dataBits)) - 1n);
      return encodeEcc({ dataBits, data: masked });
    } catch (e) { return { error: (e as Error).message } as never; }
  }, [dataBits, dataHex]);
  const corrupted = useMemo(() => {
    if ('error' in (enc as object)) return null;
    let cw = (enc as { codeword: bigint }).codeword;
    if (flip1 > 0 && flip1 <= (enc as { n: number }).n) {
      cw ^= 1n << BigInt(flip1 - 1);
    }
    if (flip2 > 0 && flip2 <= (enc as { n: number }).n) {
      cw ^= 1n << BigInt(flip2 - 1);
    }
    return cw;
  }, [enc, flip1, flip2]);
  const dec = useMemo(() => {
    if (corrupted == null) return null;
    return decodeEcc(corrupted, dataBits);
  }, [corrupted, dataBits]);

  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if ('error' in (enc as object)) return;
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const n = (enc as { n: number }).n;
    const parityPos = (enc as { parityPositions: number[] }).parityPositions;
    const cw = corrupted ?? (enc as { codeword: bigint }).codeword;
    const bw = Math.min(20, (W - 20) / n);
    for (let i = 1; i <= n; i++) {
      const x = 10 + (i - 1) * bw;
      const y = 30;
      const isPar = parityPos.includes(i);
      const isOverall = i === n;
      const bit = Number((cw >> BigInt(i - 1)) & 1n);
      const isFlipped = i === flip1 || i === flip2;
      ctx.fillStyle = isFlipped ? '#dc2626' :
        isOverall ? '#a855f7' : isPar ? '#0ea5e9' : '#16a34a';
      ctx.fillRect(x, y, bw - 1, 24);
      ctx.fillStyle = 'white'; ctx.font = '11px sans-serif';
      ctx.fillText(String(bit), x + bw / 2 - 3, y + 16);
      ctx.fillStyle = '#475569'; ctx.font = '9px sans-serif';
      ctx.fillText(String(i), x + 1, y + 36);
    }
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#0ea5e9'; ctx.fillText('■ parity', 10, 90);
    ctx.fillStyle = '#a855f7'; ctx.fillText('■ overall', 70, 90);
    ctx.fillStyle = '#16a34a'; ctx.fillText('■ data', 130, 90);
    ctx.fillStyle = '#dc2626'; ctx.fillText('■ flipped', 175, 90);
  }, [enc, corrupted, flip1, flip2]);

  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">ECC / SECDED</Typography>
        {!('error' in (enc as object)) && (
          <>
            <Chip label={`n=${(enc as { n: number }).n}, p=${(enc as { p: number }).p}`} color="primary" />
            {dec && (
              <Chip label={dec.status}
                sx={{
                  bgcolor: dec.status === 'NO_ERROR' ? '#16a34a' :
                    dec.status === 'CORRECTED' ? '#0ea5e9' :
                    dec.status === 'PARITY_ONLY' ? '#a855f7' : '#dc2626',
                  color: 'white',
                }} />
            )}
            {dec && dec.correctedBit > 0 && (
              <Chip label={`fixed bit ${dec.correctedBit}`} />
            )}
          </>
        )}
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">data bits</Typography>
            <Select size="small" fullWidth value={dataBits}
              onChange={e => setDataBits(Number(e.target.value))}>
              {[4, 8, 16, 32, 64].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </Select>
            <TextField size="small" fullWidth label="data (hex)"
              value={dataHex} onChange={e => setDataHex(e.target.value)}
              sx={{ mt: 1 }} />
            <Typography variant="caption">flip bit #1: {flip1}</Typography>
            <Slider size="small" min={0} max={(enc as { n?: number }).n ?? 32} step={1}
              value={flip1} onChange={(_, v) => setFlip1(v as number)} />
            <Typography variant="caption">flip bit #2: {flip2 || 'none'}</Typography>
            <Slider size="small" min={0} max={(enc as { n?: number }).n ?? 32} step={1}
              value={flip2} onChange={(_, v) => setFlip2(v as number)} />
            <Button size="small" variant="outlined" sx={{ mt: 1 }}
              onClick={() => { setFlip1(0); setFlip2(0); }}>clear flips</Button>
          </Box>
          <Box sx={{ flex: 2 }}>
            <canvas ref={ref} width={520} height={100}
              style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 600 }} />
            {dec && !('error' in (enc as object)) && (
              <Table size="small" sx={{ mt: 2 }}>
                <TableHead><TableRow>
                  <TableCell></TableCell>
                  <TableCell align="right">value (hex)</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  <TableRow><TableCell>codeword</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                      {(enc as { codeword: bigint }).codeword.toString(16)}
                    </TableCell></TableRow>
                  <TableRow><TableCell>corrupted</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                      {corrupted!.toString(16)}
                    </TableCell></TableRow>
                  <TableRow><TableCell>recovered data</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                      {dec.data.toString(16)}
                    </TableCell></TableRow>
                  <TableRow><TableCell>syndrome</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                      {dec.syndrome}
                    </TableCell></TableRow>
                </TableBody>
              </Table>
            )}
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
