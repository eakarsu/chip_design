'use client';

/**
 * OpenROAD step composer.
 *
 * Build a list of TCL steps from a palette, configure each step's args,
 * preview the generated TCL, run the flow (real binary or fallback), and
 * see parsed metrics. Closes the gap from Round-2 #7 where the new step
 * kinds were callable only programmatically.
 */

import { useMemo, useState } from 'react';
import {
  Container, Stack, Box, Paper, Typography, Button, IconButton, TextField,
  Tooltip, Chip, Divider, MenuItem, Select, Alert, Checkbox,
  FormControlLabel, Tab, Tabs, Switch,
} from '@mui/material';
import {
  Add, Delete, ArrowUpward, ArrowDownward, PlayArrow, Refresh,
} from '@mui/icons-material';
import type { OpenROADStep } from '@/lib/tools/openroad';

// All step kinds the composer can produce. Mirrors `OpenROADStep` exactly.
const STEP_KINDS = [
  'read_lef', 'read_def', 'read_liberty',
  'initialize_floorplan', 'pin_placement', 'tapcell',
  'pdngen', 'add_global_connection',
  'global_placement', 'detailed_placement',
  'macro_placement',
  'clock_tree_synthesis', 'repair_design', 'repair_timing',
  'global_route', 'detailed_route',
  'check_antennas', 'repair_antennas',
  'report_power', 'report_wirelength', 'report_design_area',
  'report_checks', 'report_clock_skew',
  'write_def', 'write_gds',
  'raw_tcl',
] as const;

type StepKind = typeof STEP_KINDS[number];

interface ComposerStep {
  /** Stable id so React reorders cleanly. */
  id: string;
  step: OpenROADStep;
}

function freshStep(kind: StepKind): OpenROADStep {
  switch (kind) {
    case 'read_lef':     return { kind, path: '' };
    case 'read_def':     return { kind, path: '' };
    case 'read_liberty': return { kind, path: '' };
    case 'global_placement':     return { kind, density: 0.7 };
    case 'detailed_placement':   return { kind };
    case 'global_route':         return { kind };
    case 'detailed_route':       return { kind };
    case 'write_def':            return { kind, path: '/tmp/out.def' };
    case 'write_gds':            return { kind, path: '/tmp/out.gds' };
    case 'report_power':         return { kind };
    case 'report_wirelength':    return { kind };
    case 'report_design_area':   return { kind };
    case 'report_clock_skew':    return { kind };
    case 'report_checks':        return { kind, pathCount: 5, pathDelay: 'max' };
    case 'clock_tree_synthesis': return { kind };
    case 'repair_timing':        return { kind, mode: 'both' };
    case 'repair_design':        return { kind };
    case 'pin_placement':        return { kind, horLayers: ['M3'], verLayers: ['M2'] };
    case 'add_global_connection':return { kind, net: 'VDD', pinPattern: '^VDD$', power: true };
    case 'initialize_floorplan': return { kind, utilization: 0.7, aspectRatio: 1, coreSpace: 2 };
    case 'pdngen':               return { kind };
    case 'tapcell':              return { kind, distance: 14 };
    case 'macro_placement':      return { kind, halo: [5, 5], channel: [10, 10] };
    case 'check_antennas':       return { kind };
    case 'repair_antennas':      return { kind, iterations: 5 };
    case 'raw_tcl':              return { kind, tcl: '' };
  }
}

interface RunReport {
  ranReal: boolean;
  metrics: Record<string, number>;
  tcl: string;
  stdoutTail: string;
  stderrTail: string;
  exitCode: number | null;
}

let nextId = 1;
const newId = () => `s${nextId++}`;

