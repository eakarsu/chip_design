'use client';

import { useState } from 'react';
import {
  Box, Container, Typography, Paper, Button, TextField, Alert,
  CircularProgress, Tabs, Tab, Table, TableHead, TableBody, TableRow, TableCell,
  Chip, IconButton, Collapse,
} from '@mui/material';
import { CloudUpload, ExpandMore, ExpandLess, PlayArrow } from '@mui/icons-material';

const SAMPLE_LEF = `VERSION 5.8 ;
BUSBITCHARS "[]" ;
DIVIDERCHAR "/" ;
UNITS
  DATABASE MICRONS 1000 ;
END UNITS

SITE core
  CLASS CORE ;
  SIZE 0.2 BY 1.4 ;
END core

LAYER M1
  TYPE ROUTING ;
  DIRECTION HORIZONTAL ;
  PITCH 0.2 ;
  WIDTH 0.07 ;
  SPACING 0.07 ;
END M1

MACRO AND2
  CLASS CORE ;
  SIZE 0.6 BY 1.4 ;
  SITE core ;
  PIN A   DIRECTION INPUT  ; USE SIGNAL ; PORT LAYER M1 ; RECT 0.0 0.4 0.1 0.6 ; END END A
  PIN B   DIRECTION INPUT  ; USE SIGNAL ; PORT LAYER M1 ; RECT 0.0 0.8 0.1 1.0 ; END END B
  PIN Y   DIRECTION OUTPUT ; USE SIGNAL ; PORT LAYER M1 ; RECT 0.5 0.6 0.6 0.8 ; END END Y
  PIN VDD DIRECTION INOUT  ; USE POWER  ; PORT LAYER M1 ; RECT 0.0 1.3 0.6 1.4 ; END END VDD
  PIN VSS DIRECTION INOUT  ; USE GROUND ; PORT LAYER M1 ; RECT 0.0 0.0 0.6 0.1 ; END END VSS
END AND2

MACRO BUF
  CLASS CORE ;
  SIZE 0.4 BY 1.4 ;
  SITE core ;
  PIN A DIRECTION INPUT  ; USE SIGNAL ; PORT LAYER M1 ; RECT 0.0 0.6 0.1 0.8 ; END END A
  PIN Y DIRECTION OUTPUT ; USE SIGNAL ; PORT LAYER M1 ; RECT 0.3 0.6 0.4 0.8 ; END END Y
END BUF

END LIBRARY
`;

interface MacroSummary {
  name: string;
  class: string | null;
  width: number;
  height: number;
  site: string | null;
  pinCount: number;
  pins?: { name: string; direction: string; use: string; portLayers: string[] }[];
}

