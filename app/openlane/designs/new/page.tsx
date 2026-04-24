'use client';

/**
 * New OpenLane design form.  Models the minimum an OpenLane config
 * needs: DESIGN_NAME + RTL + (optional) ports/clocks + config knobs.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container, Typography, Paper, TextField, Button, Box, Alert, Grid,
  IconButton, MenuItem,
} from '@mui/material';
import { Save, Add, Close } from '@mui/icons-material';

const SAMPLE_RTL = `module counter #(parameter W = 8) (
  input  wire         clk,
  input  wire         rst_n,
  input  wire         en,
  output reg  [W-1:0] q
);
  always @(posedge clk or negedge rst_n) begin
    if (!rst_n)      q <= {W{1'b0}};
    else if (en)     q <= q + 1'b1;
  end
endmodule
`;

interface Port  { name: string; direction: 'input' | 'output' | 'inout'; }
interface Clock { name: string; periodNs: number; }

export default function NewDesignPage() {
  const router = useRouter();
  const [name, setName] = useState('counter');
  const [rtl,  setRtl]  = useState(SAMPLE_RTL);
  const [ports,  setPorts]  = useState<Port[]>([
    { name: 'clk',   direction: 'input'  },
    { name: 'rst_n', direction: 'input'  },
    { name: 'en',    direction: 'input'  },
    { name: 'q',     direction: 'output' },
  ]);
  const [clocks, setClocks] = useState<Clock[]>([{ name: 'clk', periodNs: 10 }]);
  const [clockPeriod, setClockPeriod] = useState(10);
  const [coreUtil,    setCoreUtil]    = useState(0.5);
  const [targetDensity, setTargetDensity] = useState(0.55);
  const [cellCount, setCellCount] = useState(30);
  const [netCount,  setNetCount]  = useState(40);
  const [pdk,       setPdk]       = useState('sky130A');
  const [runTo,     setRunTo]     = useState('signoff');
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/openlane/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, rtl, ports, clocks,
          config: {
            DESIGN_NAME: name,
            CLOCK_PERIOD: clockPeriod,
            FP_CORE_UTIL: coreUtil,
            PL_TARGET_DENSITY: targetDensity,
            CELL_COUNT: cellCount,
            NET_COUNT: netCount,
            PDK: pdk,
            RUN_TO: runTo,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? j.error ?? 'Failed');
      router.push(`/openlane/designs/${j.design.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>New OpenLane Design</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Creates a design the simulator can run through the 10-stage flow.
        Only DESIGN_NAME is required; everything else has sensible defaults.
      </Typography>

      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Identity</Typography>
        <TextField
          label="DESIGN_NAME" value={name} onChange={e => setName(e.target.value)}
          fullWidth size="small" sx={{ mb: 2 }}
        />
        <TextField
          label="RTL (Verilog)" value={rtl} onChange={e => setRtl(e.target.value)}
          fullWidth multiline minRows={10} size="small"
          inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
        />
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Ports</Typography>
          <Button
            size="small" startIcon={<Add />}
            onClick={() => setPorts([...ports, { name: '', direction: 'input' }])}
          >
            Add port
          </Button>
        </Box>
        {ports.map((p, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small" label="name" value={p.name}
              onChange={e => setPorts(ports.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              sx={{ flexGrow: 1 }}
            />
            <TextField
              size="small" select label="direction" value={p.direction}
              onChange={e => setPorts(ports.map((x, j) => j === i ? { ...x, direction: e.target.value as any } : x))}
              sx={{ width: 140 }}
            >
              <MenuItem value="input">input</MenuItem>
              <MenuItem value="output">output</MenuItem>
              <MenuItem value="inout">inout</MenuItem>
            </TextField>
            <IconButton onClick={() => setPorts(ports.filter((_, j) => j !== i))}>
              <Close fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Clocks</Typography>
          <Button
            size="small" startIcon={<Add />}
            onClick={() => setClocks([...clocks, { name: '', periodNs: 10 }])}
          >
            Add clock
          </Button>
        </Box>
        {clocks.map((c, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small" label="name" value={c.name}
              onChange={e => setClocks(clocks.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              sx={{ flexGrow: 1 }}
            />
            <TextField
              size="small" type="number" label="period (ns)" value={c.periodNs}
              onChange={e => setClocks(clocks.map((x, j) => j === i ? { ...x, periodNs: parseFloat(e.target.value) || 0 } : x))}
              sx={{ width: 140 }}
            />
            <IconButton onClick={() => setClocks(clocks.filter((_, j) => j !== i))}>
              <Close fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Config knobs (initial)</Typography>
        <Grid container spacing={2}>
          <Grid item xs={6} md={3}>
            <TextField
              fullWidth size="small" type="number" label="CLOCK_PERIOD (ns)"
              value={clockPeriod} onChange={e => setClockPeriod(parseFloat(e.target.value) || 0)}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField
              fullWidth size="small" type="number" label="FP_CORE_UTIL (0..1)"
              value={coreUtil} onChange={e => setCoreUtil(parseFloat(e.target.value) || 0)}
              inputProps={{ step: 0.05, min: 0.1, max: 1 }}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField
              fullWidth size="small" type="number" label="PL_TARGET_DENSITY (0..1)"
              value={targetDensity} onChange={e => setTargetDensity(parseFloat(e.target.value) || 0)}
              inputProps={{ step: 0.05, min: 0.1, max: 1 }}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField
              fullWidth size="small" type="number" label="CELL_COUNT"
              value={cellCount} onChange={e => setCellCount(parseInt(e.target.value, 10) || 1)}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField
              fullWidth size="small" type="number" label="NET_COUNT"
              value={netCount} onChange={e => setNetCount(parseInt(e.target.value, 10) || 1)}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField
              fullWidth size="small" select label="PDK"
              value={pdk} onChange={e => setPdk(e.target.value)}
              helperText="Standard-cell library"
            >
              <MenuItem value="sky130A">sky130A (HD · 130nm)</MenuItem>
              <MenuItem value="sky130B">sky130B (HS · 130nm)</MenuItem>
              <MenuItem value="gf180mcuC">gf180mcuC (7T · 180nm)</MenuItem>
              <MenuItem value="gf180mcuD">gf180mcuD (9T · 180nm)</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField
              fullWidth size="small" select label="RUN_TO"
              value={runTo} onChange={e => setRunTo(e.target.value)}
              helperText="Halt flow after this stage"
            >
              {['synthesis','sta_pre','floorplan','placement','cts','routing',
                'antenna','sta_post','drc','lvs','signoff'].map(s => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button variant="contained" onClick={save} disabled={busy} startIcon={<Save />}>
          {busy ? 'Saving…' : 'Save design'}
        </Button>
        <Button onClick={() => history.back()}>Cancel</Button>
      </Box>
    </Container>
  );
}
