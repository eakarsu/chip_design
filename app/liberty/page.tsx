'use client';

/**
 * Liberty cell browser.
 *
 * Paste Liberty source, see a sortable cell catalogue (area, leakage,
 * pin counts, timing arcs), and drill into a cell to inspect every pin.
 */

import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider,
  TextField, Snackbar, Table, TableBody, TableCell, TableHead, TableRow,
  TableSortLabel,
} from '@mui/material';
import { PlayArrow } from '@mui/icons-material';

import {
  parseLiberty, summariseLiberty,
  type LibertyLibrary, type LibertyCell,
} from '@/lib/parsers/liberty';

const SAMPLE = `library (demo_hd) {
  technology : "cmos" ;
  delay_model : table_lookup ;
  cell (AND2_X1) {
    area : 4.32 ;
    cell_leakage_power : 1.2e-9 ;
    pin (A) { direction : input ; capacitance : 0.0023 ; }
    pin (B) { direction : input ; capacitance : 0.0021 ; }
    pin (Y) {
      direction : output ;
      function : "(A & B)" ;
      timing () { related_pin : "A" ; }
      timing () { related_pin : "B" ; }
    }
  }
  cell (NAND2_X1) {
    area : 3.84 ;
    cell_leakage_power : 0.9e-9 ;
    pin (A) { direction : input ; capacitance : 0.0019 ; }
    pin (B) { direction : input ; capacitance : 0.0019 ; }
    pin (Y) {
      direction : output ;
      function : "!(A & B)" ;
      timing () { related_pin : "A" ; }
      timing () { related_pin : "B" ; }
    }
  }
  cell (DFF_X1) {
    area : 9.85 ;
    cell_leakage_power : 5.0e-9 ;
    pin (CLK) { direction : input ; capacitance : 0.0050 ; }
    pin (D)   { direction : input ; capacitance : 0.0030 ; }
    pin (Q)   { direction : output ;
      timing () { related_pin : "CLK" ; }
    }
  }
  cell (BUF_X4) {
    area : 5.10 ;
    cell_leakage_power : 1.6e-9 ;
    pin (A) { direction : input ; capacitance : 0.0080 ; }
    pin (Y) {
      direction : output ;
      function : "A" ;
      timing () { related_pin : "A" ; }
    }
  }
}
`;

type SortKey = 'name' | 'area' | 'leakage' | 'pins' | 'arcs';

export default function LibertyPage() {
  const [text, setText] = useState<string>(SAMPLE);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });

  const library: LibertyLibrary = useMemo(() => parseLiberty(text), [text]);
  const summary = useMemo(() => summariseLiberty(library), [library]);

  const sortedCells = useMemo(() => {
    const arr = [...library.cells];
    arr.sort((a, b) => cmp(a, b, sort.key) * (sort.dir === 'asc' ? 1 : -1));
    return arr;
  }, [library, sort]);

  const sel = library.cells.find(c => c.name === selected) ?? library.cells[0];

  function setSortKey(key: SortKey) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }

  async function callApi() {
    try {
      const r = await fetch('/api/liberty', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: text }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setInfo(`API: ${j.summary.cellCount} cells, ${j.summary.pinCount} pins`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap">
        <Typography variant="h4">Liberty Browser</Typography>
        <Chip label={`cells: ${summary.cellCount}`} />
        <Chip label={`pins: ${summary.pinCount}`} />
        <Chip label={`arcs: ${summary.arcCount}`} />
        {summary.area && (
          <Chip label={`area μ=${summary.area.mean.toFixed(2)}`} />
        )}
        {summary.leakage && (
          <Chip label={`leak μ=${summary.leakage.mean.toExponential(2)}`} />
        )}
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, width: { xs: '100%', md: 360 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="subtitle1">Source</Typography>
            <Button size="small" startIcon={<PlayArrow />} onClick={callApi}>API</Button>
          </Stack>
          <TextField
            multiline minRows={14} maxRows={28} fullWidth
            value={text}
            onChange={e => setText(e.target.value)}
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 11 } }}
          />
          {library.warnings.length > 0 && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {library.warnings.length} warning(s)
            </Alert>
          )}
        </Paper>

        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle1" mb={1}>Cells</Typography>
          {library.cells.length === 0 ? (
            <Alert severity="info">No cells parsed.</Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    <TableSortLabel active={sort.key === 'name'}
                      direction={sort.dir} onClick={() => setSortKey('name')}>
                      Cell
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel active={sort.key === 'area'}
                      direction={sort.dir} onClick={() => setSortKey('area')}>
                      Area
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel active={sort.key === 'leakage'}
                      direction={sort.dir} onClick={() => setSortKey('leakage')}>
                      Leakage
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel active={sort.key === 'pins'}
                      direction={sort.dir} onClick={() => setSortKey('pins')}>
                      Pins
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel active={sort.key === 'arcs'}
                      direction={sort.dir} onClick={() => setSortKey('arcs')}>
                      Arcs
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedCells.map(c => (
                  <TableRow key={c.name} hover
                    onClick={() => setSelected(c.name)}
                    selected={sel?.name === c.name}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ fontFamily: 'monospace' }}>{c.name}</TableCell>
                    <TableCell align="right">{c.area?.toFixed(2) ?? '—'}</TableCell>
                    <TableCell align="right">
                      {c.leakage != null ? c.leakage.toExponential(2) : '—'}
                    </TableCell>
                    <TableCell align="right">{c.pins.length}</TableCell>
                    <TableCell align="right">{c.totalArcs}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      </Stack>

      <Divider sx={{ my: 3 }} />

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" mb={1}>
          Pins {sel ? <code>({sel.name})</code> : ''}
        </Typography>
        {!sel ? (
          <Alert severity="info">Select a cell.</Alert>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Pin</TableCell>
                <TableCell>Dir</TableCell>
                <TableCell align="right">Cap</TableCell>
                <TableCell align="right">Arcs</TableCell>
                <TableCell>Function</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sel.pins.map((p, i) => (
                <TableRow key={i}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{p.name}</TableCell>
                  <TableCell>
                    <Chip size="small" label={p.direction}
                      color={p.direction === 'output' ? 'primary' : 'default'} />
                  </TableCell>
                  <TableCell align="right">
                    {p.capacitance != null ? p.capacitance.toExponential(2) : '—'}
                  </TableCell>
                  <TableCell align="right">{p.timingArcs}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {p.func ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Snackbar open={!!info} autoHideDuration={3000} onClose={() => setInfo(null)} message={info ?? ''} />
      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Box>
  );
}

function cmp(a: LibertyCell, b: LibertyCell, key: SortKey): number {
  switch (key) {
    case 'name':    return a.name.localeCompare(b.name);
    case 'area':    return (a.area ?? 0) - (b.area ?? 0);
    case 'leakage': return (a.leakage ?? 0) - (b.leakage ?? 0);
    case 'pins':    return a.pins.length - b.pins.length;
    case 'arcs':    return a.totalArcs - b.totalArcs;
  }
}
