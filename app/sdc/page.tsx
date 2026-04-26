'use client';

/**
 * SDC editor / visualizer.
 *
 * Paste SDC text, see structured tables of clocks / IO delays / exceptions,
 * edit clock periods inline, and re-emit the canonical SDC.
 */

import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider,
  TextField, Snackbar, Table, TableBody, TableCell, TableHead, TableRow,
  IconButton,
} from '@mui/material';
import { ContentCopy, PlayArrow, Add, Delete } from '@mui/icons-material';

import { parseSdc, type SdcConstraints, type Clock } from '@/lib/parsers/sdc';
import { emitSdc, summariseSdc } from '@/lib/tools/sdc_writer';

const SAMPLE = `# example design constraints
create_clock -name clk      -period 10 -waveform { 0 5 } [get_ports clk]
create_clock -name clk_div  -period 20 [get_ports clk_div]
create_generated_clock -name clk_gen -divide_by 2 -source clk [get_pins div/Q]

set_input_delay  -clock clk -max 2.5 [get_ports d_in]
set_input_delay  -clock clk -min 0.4 [get_ports d_in]
set_output_delay -clock clk -max 1.0 [get_ports q_out]

set_false_path -from {reg_a/Q} -to {reg_b/D}
set_multicycle_path -setup 2 -from {a/CK} -to {b/D}
set_max_delay 1.5 -from {x} -to {y}
set_clock_groups -asynchronous -group { clk } -group { clk_div }
set_clock_uncertainty -setup 0.1
`;

