'use client';
/** SPICE testbench emitter. */
import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, TextField, MenuItem, Select,
  Button,
} from '@mui/material';
import { emitSpiceTb } from '@/lib/tools/spice_tb';

type AnaKind = 'tran' | 'dc' | 'ac';

export default function SpiceTbPage() {
  const [dut, setDut] = useState('amp1');
  const [subckt, setSubckt] = useState('amp1.spi');
  const [vdd, setVdd] = useState(1.0);
  const [analysis, setAnalysis] = useState<AnaKind>('tran');
  const r = useMemo(() => {
    const ana =
      analysis === 'tran' ? { kind: 'tran', tstep: 1e-12, tstop: 5e-9 } as const :
      analysis === 'dc'   ? { kind: 'dc', source: 'IN', from: 0, to: 1, step: 0.05 } as const :
                            { kind: 'ac', from: 1, to: 1e9, pointsPerDecade: 20 } as const;
    return emitSpiceTb({
      dut, subcktPath: subckt,
      pins: [{ name: 'in', net: 'vin' }, { name: 'out', net: 'vout' }],
      rails: [{ name: 'DD', node: 'vdd', volts: vdd }],
      sources: [
        analysis === 'ac'
          ? { name: 'IN', kind: 'ac', posNode: 'vin', negNode: '0', mag: 1 }
          : analysis === 'dc'
            ? { name: 'IN', kind: 'dc', posNode: 'vin', negNode: '0', volts: 0.5 }
            : { name: 'IN', kind: 'pwl', posNode: 'vin', negNode: '0',
                pts: [{ t: 0, v: 0 }, { t: 1e-9, v: 0 }, { t: 1.1e-9, v: 0.5 }, { t: 5e-9, v: 0.5 }] },
      ],
      analyses: [ana],
      measures: [
        { name: 'vp_max', expr: 'max v(vout)' },
        { name: 'gain',   expr: 'param=v(vout)/v(vin) at=1k' },
      ],
    });
  }, [dut, subckt, vdd, analysis]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">SPICE Testbench</Typography>
        <Chip label={`${r.lines} lines`} color="primary" />
        <Button size="small" variant="outlined"
          onClick={() => navigator.clipboard.writeText(r.netlist)}>
          copy netlist
        </Button>
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <TextField size="small" fullWidth label="DUT name"
              value={dut} onChange={e => setDut(e.target.value)} sx={{ mb: 1 }} />
            <TextField size="small" fullWidth label="subckt path"
              value={subckt} onChange={e => setSubckt(e.target.value)} sx={{ mb: 1 }} />
            <TextField size="small" fullWidth label="VDD (V)" type="number"
              value={vdd} onChange={e => setVdd(Number(e.target.value))} sx={{ mb: 1 }} />
            <Typography variant="caption">analysis</Typography>
            <Select size="small" fullWidth value={analysis}
              onChange={e => setAnalysis(e.target.value as AnaKind)}>
              <MenuItem value="tran">.tran</MenuItem>
              <MenuItem value="dc">.dc</MenuItem>
              <MenuItem value="ac">.ac</MenuItem>
            </Select>
          </Box>
          <Box sx={{ flex: 2 }}>
            <pre style={{
              padding: 12, fontSize: 11, fontFamily: 'monospace',
              border: '1px solid #cbd5e1', borderRadius: 4, overflow: 'auto',
              maxHeight: 360, background: '#0f172a', color: '#e2e8f0',
            }}>{r.netlist}</pre>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
