'use client';

/**
 * Power-report viewer.
 *
 * Renders the per-group breakdown as a stacked horizontal bar (internal /
 * switching / leakage), an SVG donut for the total split, and a sortable
 * per-cell aggregate table built from instance-level data.
 */

import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider,
  TextField, Snackbar, Table, TableBody, TableCell, TableHead, TableRow,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { UploadFile, PlayArrow } from '@mui/icons-material';

import { parsePowerReport, groupByCell, type PowerReport, type PowerGroup } from '@/lib/tools/power';

const SAMPLE = `Group                  Internal     Switching    Leakage      Total       %
--------------------------------------------------------------------------
Sequential             1.23e-3      4.56e-4      7.89e-6      1.69e-3     22.9%
Combinational          5.67e-4      8.91e-4      2.34e-5      1.48e-3     20.0%
Macro                  3.45e-3      6.78e-4      9.01e-5      4.22e-3     57.1%
--------------------------------------------------------------------------
Total                                                          7.39e-3     100.0%

inst_a cell=AND2_X1 Internal=1.2e-4 Switching=3.4e-5 Leakage=7.8e-7 Total=1.6e-4
inst_b cell=AND2_X1 Internal=2.4e-4 Switching=6.8e-5 Leakage=1.2e-6 Total=3.1e-4
inst_c cell=DFF_X1  Internal=4.4e-4 Switching=1.0e-4 Leakage=2.5e-6 Total=5.5e-4
inst_d cell=DFF_X1  Internal=4.6e-4 Switching=1.1e-4 Leakage=2.6e-6 Total=5.7e-4
inst_e cell=BUF_X4  Internal=8.0e-5 Switching=4.0e-5 Leakage=1.0e-6 Total=1.21e-4
`;

const COLORS = {
  internal:  '#3b82f6',
  switching: '#f59e0b',
  leakage:   '#ef4444',
};

export default function PowerPage() {
  const [text, setText] = useState<string>(SAMPLE);
  const [report, setReport] = useState<PowerReport>(() => parsePowerReport(SAMPLE));
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'groups' | 'cells'>('groups');

  const byCell = useMemo(() => groupByCell(report.instances), [report]);

  function parseLocal() {
    setReport(parsePowerReport(text));
    setInfo('Parsed power report');
  }
  async function parseRemote() {
    try {
      const r = await fetch('/api/openroad/power', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stdout: text }),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setReport({
        groups: j.groups,
        instances: j.instances,
        totalPower: j.totalPower,
        totals: j.totals,
        warnings: j.warnings,
      });
      setInfo(`API parsed ${j.groups.length} groups`);
    } catch (e) {
      setError(`API parse failed: ${(e as Error).message}`);
    }
  }
  async function importFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const txt = await f.text();
      setText(txt);
      setReport(parsePowerReport(txt));
      setInfo(`Loaded ${f.name}`);
    } catch (e) {
      setError(`Load failed: ${(e as Error).message}`);
    } finally { ev.target.value = ''; }
  }

  const totalsRow = report.totals;
  const tot = report.totalPower || (totalsRow.internal + totalsRow.switching + totalsRow.leakage);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Paper square sx={{ p: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Typography variant="h6" sx={{ mr: 2 }}>Power report</Typography>
          <Button size="small" component="label" variant="outlined" startIcon={<UploadFile />}>
            Load report
            <input hidden type="file" accept=".rpt,.txt,.log" onChange={importFile} />
          </Button>
          <Button size="small" variant="contained" startIcon={<PlayArrow />} onClick={parseLocal}>Parse</Button>
          <Button size="small" variant="outlined" onClick={parseRemote}>Parse via API</Button>
          <Button size="small" onClick={() => { setText(SAMPLE); setReport(parsePowerReport(SAMPLE)); }}>Demo</Button>

          <Divider orientation="vertical" flexItem />

          <ToggleButtonGroup size="small" exclusive value={tab} onChange={(_, v) => v && setTab(v)}>
            <ToggleButton value="groups">Groups</ToggleButton>
            <ToggleButton value="cells">Per-cell</ToggleButton>
          </ToggleButtonGroup>

          <Box sx={{ flex: 1 }} />
          <Chip size="small" label={`total: ${formatW(tot)}`} />
          <Chip size="small" variant="outlined" sx={{ borderColor: COLORS.internal, color: COLORS.internal }}
                label={`int: ${formatW(totalsRow.internal)}`} />
          <Chip size="small" variant="outlined" sx={{ borderColor: COLORS.switching, color: COLORS.switching }}
                label={`sw: ${formatW(totalsRow.switching)}`} />
          <Chip size="small" variant="outlined" sx={{ borderColor: COLORS.leakage, color: COLORS.leakage }}
                label={`lk: ${formatW(totalsRow.leakage)}`} />
        </Stack>
      </Paper>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: input */}
        <Box sx={{ width: 380, borderRight: '1px solid', borderColor: 'divider', overflowY: 'auto', p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Report text</Typography>
          <TextField
            value={text}
            onChange={(e) => setText(e.target.value)}
            multiline minRows={20} maxRows={40} fullWidth
            slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 11 } } }}
          />
          {report.warnings.length > 0 && (
            <Stack spacing={1} sx={{ mt: 2 }}>
              {report.warnings.map((w, i) => (
                <Alert key={i} severity="warning" variant="outlined">{w}</Alert>
              ))}
            </Stack>
          )}
        </Box>

        {/* Right: visualisations */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 3, minWidth: 0 }}>
          <Stack direction="row" spacing={3} sx={{ mb: 4, alignItems: 'flex-start' }}>
            <Donut totals={totalsRow} total={tot} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>Composition</Typography>
              <Legend />
              <Box sx={{ mt: 2, fontSize: 13, color: 'text.secondary' }}>
                Internal: power dissipated inside cells (short-circuit + transition).<br />
                Switching: load capacitance × V² × activity.<br />
                Leakage: static off-state current.
              </Box>
            </Box>
          </Stack>

          {tab === 'groups' ? (
            <GroupsView groups={report.groups} total={tot} />
          ) : (
            <CellsView byCell={byCell} />
          )}
        </Box>
      </Box>

      {error && <Snackbar open autoHideDuration={6000} onClose={() => setError(null)} message={error} />}
      {info  && <Snackbar open autoHideDuration={3500} onClose={() => setInfo(null)}  message={info} />}
    </Box>
  );
}