export default function SdcPage() {
  const [text, setText] = useState<string>(SAMPLE);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const constraints: SdcConstraints = useMemo(() => parseSdc(text), [text]);
  const summary = useMemo(() => summariseSdc(constraints), [constraints]);
  const [editClocks, setEditClocks] = useState<Clock[] | null>(null);

  // Effective clocks = edited (if any) else parsed.
  const clocks = editClocks ?? constraints.clocks;

  function applyEdits() {
    if (!editClocks) return;
    const next: SdcConstraints = { ...constraints, clocks: editClocks };
    setText(emitSdc(next));
    setEditClocks(null);
    setInfo('Applied clock edits');
  }

  function setClockField(i: number, patch: Partial<Clock>) {
    const base = editClocks ?? [...constraints.clocks];
    const updated = base.map((c, idx) => idx === i ? { ...c, ...patch } : c);
    setEditClocks(updated);
  }

  function addClock() {
    const base = editClocks ?? [...constraints.clocks];
    setEditClocks([
      ...base,
      { name: `clk${base.length + 1}`, period: 10, source: null, waveform: [0, 5] },
    ]);
  }

  function removeClock(i: number) {
    const base = editClocks ?? [...constraints.clocks];
    setEditClocks(base.filter((_, idx) => idx !== i));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(emitSdc(constraints));
      setInfo('SDC copied');
    } catch { setError('Clipboard write failed'); }
  }

  async function callApi() {
    try {
      const r = await fetch('/api/sdc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sdc: text }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setInfo(`API: ${j.summary.clocks} clocks, Fmax ${j.summary.fmaxMHz?.toFixed(1) ?? '—'} MHz`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap">
        <Typography variant="h4">SDC Editor</Typography>
        <Chip label={`clocks: ${summary.clocks}`} />
        <Chip label={`gen: ${summary.generatedClocks}`} />
        <Chip label={`IO: ${summary.ioDelays}`} />
        <Chip label={`false: ${summary.falsePaths}`} />
        <Chip label={`MCP: ${summary.multicyclePaths}`} />
        <Chip label={`max/min: ${summary.maxMinDelays}`} />
        <Chip
          label={`Fmax: ${summary.fmaxMHz?.toFixed(1) ?? '—'} MHz`}
          color={summary.fmaxMHz != null ? 'primary' : 'default'}
        />
        {summary.warnings > 0 && (
          <Chip label={`warn: ${summary.warnings}`} color="warning" />
        )}
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="subtitle1">Source</Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" startIcon={<PlayArrow />} onClick={callApi}>API</Button>
              <Button size="small" startIcon={<ContentCopy />} onClick={copy}>Copy</Button>
            </Stack>
          </Stack>
          <TextField
            multiline minRows={14} maxRows={28} fullWidth
            value={text}
            onChange={e => { setText(e.target.value); setEditClocks(null); }}
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
          />
        </Paper>

        <Paper sx={{ p: 2, flex: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="subtitle1">Clocks</Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" startIcon={<Add />} onClick={addClock}>Add</Button>
              {editClocks && (
                <Button size="small" variant="contained" onClick={applyEdits}>
                  Apply edits
                </Button>
              )}
            </Stack>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell align="right">Period (ns)</TableCell>
                <TableCell align="right">Freq (MHz)</TableCell>
                <TableCell>Source</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {clocks.map((c, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <TextField size="small" value={c.name}
                      onChange={e => setClockField(i, { name: e.target.value })} />
                  </TableCell>
                  <TableCell align="right">
                    <TextField size="small" type="number"
                      value={c.period}
                      onChange={e => setClockField(i, { period: Number(e.target.value) })}
                      sx={{ width: 90 }} />
                  </TableCell>
                  <TableCell align="right">
                    {c.period > 0 ? (1000 / c.period).toFixed(1) : '—'}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {c.source ?? '—'}
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => removeClock(i)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Stack>

      <Divider sx={{ my: 3 }} />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle1" mb={1}>IO delays</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Kind</TableCell>
                <TableCell>Clock</TableCell>
                <TableCell align="right">Delay (ns)</TableCell>
                <TableCell>min/max</TableCell>
                <TableCell>Ports</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {constraints.ioDelays.map((d, i) => (
                <TableRow key={i}>
                  <TableCell>{d.kind}</TableCell>
                  <TableCell>{d.clock}</TableCell>
                  <TableCell align="right">{d.delay}</TableCell>
                  <TableCell>
                    {d.max && 'max '} {d.min && 'min'}
                    {!d.min && !d.max && 'both'}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {d.ports}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle1" mb={1}>Exceptions</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>From</TableCell>
                <TableCell>To</TableCell>
                <TableCell align="right">Detail</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {constraints.falsePaths.map((f, i) => (
                <TableRow key={`fp${i}`}>
                  <TableCell>
                    <Chip size="small" label="false" color="warning" />
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{f.from ?? '—'}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{f.to ?? '—'}</TableCell>
                  <TableCell align="right">
                    {f.setupOnly && 'setup'}{f.holdOnly && 'hold'}
                  </TableCell>
                </TableRow>
              ))}
              {constraints.multicyclePaths.map((m, i) => (
                <TableRow key={`mcp${i}`}>
                  <TableCell>
                    <Chip size="small" label="MCP" color="info" />
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{m.from ?? '—'}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{m.to ?? '—'}</TableCell>
                  <TableCell align="right">{m.cycles} cyc</TableCell>
                </TableRow>
              ))}
              {constraints.maxMinDelays.map((d, i) => (
                <TableRow key={`mmd${i}`}>
                  <TableCell>
                    <Chip size="small" label={d.kind} />
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{d.from ?? '—'}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{d.to ?? '—'}</TableCell>
                  <TableCell align="right">{d.delay} ns</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Stack>

      {constraints.warnings.length > 0 && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Typography variant="subtitle1" mb={1}>Warnings</Typography>
          {constraints.warnings.map((w, i) => (
            <Alert key={i} severity="warning" sx={{ mb: 0.5 }}>{w}</Alert>
          ))}
        </Paper>
      )}

      <Snackbar open={!!info} autoHideDuration={3000} onClose={() => setInfo(null)} message={info ?? ''} />
      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Box>
  );
}
