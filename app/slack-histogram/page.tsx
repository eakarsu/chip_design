'use client';

/**
 * Slack-histogram viewer.
 *
 * Bins path slacks (parsed from a pasted OpenSTA report_checks dump or a
 * raw list of slack values) and renders the distribution as a coloured bar
 * chart — violation / critical / clean bands — alongside WNS/TNS counters.
 */

import { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider,
  TextField, Snackbar, Table, TableBody, TableCell, TableHead, TableRow,
  Slider, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { PlayArrow } from '@mui/icons-material';

import { parseTimingPaths, type TimingPath } from '@/lib/tools/openroad';
import {
  binSlacks, formatSlack, type SlackHistogram, type SlackBand,
} from '@/lib/tools/slack_hist';

const SAMPLE = `Startpoint: reg_a/CLK (rising edge-triggered flip-flop clocked by clk)
Endpoint: reg_b/D (rising edge-triggered flip-flop clocked by clk)
Path Group: clk
Path Type: max
   0.42   data arrival time
   0.50   data required time
   0.08   slack (MET)

Startpoint: reg_c/CLK
Endpoint: reg_d/D
Path Group: clk
Path Type: max
   0.66   data arrival time
   0.50   data required time
  -0.16   slack (VIOLATED)

Startpoint: reg_e/CLK
Endpoint: reg_f/D
Path Group: clk
Path Type: max
   0.30   data arrival time
   0.50   data required time
   0.20   slack (MET)
`;

const BAND_COLOR: Record<SlackBand, string> = {
  violation: '#ef4444',
  critical:  '#f59e0b',
  clean:     '#22c55e',
};

export default function SlackHistogramPage() {
  const [text, setText] = useState<string>(SAMPLE);
  const [paths, setPaths] = useState<TimingPath[]>(() => parseTimingPaths(SAMPLE));
  const [bins, setBinCount] = useState<number>(20);
  const [mode, setMode] = useState<'parse' | 'manual'>('parse');
  const [manual, setManual] = useState<string>('-0.3, -0.1, 0, 0.05, 0.1, 0.2, 0.5, 1.0, 1.5');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const slackInput: number[] | TimingPath[] = useMemo(() => {
    if (mode === 'manual') {
      return manual
        .split(/[,\s]+/)
        .map(s => Number(s))
        .filter(Number.isFinite);
    }
    return paths;
  }, [mode, manual, paths]);

  const hist: SlackHistogram = useMemo(
    () => binSlacks(slackInput as never, { bins }),
    [slackInput, bins],
  );

  function parseLocal() {
    const p = parseTimingPaths(text);
    setPaths(p);
    setInfo(`Parsed ${p.length} timing path(s)`);
  }
  async function parseRemote() {
    try {
      const r = await fetch('/api/timing/histogram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stdout: text, bins }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await r.json();
      // Server confirms; re-parse locally so we own the TimingPath list too.
      setPaths(parseTimingPaths(text));
      setInfo('Server-side bin OK');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const maxCount = Math.max(1, ...hist.bins.map(b => b.count));

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <Typography variant="h4">Slack Histogram</Typography>
        <Chip label={`paths: ${hist.total}`} />
        <Chip
          label={`WNS ${formatSlack(hist.wns)}`}
          color={hist.wns < 0 ? 'error' : 'success'}
        />
        <Chip
          label={`TNS ${formatSlack(hist.tns)}`}
          color={hist.tns < 0 ? 'error' : 'success'}
        />
      </Stack>

      <Stack direction="row" spacing={1} mb={2}>
        <Chip
          label={`violated: ${hist.violated}`}
          sx={{ bgcolor: BAND_COLOR.violation, color: 'white' }}
        />
        <Chip
          label={`critical: ${hist.critical}`}
          sx={{ bgcolor: BAND_COLOR.critical, color: 'white' }}
        />
        <Chip
          label={`clean: ${hist.clean}`}
          sx={{ bgcolor: BAND_COLOR.clean, color: 'white' }}
        />
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={mode}
              onChange={(_, v) => v && setMode(v)}
            >
              <ToggleButton value="parse">Parse stdout</ToggleButton>
              <ToggleButton value="manual">Manual slacks</ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ width: 220 }}>
              <Typography variant="caption">bins: {bins}</Typography>
              <Slider
                size="small"
                min={4}
                max={64}
                value={bins}
                onChange={(_, v) => setBinCount(v as number)}
              />
            </Box>
          </Stack>

          {mode === 'parse' ? (
            <>
              <TextField
                multiline
                minRows={8}
                fullWidth
                value={text}
                onChange={e => setText(e.target.value)}
                inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
              />
              <Stack direction="row" spacing={1} mt={1}>
                <Button variant="contained" startIcon={<PlayArrow />} onClick={parseLocal}>
                  Parse locally
                </Button>
                <Button variant="outlined" onClick={parseRemote}>
                  Bin via API
                </Button>
              </Stack>
            </>
          ) : (
            <TextField
              multiline
              minRows={4}
              fullWidth
              value={manual}
              onChange={e => setManual(e.target.value)}
              helperText="Comma- or space-separated slack values in ns."
              inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
            />
          )}
        </Paper>

        <Paper sx={{ p: 2, flex: 1.4 }}>
          <Typography variant="subtitle1" mb={1}>Distribution</Typography>
          {hist.bins.length === 0 ? (
            <Alert severity="info">No data yet — parse a report or enter slacks.</Alert>
          ) : (
            <Box sx={{ position: 'relative' }}>
              <svg width="100%" height={260} viewBox={`0 0 ${hist.bins.length * 28} 260`}>
                {hist.bins.map((b, i) => {
                  const h = (b.count / maxCount) * 220;
                  const x = i * 28 + 4;
                  const y = 240 - h;
                  return (
                    <g key={i}>
                      <rect
                        x={x}
                        y={y}
                        width={20}
                        height={h}
                        fill={BAND_COLOR[b.band]}
                        opacity={b.count === 0 ? 0.15 : 1}
                      >
                        <title>
                          {`[${formatSlack(b.lo)}, ${formatSlack(b.hi)})  count=${b.count}  band=${b.band}`}
                        </title>
                      </rect>
                      {b.count > 0 && (
                        <text
                          x={x + 10}
                          y={y - 2}
                          textAnchor="middle"
                          fontSize={9}
                          fill="#444"
                        >
                          {b.count}
                        </text>
                      )}
                    </g>
                  );
                })}
                {/* zero-slack reference line */}
                {(() => {
                  if (hist.bins.length === 0) return null;
                  const lo = hist.bins[0].lo;
                  const hi = hist.bins[hist.bins.length - 1].hi;
                  if (lo > 0 || hi < 0) return null;
                  const totalW = hist.bins.length * 28;
                  const xZero = ((0 - lo) / (hi - lo)) * totalW;
                  return (
                    <line
                      x1={xZero}
                      x2={xZero}
                      y1={10}
                      y2={240}
                      stroke="#0f172a"
                      strokeDasharray="4 3"
                    />
                  );
                })()}
                <line x1={0} x2={hist.bins.length * 28} y1={240} y2={240} stroke="#94a3b8" />
              </svg>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption">{formatSlack(hist.bins[0].lo)}</Typography>
                <Typography variant="caption">slack →</Typography>
                <Typography variant="caption">
                  {formatSlack(hist.bins[hist.bins.length - 1].hi)}
                </Typography>
              </Stack>
            </Box>
          )}
        </Paper>
      </Stack>

      <Divider sx={{ my: 3 }} />

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" mb={1}>Worst paths</Typography>
        {paths.length === 0 ? (
          <Alert severity="info">Parse an STA report to populate this list.</Alert>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Endpoint</TableCell>
                <TableCell>Group</TableCell>
                <TableCell align="right">Arrival</TableCell>
                <TableCell align="right">Required</TableCell>
                <TableCell align="right">Slack</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...paths]
                .sort((a, b) => a.slack - b.slack)
                .slice(0, 10)
                .map((p, i) => (
                  <TableRow key={i}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {p.endpoint}
                    </TableCell>
                    <TableCell>{p.pathGroup ?? '—'}</TableCell>
                    <TableCell align="right">{formatSlack(p.arrival)}</TableCell>
                    <TableCell align="right">{formatSlack(p.required)}</TableCell>
                    <TableCell align="right">{formatSlack(p.slack)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={p.status}
                        color={p.status === 'MET' ? 'success' : 'error'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </Paper>

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
