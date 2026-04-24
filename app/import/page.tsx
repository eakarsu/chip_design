'use client';

import { useState } from 'react';
import {
  Box, Container, Typography, Paper, Button, Alert, CircularProgress,
  TextField, Chip, Grid, Tabs, Tab,
} from '@mui/material';
import { CloudUpload, PlayArrow } from '@mui/icons-material';

const SAMPLE_DEF = `VERSION 5.8 ;
DIVIDERCHAR "/" ;
BUSBITCHARS "[]" ;
DESIGN top ;
UNITS DISTANCE MICRONS 1000 ;
DIEAREA ( 0 0 ) ( 100000 100000 ) ;
COMPONENTS 2 ;
  - u0 AND2 + PLACED ( 1000 1000 ) N ;
  - u1 BUF  + PLACED ( 4000 1000 ) N ;
END COMPONENTS
PINS 2 ;
  - in1 + NET in1 + DIRECTION INPUT  + USE SIGNAL ;
  - out + NET y   + DIRECTION OUTPUT + USE SIGNAL ;
END PINS
NETS 2 ;
  - n0 ( PIN in1 ) ( u0 A ) ;
  - y  ( u1 Y ) ( PIN out ) ;
END NETS
END DESIGN
`;

interface ImportResult {
  summary: { cells: number; nets: number; terminalCount: number };
  runtimeMs: number;
  design: { cells: any[]; nets: any[]; terminalCount: number };
}

const SAMPLE_NODES = `UCLA nodes 1.0
NumNodes : 4
NumTerminals : 1
  c0  20  20
  c1  20  20
  c2  20  20
  pad0  10  10  terminal
`;
const SAMPLE_NETS = `UCLA nets 1.0
NumNets : 3
NumPins : 6
NetDegree : 2 n0
  c0 O : 10 5
  c1 I : 0 5
NetDegree : 2 n1
  c1 O : 10 5
  c2 I : 0 5
NetDegree : 2 n2
  pad0 O
  c0 I
`;
const SAMPLE_PL = `UCLA pl 1.0
  c0 0 0
  c1 30 0
  c2 60 0
  pad0 0 30 : N /FIXED
`;

export default function ImportPage() {
  const [tab, setTab] = useState<'bookshelf' | 'def'>('bookshelf');
  const [nodes, setNodes] = useState(SAMPLE_NODES);
  const [nets,  setNets]  = useState(SAMPLE_NETS);
  const [pl,    setPl]    = useState(SAMPLE_PL);
  const [defText, setDefText] = useState(SAMPLE_DEF);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);
  const [imp,  setImp]  = useState<ImportResult | null>(null);
  const [flowBusy, setFlowBusy] = useState(false);
  const [flow, setFlow] = useState<any | null>(null);

  const readFile = (setter: (s: string) => void) =>
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) setter(await f.text());
    };

  const importIt = async () => {
    setBusy(true); setErr(null); setImp(null); setFlow(null);
    try {
      const r = tab === 'bookshelf'
        ? await fetch('/api/import/bookshelf', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodes, nets, pl }),
          })
        : await fetch('/api/import/def', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ def: defText }),
          });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? 'Import failed');
      // Normalize response shapes (DEF has no terminalCount field).
      const normalized: ImportResult = {
        runtimeMs: j.runtimeMs,
        summary: {
          cells: j.summary.cells,
          nets:  j.summary.nets,
          terminalCount: j.summary.terminalCount ?? j.summary.ioCount ?? 0,
        },
        design: j.design,
      };
      setImp(normalized);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runFlow = async () => {
    if (!imp) return;
    setFlowBusy(true); setErr(null); setFlow(null);
    try {
      const r = await fetch('/api/flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cellCount: imp.summary.cells,
          netCount:  imp.summary.nets,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? 'Flow failed');
      setFlow(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFlowBusy(false);
    }
  };

  const fileField = (
    label: string, value: string,
    setter: (s: string) => void, rows = 8,
  ) => (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>{label}</Typography>
        <Button component="label" size="small" startIcon={<CloudUpload />}>
          Load file
          <input type="file" hidden onChange={readFile(setter)} />
        </Button>
      </Box>
      <TextField
        multiline rows={rows} fullWidth size="small"
        value={value} onChange={e => setter(e.target.value)}
        InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }}
      />
    </Box>
  );

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        Bookshelf Import
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Paste or upload an ISPD-style design (.nodes, .nets, optional .pl).
        After import you can immediately run the full RTL→GDS flow on it.
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Bookshelf" value="bookshelf" />
        <Tab label="DEF" value="def" />
      </Tabs>

      {tab === 'bookshelf' ? (
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2 }}>{fileField('.nodes', nodes, setNodes)}</Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2 }}>{fileField('.nets', nets, setNets)}</Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2 }}>{fileField('.pl (optional)', pl, setPl)}</Paper>
          </Grid>
        </Grid>
      ) : (
        <Paper sx={{ p: 2 }}>{fileField('.def', defText, setDefText, 18)}</Paper>
      )}

      <Box sx={{ display: 'flex', gap: 2, my: 3 }}>
        <Button
          variant="contained" onClick={importIt} disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CloudUpload />}
        >
          {busy ? 'Parsing…' : 'Parse'}
        </Button>
        <Button
          variant="outlined" onClick={runFlow} disabled={!imp || flowBusy}
          startIcon={flowBusy ? <CircularProgress size={16} /> : <PlayArrow />}
        >
          {flowBusy ? 'Running flow…' : 'Run RTL→GDS Flow'}
        </Button>
      </Box>

      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      {imp && (
        <Paper sx={{ p: 3, mb: 2 }}>
          <Typography variant="h6" gutterBottom>Imported</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip label={`cells: ${imp.summary.cells}`} />
            <Chip label={`nets: ${imp.summary.nets}`} />
            <Chip label={`terminals: ${imp.summary.terminalCount}`} color="primary" />
            <Chip label={`${imp.runtimeMs.toFixed(1)} ms`} variant="outlined" />
          </Box>
        </Paper>
      )}

      {flow && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Flow result</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <Chip
              label={flow.success ? 'all stages ok' : 'stages failed'}
              color={flow.success ? 'success' : 'warning'}
            />
            <Chip label={`${flow.totalRuntimeMs?.toFixed?.(1) ?? flow.totalRuntimeMs} ms`} variant="outlined" />
            <Chip label={`${flow.stages?.length ?? 0} stages`} />
          </Box>
          <Box component="pre" sx={{
            fontSize: 12, p: 1, m: 0, bgcolor: 'action.hover', borderRadius: 1,
            maxHeight: 360, overflow: 'auto',
          }}>
            {JSON.stringify(flow.stages, null, 2)}
          </Box>
        </Paper>
      )}
    </Container>
  );
}
