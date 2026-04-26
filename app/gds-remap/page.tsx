'use client';

/**
 * GDS layer-remap editor.
 *
 * Paste a GdsLibrary JSON, edit a remap table (rule rows + JSON), preview
 * the histogram before/after, and copy out the remapped library JSON.
 */

import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider,
  TextField, Snackbar, Table, TableBody, TableCell, TableHead, TableRow,
  IconButton, MenuItem, Select,
} from '@mui/material';
import { Add, Delete, ContentCopy } from '@mui/icons-material';

import {
  remapLibrary, layerHistogram, parseRemapTable,
  type RemapRule, type RemapTable,
} from '@/lib/tools/gds_remap';
import type { GdsLibrary } from '@/lib/gds/types';

const SAMPLE_LIB: GdsLibrary = {
  libname: 'DEMO',
  version: 600,
  units: { userPerDb: 1e-3, metersPerDb: 1e-9 },
  structures: [{
    name: 'TOP',
    elements: [
      { type: 'boundary', layer: 1, datatype: 0, points: [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10},{x:0,y:0}] },
      { type: 'boundary', layer: 1, datatype: 1, points: [{x:0,y:0},{x:5,y:0},{x:5,y:5},{x:0,y:5},{x:0,y:0}] },
      { type: 'path',     layer: 2, datatype: 0, pathtype: 0, width: 100, points: [{x:0,y:0},{x:5,y:0}] },
      { type: 'path',     layer: 3, datatype: 0, pathtype: 0, width: 200, points: [{x:0,y:0},{x:8,y:0}] },
      { type: 'text',     layer: 9, texttype: 0, origin: { x: 0, y: 0 }, string: 'A' },
    ],
  }],
};

const DEFAULT_RULES: RemapRule[] = [
  { fromLayer: 1, fromDatatype: 0, toLayer: 10, toDatatype: 0, label: 'metal1 → met1' },
  { fromLayer: 2, fromDatatype: '*', toLayer: 20, toDatatype: 0, label: 'metal2 → met2' },
  { fromLayer: 9, fromDatatype: 0, toLayer: null, label: 'drop labels' },
];