export default function LibraryPage() {
  const [text, setText] = useState(SAMPLE_LEF);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resp, setResp] = useState<any | null>(null);
  const [tab, setTab] = useState<'macros' | 'sites' | 'layers' | 'warnings'>('macros');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setText(await f.text());
  };

  const parse = async () => {
    setBusy(true); setErr(null); setResp(null);
    try {
      const r = await fetch('/api/lef?detail=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lef: text }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? 'Parse failed');
      setResp(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        Cell Library Browser (LEF)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Parse a LEF library and inspect its sites, routing layers, and standard
        cell macros — the geometric source of truth that placement and routing
        consume.
      </Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>.lef text</Typography>
          <Button component="label" size="small" startIcon={<CloudUpload />}>
            Load file
            <input type="file" hidden onChange={upload} />
          </Button>
          <Button
            variant="contained" size="small" onClick={parse} disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
          >
            {busy ? 'Parsing…' : 'Parse'}
          </Button>
        </Box>
        <TextField
          multiline rows={10} fullWidth size="small"
          value={text} onChange={e => setText(e.target.value)}
          InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }}
        />
      </Paper>

      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      {resp && (
        <>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {resp.version && <Chip label={`LEF ${resp.version}`} variant="outlined" />}
            {resp.unitsDbuPerMicron && <Chip label={`${resp.unitsDbuPerMicron} DBU/µm`} variant="outlined" />}
            <Chip label={`${resp.counts.macros} macros`} color="primary" />
            <Chip label={`${resp.counts.layers} layers`} />
            <Chip label={`${resp.counts.sites} sites`} />
            {resp.counts.warnings > 0 && (
              <Chip label={`${resp.counts.warnings} warnings`} color="warning" />
            )}
          </Box>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
            <Tab label={`Macros (${resp.counts.macros})`} value="macros" />
            <Tab label={`Sites (${resp.counts.sites})`} value="sites" />
            <Tab label={`Layers (${resp.counts.layers})`} value="layers" />
            <Tab label={`Warnings (${resp.counts.warnings})`} value="warnings" />
          </Tabs>

          {tab === 'macros' && (
            <Paper>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={32} />
                    <TableCell>Name</TableCell>
                    <TableCell>Class</TableCell>
                    <TableCell>Site</TableCell>
                    <TableCell align="right">Width</TableCell>
                    <TableCell align="right">Height</TableCell>
                    <TableCell align="right">Pins</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {resp.macros.map((m: MacroSummary) => (
                    <>
                      <TableRow key={m.name} hover>
                        <TableCell>
                          <IconButton size="small"
                            onClick={() => setOpen(o => ({ ...o, [m.name]: !o[m.name] }))}
                          >
                            {open[m.name] ? <ExpandLess /> : <ExpandMore />}
                          </IconButton>
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{m.name}</TableCell>
                        <TableCell>{m.class ?? '—'}</TableCell>
                        <TableCell>{m.site ?? '—'}</TableCell>
                        <TableCell align="right">{m.width.toFixed(3)}</TableCell>
                        <TableCell align="right">{m.height.toFixed(3)}</TableCell>
                        <TableCell align="right">{m.pinCount}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={7} sx={{ py: 0, border: 0 }}>
                          <Collapse in={!!open[m.name]}>
                            <Box sx={{ p: 2 }}>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Pin</TableCell>
                                    <TableCell>Direction</TableCell>
                                    <TableCell>Use</TableCell>
                                    <TableCell>Layers</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {(m.pins ?? []).map(p => (
                                    <TableRow key={p.name}>
                                      <TableCell sx={{ fontFamily: 'monospace' }}>{p.name}</TableCell>
                                      <TableCell>{p.direction}</TableCell>
                                      <TableCell>{p.use}</TableCell>
                                      <TableCell>{p.portLayers.join(', ') || '—'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          {tab === 'sites' && (
            <Paper>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Class</TableCell>
                    <TableCell align="right">Width</TableCell>
                    <TableCell align="right">Height</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {resp.sites.map((s: any) => (
                    <TableRow key={s.name}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{s.name}</TableCell>
                      <TableCell>{s.class ?? '—'}</TableCell>
                      <TableCell align="right">{s.width}</TableCell>
                      <TableCell align="right">{s.height}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          {tab === 'layers' && (
            <Paper>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Direction</TableCell>
                    <TableCell align="right">Pitch</TableCell>
                    <TableCell align="right">Width</TableCell>
                    <TableCell align="right">Spacing</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {resp.layers.map((l: any) => (
                    <TableRow key={l.name}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{l.name}</TableCell>
                      <TableCell>{l.type}</TableCell>
                      <TableCell>{l.direction ?? '—'}</TableCell>
                      <TableCell align="right">{l.pitch ?? '—'}</TableCell>
                      <TableCell align="right">{l.width ?? '—'}</TableCell>
                      <TableCell align="right">{l.spacing ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          {tab === 'warnings' && (
            <Paper sx={{ p: 2 }}>
              {resp.warnings.length === 0
                ? <Typography color="success.main">No warnings.</Typography>
                : resp.warnings.map((w: string, i: number) => (
                    <Alert key={i} severity="warning" sx={{ mb: 1 }}>{w}</Alert>
                  ))}
            </Paper>
          )}
        </>
      )}
    </Container>
  );
}