export default function OpenROADComposerPage() {
  const [steps, setSteps] = useState<ComposerStep[]>(() => [
    { id: newId(), step: freshStep('initialize_floorplan') },
    { id: newId(), step: freshStep('global_placement') },
    { id: newId(), step: freshStep('detailed_placement') },
    { id: newId(), step: freshStep('clock_tree_synthesis') },
    { id: newId(), step: freshStep('global_route') },
    { id: newId(), step: freshStep('report_design_area') },
    { id: newId(), step: freshStep('report_power') },
  ]);
  // Default off: if the binary is on PATH we want real metrics. The fallback
  // still runs automatically when the binary is missing.
  const [forceFallback, setForceFallback] = useState(false);
  const [lef, setLef] = useState('');
  const [def, setDef] = useState('');
  const [report, setReport] = useState<RunReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'metrics' | 'tcl' | 'stdout'>('metrics');

  const tclPreview = useMemo(() => previewTcl(steps), [steps]);

  function addStep(kind: StepKind) {
    setSteps(prev => [...prev, { id: newId(), step: freshStep(kind) }]);
  }
  function removeStep(id: string) {
    setSteps(prev => prev.filter(s => s.id !== id));
  }
  function moveStep(id: string, dir: -1 | 1) {
    setSteps(prev => {
      const i = prev.findIndex(s => s.id === id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function patchStep(id: string, patch: Partial<OpenROADStep>) {
    setSteps(prev =>
      prev.map(s => (s.id === id ? { id: s.id, step: { ...s.step, ...patch } as OpenROADStep } : s)),
    );
  }

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/openroad/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps: steps.map(s => s.step),
          lefContent: lef || undefined,
          defContent: def || undefined,
          forceFallback,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? 'unknown failure');
        return;
      }
      setReport({
        ranReal: data.ranReal,
        metrics: data.metrics ?? {},
        tcl: data.tcl ?? '',
        stdoutTail: data.stdoutTail ?? '',
        stderrTail: data.stderrTail ?? '',
        exitCode: data.exitCode ?? null,
      });
      setTab('metrics');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Container maxWidth={false} sx={{ py: 2, height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">OpenROAD step composer</Typography>
        <Box sx={{ flex: 1 }} />
        <FormControlLabel
          control={<Switch size="small" checked={forceFallback} onChange={(_, v) => setForceFallback(v)} />}
          label="Force fallback"
          title="Skip looking for the OpenROAD binary; always use the in-repo JS algorithms."
        />
        <Button
          variant="contained" size="small" startIcon={<PlayArrow />}
          onClick={run} disabled={running || steps.length === 0}
        >
          {running ? 'Running…' : 'Run flow'}
        </Button>
      </Stack>

      <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
        {/* Left — palette */}
        <Paper sx={{ width: 220, p: 1.5, overflowY: 'auto' }}>
          <Typography variant="overline">Add step</Typography>
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            {STEP_KINDS.map(k => (
              <Button
                key={k} size="small" variant="text" startIcon={<Add />}
                onClick={() => addStep(k)}
                sx={{ justifyContent: 'flex-start', textTransform: 'none', fontFamily: 'monospace' }}
              >
                {k}
              </Button>
            ))}
          </Stack>
        </Paper>

        {/* Middle — step list */}
        <Paper sx={{ flex: 1, p: 1.5, overflowY: 'auto', minWidth: 0 }}>
          <Typography variant="overline">Pipeline ({steps.length} steps)</Typography>
          {steps.length === 0 && (
            <Alert severity="info" sx={{ mt: 1 }}>Pick steps from the palette →</Alert>
          )}
          <Stack spacing={1} sx={{ mt: 1 }}>
            {steps.map((s, i) => (
              <StepRow
                key={s.id}
                index={i}
                step={s.step}
                onUp={() => moveStep(s.id, -1)}
                onDown={() => moveStep(s.id, +1)}
                onRemove={() => removeStep(s.id)}
                onPatch={(p) => patchStep(s.id, p)}
              />
            ))}
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Typography variant="overline">Inputs (optional)</Typography>
          <TextField
            multiline minRows={3} fullWidth size="small"
            label="LEF content (paste)"
            value={lef} onChange={(e) => setLef(e.target.value)}
            sx={{ mt: 1, '& textarea': { fontFamily: 'monospace', fontSize: 11 } }}
          />
          <TextField
            multiline minRows={3} fullWidth size="small"
            label="DEF content (paste)"
            value={def} onChange={(e) => setDef(e.target.value)}
            sx={{ mt: 1, '& textarea': { fontFamily: 'monospace', fontSize: 11 } }}
          />
        </Paper>

        {/* Right — preview / report */}
        <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab value="metrics" label={`Metrics${report ? ` (${Object.keys(report.metrics).length})` : ''}`} />
            <Tab value="tcl"     label="TCL preview" />
            <Tab value="stdout"  label="Stdout / stderr" />
          </Tabs>
          <Divider />
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {tab === 'metrics' && (
              report ? <MetricsTable report={report} /> : (
                <Typography variant="body2" color="text.secondary">
                  Run the flow to see metrics. The composer will use the OpenROAD binary
                  if available, otherwise the in-repo JS algorithms.
                </Typography>
              )
            )}
            {tab === 'tcl' && (
              <Box component="pre" sx={{
                fontFamily: 'monospace', fontSize: 12, m: 0,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {report?.tcl ?? tclPreview}
              </Box>
            )}
            {tab === 'stdout' && (
              report ? (
                <>
                  <Typography variant="overline">stdout</Typography>
                  <Box component="pre" sx={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                    {report.stdoutTail || '(empty)'}
                  </Box>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="overline">stderr</Typography>
                  <Box component="pre" sx={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                    {report.stderrTail || '(empty)'}
                  </Box>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Run the flow to see process output.
                </Typography>
              )
            )}
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}

// --- Step-config row -----------------------------------------------------

function StepRow({
  index, step, onUp, onDown, onRemove, onPatch,
}: {
  index: number;
  step: OpenROADStep;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  onPatch: (p: Partial<OpenROADStep>) => void;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Chip size="small" label={`#${index + 1}`} />
        <Typography sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{step.kind}</Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Move up"><span><IconButton size="small" onClick={onUp}><ArrowUpward fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title="Move down"><span><IconButton size="small" onClick={onDown}><ArrowDownward fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title="Remove"><span><IconButton size="small" onClick={onRemove}><Delete fontSize="small" /></IconButton></span></Tooltip>
      </Stack>
      <StepArgs step={step} onPatch={onPatch} />
    </Paper>
  );
}

/** Per-kind small arg form. Keep it minimal — we only expose the fields
 *  defined in `OpenROADStep`. Anything more advanced uses raw_tcl. */
function StepArgs({ step, onPatch }: { step: OpenROADStep; onPatch: (p: Partial<OpenROADStep>) => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (k: string, v: any) => onPatch({ [k]: v } as any);

  switch (step.kind) {
    case 'read_lef': case 'read_def': case 'read_liberty':
    case 'write_def': case 'write_gds':
      return (
        <TextField
          size="small" fullWidth label="path"
          value={(step as { path: string }).path}
          onChange={(e) => p('path', e.target.value)}
        />
      );
    case 'global_placement':
      return (
        <TextField
          size="small" type="number" label="density (0–1)"
          value={step.density ?? 0.7}
          onChange={(e) => p('density', Number(e.target.value))}
        />
      );
    case 'initialize_floorplan':
      return (
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <TextField size="small" type="number" label="utilization" value={step.utilization ?? ''}
            onChange={(e) => p('utilization', e.target.value === '' ? undefined : Number(e.target.value))} />
          <TextField size="small" type="number" label="aspect_ratio" value={step.aspectRatio ?? ''}
            onChange={(e) => p('aspectRatio', e.target.value === '' ? undefined : Number(e.target.value))} />
          <TextField size="small" type="number" label="core_space" value={step.coreSpace ?? ''}
            onChange={(e) => p('coreSpace', e.target.value === '' ? undefined : Number(e.target.value))} />
          <TextField size="small" label="site" value={step.site ?? ''}
            onChange={(e) => p('site', e.target.value || undefined)} />
        </Stack>
      );
    case 'tapcell':
      return (
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <TextField size="small" type="number" label="distance" value={step.distance ?? ''}
            onChange={(e) => p('distance', e.target.value === '' ? undefined : Number(e.target.value))} />
          <TextField size="small" label="tapcell_master" value={step.tapcellMaster ?? ''}
            onChange={(e) => p('tapcellMaster', e.target.value || undefined)} />
          <TextField size="small" label="endcap_master" value={step.endcapMaster ?? ''}
            onChange={(e) => p('endcapMaster', e.target.value || undefined)} />
        </Stack>
      );
    case 'pdngen':
      return (
        <TextField size="small" fullWidth label="config file (optional)"
          value={step.configFile ?? ''}
          onChange={(e) => p('configFile', e.target.value || undefined)} />
      );
    case 'pin_placement':
      return (
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <TextField size="small" label="hor layers (space-sep)"
            value={(step.horLayers ?? []).join(' ')}
            onChange={(e) => p('horLayers', e.target.value.split(/\s+/).filter(Boolean))} />
          <TextField size="small" label="ver layers (space-sep)"
            value={(step.verLayers ?? []).join(' ')}
            onChange={(e) => p('verLayers', e.target.value.split(/\s+/).filter(Boolean))} />
        </Stack>
      );
    case 'add_global_connection':
      return (
        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
          <TextField size="small" label="net" value={step.net}
            onChange={(e) => p('net', e.target.value)} />
          <TextField size="small" label="pin_pattern" value={step.pinPattern}
            onChange={(e) => p('pinPattern', e.target.value)} />
          <FormControlLabel control={
            <Checkbox size="small" checked={!!step.power}
              onChange={(_, v) => p('power', v)} />
          } label="power" />
          <FormControlLabel control={
            <Checkbox size="small" checked={!!step.ground}
              onChange={(_, v) => p('ground', v)} />
          } label="ground" />
        </Stack>
      );
    case 'macro_placement':
      return (
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <TextField size="small" label="halo (x y)"
            value={(step.halo ?? []).join(' ')}
            onChange={(e) => {
              const ns = e.target.value.split(/\s+/).map(Number).filter(n => !Number.isNaN(n));
              p('halo', ns.length === 2 ? [ns[0], ns[1]] : undefined);
            }} />
          <TextField size="small" label="channel (x y)"
            value={(step.channel ?? []).join(' ')}
            onChange={(e) => {
              const ns = e.target.value.split(/\s+/).map(Number).filter(n => !Number.isNaN(n));
              p('channel', ns.length === 2 ? [ns[0], ns[1]] : undefined);
            }} />
        </Stack>
      );
    case 'clock_tree_synthesis':
      return (
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <TextField size="small" label="buf_list (space-sep)"
            value={(step.bufferList ?? []).join(' ')}
            onChange={(e) => p('bufferList', e.target.value.split(/\s+/).filter(Boolean))} />
          <TextField size="small" label="root_buf" value={step.rootBuffer ?? ''}
            onChange={(e) => p('rootBuffer', e.target.value || undefined)} />
          <TextField size="small" label="clk_net" value={step.clockNet ?? ''}
            onChange={(e) => p('clockNet', e.target.value || undefined)} />
        </Stack>
      );
    case 'repair_timing':
      return (
        <Stack direction="row" spacing={1} alignItems="center">
          <Select size="small" value={step.mode ?? 'both'}
            onChange={(e) => p('mode', e.target.value as 'setup' | 'hold' | 'both')}>
            <MenuItem value="both">both</MenuItem>
            <MenuItem value="setup">setup</MenuItem>
            <MenuItem value="hold">hold</MenuItem>
          </Select>
          <TextField size="small" type="number" label="slack_margin"
            value={step.slackMargin ?? ''}
            onChange={(e) => p('slackMargin', e.target.value === '' ? undefined : Number(e.target.value))} />
        </Stack>
      );
    case 'repair_design':
      return (
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <TextField size="small" type="number" label="max_wire_length" value={step.maxWireLength ?? ''}
            onChange={(e) => p('maxWireLength', e.target.value === '' ? undefined : Number(e.target.value))} />
          <TextField size="small" type="number" label="slew_margin" value={step.slewMargin ?? ''}
            onChange={(e) => p('slewMargin', e.target.value === '' ? undefined : Number(e.target.value))} />
          <TextField size="small" type="number" label="cap_margin" value={step.capMargin ?? ''}
            onChange={(e) => p('capMargin', e.target.value === '' ? undefined : Number(e.target.value))} />
        </Stack>
      );
    case 'report_checks':
      return (
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField size="small" type="number" label="path_count" value={step.pathCount ?? ''}
            onChange={(e) => p('pathCount', e.target.value === '' ? undefined : Number(e.target.value))} />
          <Select size="small" value={step.pathDelay ?? 'max'}
            onChange={(e) => p('pathDelay', e.target.value as 'min' | 'max' | 'min_max')}>
            <MenuItem value="max">max</MenuItem>
            <MenuItem value="min">min</MenuItem>
            <MenuItem value="min_max">min_max</MenuItem>
          </Select>
        </Stack>
      );
    case 'check_antennas':
      return (
        <TextField size="small" fullWidth label="report_file" value={step.reportFile ?? ''}
          onChange={(e) => p('reportFile', e.target.value || undefined)} />
      );
    case 'repair_antennas':
      return (
        <Stack direction="row" spacing={1}>
          <TextField size="small" type="number" label="iterations" value={step.iterations ?? ''}
            onChange={(e) => p('iterations', e.target.value === '' ? undefined : Number(e.target.value))} />
          <TextField size="small" type="number" label="ratio_margin" value={step.ratioMargin ?? ''}
            onChange={(e) => p('ratioMargin', e.target.value === '' ? undefined : Number(e.target.value))} />
        </Stack>
      );
    case 'raw_tcl':
      return (
        <TextField multiline minRows={3} fullWidth label="raw TCL"
          value={step.tcl}
          onChange={(e) => p('tcl', e.target.value)}
          sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 12 } }} />
      );
    default:
      return (
        <Typography variant="caption" color="text.secondary">
          (no configurable arguments)
        </Typography>
      );
  }
}

function MetricsTable({ report }: { report: RunReport }) {
  const entries = Object.entries(report.metrics).sort(([a], [b]) => a.localeCompare(b));
  return (
    <>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
        <Chip size="small" color={report.ranReal ? 'success' : 'warning'}
          label={report.ranReal ? 'real OpenROAD' : 'fallback (JS)'} />
        {report.exitCode !== null && (
          <Chip size="small" variant="outlined" label={`exit=${report.exitCode}`} />
        )}
      </Stack>
      {entries.length === 0 ? (
        <Alert severity="warning">
          <strong>No metrics extracted.</strong>
          {!report.ranReal && (
            <>
              {' '}The fallback runs in JS without OpenROAD. To get useful numbers from the
              fallback, paste a LEF + DEF in the boxes below the step list — the synthetic
              estimator derives <code>design_area</code>, <code>cts_*</code>, <code>repair_*</code>,
              <code>pdn_*</code>, and others from the floorplan dimensions and instance count.
              For real metrics, install OpenROAD on PATH and turn off &quot;Force fallback&quot;.
            </>
          )}
        </Alert>
      ) : (
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          rowGap: 0.5, columnGap: 2,
        }}>
          {entries.map(([k, v]) => (
            <Box key={k} sx={{ display: 'contents' }}>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 13 }}>{k}</Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 13, textAlign: 'right' }}>
                {Number.isFinite(v) ? v : String(v)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </>
  );
}

/** Local TCL preview — the same shape `stepsToTcl` would produce, but
 *  built client-side so we don't require a server round-trip. */
function previewTcl(steps: ComposerStep[]): string {
  // We can't import stepsToTcl directly into a client component because
  // the wrapper file pulls in node:fs. Re-implement a minimal preview.
  const out: string[] = [];
  for (const s of steps) {
    const x = s.step;
    switch (x.kind) {
      case 'read_lef':            out.push(`read_lef ${JSON.stringify(x.path)}`); break;
      case 'read_def':            out.push(`read_def ${JSON.stringify(x.path)}`); break;
      case 'read_liberty':        out.push(`read_liberty ${JSON.stringify(x.path)}`); break;
      case 'global_placement':    out.push(`global_placement -density ${x.density ?? 0.7}`); break;
      case 'detailed_placement':  out.push('detailed_placement'); break;
      case 'global_route':        out.push('global_route'); break;
      case 'detailed_route':      out.push('detailed_route'); break;
      case 'write_def':           out.push(`write_def ${JSON.stringify(x.path)}`); break;
      case 'write_gds':           out.push(`write_gds ${JSON.stringify(x.path)}`); break;
      case 'report_power':        out.push('report_power'); break;
      case 'report_wirelength':   out.push('report_wirelength'); break;
      case 'report_design_area':  out.push('report_design_area'); break;
      case 'report_clock_skew':   out.push('report_clock_skew'); break;
      case 'report_checks': {
        const a: string[] = [];
        if (x.pathCount) a.push(`-path_count ${x.pathCount}`);
        if (x.pathDelay) a.push(`-path_delay ${x.pathDelay}`);
        out.push(`report_checks ${a.join(' ')}`.trim());
        break;
      }
      case 'clock_tree_synthesis': {
        const a: string[] = [];
        if (x.bufferList?.length) a.push(`-buf_list {${x.bufferList.join(' ')}}`);
        if (x.rootBuffer)         a.push(`-root_buf ${x.rootBuffer}`);
        if (x.clockNet)           a.push(`-clk_nets {${x.clockNet}}`);
        out.push(`clock_tree_synthesis ${a.join(' ')}`.trim());
        break;
      }
      case 'repair_timing': {
        const m = x.mode ?? 'both';
        const sm = x.slackMargin != null ? ` -slack_margin ${x.slackMargin}` : '';
        if (m === 'both') {
          out.push(`repair_timing -setup${sm}`);
          out.push(`repair_timing -hold${sm}`);
        } else out.push(`repair_timing -${m}${sm}`);
        break;
      }
      case 'repair_design': {
        const a: string[] = [];
        if (x.maxWireLength != null) a.push(`-max_wire_length ${x.maxWireLength}`);
        if (x.slewMargin != null)    a.push(`-slew_margin ${x.slewMargin}`);
        if (x.capMargin != null)     a.push(`-cap_margin ${x.capMargin}`);
        out.push(`repair_design ${a.join(' ')}`.trim());
        break;
      }
      case 'pin_placement': {
        const a: string[] = [];
        if (x.horLayers?.length) a.push(`-hor_layers {${x.horLayers.join(' ')}}`);
        if (x.verLayers?.length) a.push(`-ver_layers {${x.verLayers.join(' ')}}`);
        out.push(`place_pins ${a.join(' ')}`.trim());
        break;
      }
      case 'add_global_connection': {
        const a = [`-net ${x.net}`, `-pin_pattern ${JSON.stringify(x.pinPattern)}`];
        if (x.power) a.push('-power');
        if (x.ground) a.push('-ground');
        out.push(`add_global_connection ${a.join(' ')}`);
        break;
      }
      case 'initialize_floorplan': {
        const a: string[] = [];
        if (x.utilization != null)  a.push(`-utilization ${x.utilization}`);
        if (x.aspectRatio != null)  a.push(`-aspect_ratio ${x.aspectRatio}`);
        if (x.coreSpace != null)    a.push(`-core_space ${x.coreSpace}`);
        if (x.site)                  a.push(`-site ${x.site}`);
        out.push(`initialize_floorplan ${a.join(' ')}`.trim());
        break;
      }
      case 'pdngen':
        out.push(x.configFile ? `pdngen ${JSON.stringify(x.configFile)}` : 'pdngen');
        break;
      case 'tapcell': {
        const a: string[] = [];
        if (x.distance != null) a.push(`-distance ${x.distance}`);
        if (x.tapcellMaster) a.push(`-tapcell_master ${x.tapcellMaster}`);
        if (x.endcapMaster)  a.push(`-endcap_master ${x.endcapMaster}`);
        out.push(`tapcell ${a.join(' ')}`.trim());
        break;
      }
      case 'macro_placement': {
        const a: string[] = [];
        if (x.halo)    a.push(`-halo {${x.halo.join(' ')}}`);
        if (x.channel) a.push(`-channel {${x.channel.join(' ')}}`);
        out.push(`macro_placement ${a.join(' ')}`.trim());
        break;
      }
      case 'check_antennas':
        out.push(x.reportFile ? `check_antennas -report_file ${JSON.stringify(x.reportFile)}` : 'check_antennas');
        break;
      case 'repair_antennas': {
        const a: string[] = [];
        if (x.iterations != null)  a.push(`-iterations ${x.iterations}`);
        if (x.ratioMargin != null) a.push(`-ratio_margin ${x.ratioMargin}`);
        out.push(`repair_antennas ${a.join(' ')}`.trim());
        break;
      }
      case 'raw_tcl': out.push(x.tcl); break;
    }
  }
  out.push('exit');
  return out.join('\n') + '\n';
}