export default function GdsRemapPage() {
  const [libText, setLibText] = useState<string>(JSON.stringify(SAMPLE_LIB, null, 2));
  const [rules, setRules] = useState<RemapRule[]>(DEFAULT_RULES);
  const [dropUnmapped, setDropUnmapped] = useState<boolean>(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lib = useMemo(() => {
    try { return JSON.parse(libText) as GdsLibrary; }
    catch { return null; }
  }, [libText]);

  const table: RemapTable = { rules, dropUnmapped };

  const before = useMemo(() => lib ? layerHistogram(lib) : [], [lib]);
  const result = useMemo(() => {
    if (!lib) return null;
    try { return remapLibrary(lib, table); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return null; }
  }, [lib, table]);
  const after = useMemo(
    () => result ? layerHistogram(result.lib) : [],
    [result],
  );

  function updateRule(i: number, patch: Partial<RemapRule>) {
    setRules(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function addRule() {
    setRules(rs => [...rs, { fromLayer: 0, fromDatatype: 0, toLayer: 0, toDatatype: 0 }]);
  }
  function removeRule(i: number) {
    setRules(rs => rs.filter((_, idx) => idx !== i));
  }

  async function callApi() {
    if (!lib) return;
    try {
      // Validate the table by round-tripping through parseRemapTable.
      parseRemapTable(table);
      const r = await fetch('/api/gds/remap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lib, table }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await r.json();
      setInfo('Server remap OK');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.lib, null, 2));
      setInfo('Remapped library copied');
    } catch { setError('Clipboard write failed'); }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <Typography variant="h4">GDS Layer Remap</Typography>
        {result && (
          <>
            <Chip label={`total: ${result.report.total}`} />
            <Chip label={`unmapped: ${result.report.unmapped}`}
              color={result.report.unmapped > 0 ? 'warning' : 'default'} />
            <Chip label={`dropped: ${result.report.dropped}`}
              color={result.report.dropped > 0 ? 'error' : 'default'} />
          </>
        )}
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle1" mb={1}>Library JSON</Typography>
          <TextField
            multiline minRows={14} maxRows={24} fullWidth
            value={libText}
            onChange={e => setLibText(e.target.value)}
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 11 } }}
          />
          {!lib && <Alert severity="error" sx={{ mt: 1 }}>Invalid JSON</Alert>}
        </Paper>

        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle1" mb={1}>Remap rules</Typography>
          <Stack direction="row" spacing={1} mb={1}>
            <Button size="small" startIcon={<Add />} onClick={addRule}>Add rule</Button>
            <Button
              size="small"
              variant={dropUnmapped ? 'contained' : 'outlined'}
              onClick={() => setDropUnmapped(d => !d)}
            >
              dropUnmapped: {dropUnmapped ? 'on' : 'off'}
            </Button>
            <Button size="small" variant="outlined" onClick={callApi}>Validate via API</Button>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>fromLayer</TableCell>
                <TableCell>fromDT</TableCell>
                <TableCell>toLayer</TableCell>
                <TableCell>toDT</TableCell>
                <TableCell>hits</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <TextField size="small" type="number" value={r.fromLayer}
                      onChange={e => updateRule(i, { fromLayer: Number(e.target.value) })}
                      sx={{ width: 70 }} />
                  </TableCell>
                  <TableCell>
                    <Select size="small" sx={{ width: 70 }}
                      value={r.fromDatatype === '*' ? 'any' : 'num'}
                      onChange={e => updateRule(i, {
                        fromDatatype: e.target.value === 'any' ? '*' : 0,
                      })}
                    >
                      <MenuItem value="num">#</MenuItem>
                      <MenuItem value="any">*</MenuItem>
                    </Select>
                    {r.fromDatatype !== '*' && (
                      <TextField size="small" type="number" value={r.fromDatatype}
                        onChange={e => updateRule(i, { fromDatatype: Number(e.target.value) })}
                        sx={{ width: 60, ml: 0.5 }} />
                    )}
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      placeholder="null=drop"
                      value={r.toLayer === null ? '' : r.toLayer}
                      onChange={e => updateRule(i, {
                        toLayer: e.target.value === '' ? null : Number(e.target.value),
                      })}
                      sx={{ width: 80 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" type="number"
                      value={r.toDatatype ?? 0}
                      disabled={r.toLayer === null}
                      onChange={e => updateRule(i, { toDatatype: Number(e.target.value) })}
                      sx={{ width: 60 }} />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={result?.report.hits[i] ?? 0}
                      color={(result?.report.hits[i] ?? 0) > 0 ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => removeRule(i)}>
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
          <Typography variant="subtitle1" mb={1}>Before</Typography>
          <HistTable rows={before} />
        </Paper>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="subtitle1">After</Typography>
            <Button size="small" startIcon={<ContentCopy />} onClick={copyResult}>Copy lib</Button>
          </Stack>
          <HistTable rows={after} />
        </Paper>
      </Stack>

      <Snackbar
        open={!!info}
        autoHideDuration={3000}
        onClose={() => setInfo(null)}
        message={info ?? ''}
      />
      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={() => setError(null)}
      >
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Box>
  );
}

function HistTable({ rows }: { rows: { layer: number; datatype: number; count: number }[] }) {
  if (rows.length === 0) return <Alert severity="info">no data</Alert>;
  const max = Math.max(...rows.map(r => r.count));
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Layer</TableCell>
          <TableCell>DT</TableCell>
          <TableCell align="right">Count</TableCell>
          <TableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell>{r.layer}</TableCell>
            <TableCell>{r.datatype}</TableCell>
            <TableCell align="right">{r.count}</TableCell>
            <TableCell sx={{ width: '40%' }}>
              <Box sx={{
                height: 8,
                width: `${(r.count / max) * 100}%`,
                bgcolor: '#3b82f6',
                borderRadius: 1,
              }} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