// --------------------------------------------------------------------------

function GroupsView({ groups, total }: { groups: PowerGroup[]; total: number }) {
  if (groups.length === 0) return <Alert severity="info">No groups parsed.</Alert>;
  const max = Math.max(...groups.map(g => g.total));
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>Per-group breakdown</Typography>
      <Stack spacing={2}>
        {groups.map(g => (
          <Box key={g.name}>
            <Stack direction="row" alignItems="baseline" sx={{ mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace', flex: 1 }}>{g.name}</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{formatW(g.total)}</Typography>
              {g.percent !== undefined && (
                <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary', fontFamily: 'monospace' }}>
                  {(g.percent * 100).toFixed(1)}%
                </Typography>
              )}
            </Stack>
            <StackedBar
              total={g.total}
              max={max}
              parts={[
                { color: COLORS.internal,  value: g.internal,  label: 'int' },
                { color: COLORS.switching, value: g.switching, label: 'sw' },
                { color: COLORS.leakage,   value: g.leakage,   label: 'lk' },
              ]}
            />
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function CellsView({ byCell }: { byCell: PowerGroup[] }) {
  if (byCell.length === 0) {
    return <Alert severity="info">No per-instance data — re-run with `report_power -instance`.</Alert>;
  }
  const max = byCell[0].total;
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>Per-cell aggregate</Typography>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Cell</TableCell>
              <TableCell align="right">Internal</TableCell>
              <TableCell align="right">Switching</TableCell>
              <TableCell align="right">Leakage</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell align="right">%</TableCell>
              <TableCell sx={{ width: '25%' }}>Bar</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {byCell.map(c => (
              <TableRow key={c.name}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{c.name}</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{formatW(c.internal)}</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{formatW(c.switching)}</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{formatW(c.leakage)}</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{formatW(c.total)}</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                  {c.percent !== undefined ? `${(c.percent * 100).toFixed(1)}%` : '—'}
                </TableCell>
                <TableCell>
                  <StackedBar
                    total={c.total} max={max}
                    parts={[
                      { color: COLORS.internal,  value: c.internal },
                      { color: COLORS.switching, value: c.switching },
                      { color: COLORS.leakage,   value: c.leakage },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}

function StackedBar({ parts, total, max }: { parts: { color: string; value: number; label?: string }[]; total: number; max: number }) {
  const widthPct = max > 0 ? (total / max) * 100 : 0;
  return (
    <Box sx={{ display: 'flex', height: 14, width: `${widthPct}%`, minWidth: 12, borderRadius: 0.5, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
      {parts.map((p, i) => {
        const w = total > 0 ? (p.value / total) * 100 : 0;
        return <Box key={i} sx={{ width: `${w}%`, bgcolor: p.color }} title={`${p.label ?? ''}: ${formatW(p.value)}`} />;
      })}
    </Box>
  );
}

function Legend() {
  return (
    <Stack direction="row" spacing={2}>
      <LegendItem color={COLORS.internal}  label="Internal" />
      <LegendItem color={COLORS.switching} label="Switching" />
      <LegendItem color={COLORS.leakage}   label="Leakage" />
    </Stack>
  );
}
function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Box sx={{ width: 12, height: 12, bgcolor: color, borderRadius: 0.5 }} />
      <Typography variant="caption">{label}</Typography>
    </Stack>
  );
}

function Donut({ totals, total }: { totals: { internal: number; switching: number; leakage: number }; total: number }) {
  const r = 70, R = 100, cx = 110, cy = 110;
  const segs = [
    { v: totals.internal, color: COLORS.internal },
    { v: totals.switching, color: COLORS.switching },
    { v: totals.leakage, color: COLORS.leakage },
  ];
  const sum = segs.reduce((s, x) => s + x.v, 0) || 1;
  let acc = 0;
  const paths = segs.map((s, i) => {
    const a0 = (acc / sum) * Math.PI * 2 - Math.PI / 2;
    acc += s.v;
    const a1 = (acc / sum) * Math.PI * 2 - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
    const xi0 = cx + r * Math.cos(a0), yi0 = cy + r * Math.sin(a0);
    const xi1 = cx + r * Math.cos(a1), yi1 = cy + r * Math.sin(a1);
    return (
      <path key={i}
        d={`M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${r} ${r} 0 ${large} 0 ${xi0} ${yi0} Z`}
        fill={s.color} stroke="#fff" strokeWidth={1} />
    );
  });
  return (
    <svg width={220} height={220}>
      {paths}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={14} fontWeight={600}>{formatW(total)}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill="#64748b">total</text>
    </svg>
  );
}

function formatW(w: number): string {
  if (w === 0) return '0 W';
  const a = Math.abs(w);
  if (a >= 1)       return `${w.toFixed(3)} W`;
  if (a >= 1e-3)    return `${(w * 1e3).toFixed(3)} mW`;
  if (a >= 1e-6)    return `${(w * 1e6).toFixed(3)} µW`;
  return `${(w * 1e9).toFixed(3)} nW`;
}
