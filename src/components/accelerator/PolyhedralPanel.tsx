'use client';

/**
 * Polyhedral tab: POST /api/accelerator/polyhedral for an affine loop nest.
 *
 * The response is a model-based exploration: schedules, dependence vectors,
 * legal loop orders, and a Pareto front over (L2 traffic, working set) with the
 * memory model documented in the response notes. It is not a measurement.
 */
import { useState, type ChangeEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import GridOnIcon from '@mui/icons-material/GridOn';
import type { PolyhedralResponse, PolyhedralSchedule } from './types';
import { apiPost } from './api';
import { ChipList, CodeBlock, EmptyNotice, NotesAlerts } from './ui';
import { formatBytes, formatNumber } from './utils';

interface LoopRow {
  name: string;
  lower: string;
  upper: string;
  step: string;
}

interface TermRow {
  kind: 'constant' | 'loop';
  constant: string;
  loop: string;
  coeff: string;
  offset: string;
}

interface AccessRow {
  array: string;
  kind: 'read' | 'write';
  terms: TermRow[];
}

const MAX_LOOPS = 5;
const MAX_ACCESSES = 8;
const MAX_INDEX_DIMS = 4;

const INITIAL_LOOPS: LoopRow[] = [{ name: 'i', lower: '0', upper: '64', step: '1' }];

function loopTerm(loop: string): TermRow {
  return { kind: 'loop', constant: '0', loop, coeff: '1', offset: '0' };
}

const INITIAL_ACCESSES: AccessRow[] = [{ array: 'A', kind: 'read', terms: [loopTerm('i')] }];

interface AdvancedForm {
  elementBytes: string;
  lineBytes: string;
  fastMemoryBytes: string;
  opsPerIteration: string;
  maxCandidates: string;
}

const DEFAULT_ADVANCED: AdvancedForm = {
  elementBytes: '4',
  lineBytes: '64',
  fastMemoryBytes: '32768',
  opsPerIteration: '2',
  maxCandidates: '96',
};

function optionalInteger(text: string, what: string, min: number, max: number): { value?: number; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: '' };
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < min || value > max) {
    return { error: `${what} must be an integer between ${min} and ${max}.` };
  }
  return { value, error: '' };
}

function buildBody(
  loops: LoopRow[],
  accesses: AccessRow[],
  advanced: AdvancedForm,
): { body?: Record<string, unknown>; error: string } {
  const loopNames: string[] = [];
  const loopBody: Array<Record<string, number | string>> = [];
  for (const [index, loop] of loops.entries()) {
    const name = loop.name.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return { error: `Loop ${index + 1} needs an identifier name.` };
    }
    if (loopNames.includes(name)) return { error: `Loop name "${name}" is used twice.` };
    const lower = optionalInteger(loop.lower, `Loop "${name}" lower bound`, 0, 4096);
    const upper = optionalInteger(loop.upper, `Loop "${name}" upper bound`, 1, 4096);
    const step = optionalInteger(loop.step, `Loop "${name}" step`, 1, 64);
    const invalid = [lower, upper, step].find((entry) => entry.error);
    if (invalid) return { error: invalid.error };
    if (lower.value === undefined || upper.value === undefined) {
      return { error: `Loop "${name}" needs integer lower and upper bounds.` };
    }
    if (upper.value <= lower.value) return { error: `Loop "${name}" needs upper > lower.` };
    loopNames.push(name);
    loopBody.push({
      name,
      lower: lower.value,
      upper: upper.value,
      ...(step.value !== undefined ? { step: step.value } : {}),
    });
  }

  const accessBody: Array<Record<string, unknown>> = [];
  for (const [index, access] of accesses.entries()) {
    const array = access.array.trim();
    if (!array) return { error: `Access ${index + 1} needs an array name.` };
    if (array.length > 32) return { error: `Access ${index + 1} array name is longer than 32 characters.` };
    if (access.terms.length === 0) return { error: `Access ${index + 1} needs at least one index term.` };
    const indices: Array<number | Record<string, unknown>> = [];
    for (const [termIndex, term] of access.terms.entries()) {
      if (term.kind === 'constant') {
        const constant = optionalInteger(term.constant, `Access "${array}" index ${termIndex + 1} constant`, -4096, 4096);
        if (constant.error || constant.value === undefined) {
          return { error: constant.error || `Access "${array}" index ${termIndex + 1} needs a constant.` };
        }
        indices.push(constant.value);
      } else {
        const loopName = term.loop.trim();
        if (!loopNames.includes(loopName)) {
          return { error: `Access "${array}" index ${termIndex + 1} refers to unknown loop "${loopName}".` };
        }
        const coeff = optionalInteger(term.coeff, `Access "${array}" coeff`, -64, 64);
        const offset = optionalInteger(term.offset, `Access "${array}" offset`, -4096, 4096);
        const invalid = [coeff, offset].find((entry) => entry.error);
        if (invalid) return { error: invalid.error };
        indices.push({
          loop: loopName,
          ...(coeff.value !== undefined ? { coeff: coeff.value } : {}),
          ...(offset.value !== undefined ? { offset: offset.value } : {}),
        });
      }
    }
    accessBody.push({ array, kind: access.kind, indices });
  }

  const advancedFields: Array<[keyof AdvancedForm, string, number, number]> = [
    ['elementBytes', 'elementBytes', 1, 16],
    ['lineBytes', 'lineBytes', 4, 512],
    ['fastMemoryBytes', 'fastMemoryBytes', 64, 64 * 1024 * 1024],
    ['opsPerIteration', 'opsPerIteration', 1, 1_000_000],
    ['maxCandidates', 'maxCandidates', 1, 512],
  ];
  const bodyExtra: Record<string, number> = {};
  for (const [field, what, min, max] of advancedFields) {
    const parsed = optionalInteger(advanced[field], what, min, max);
    if (parsed.error) return { error: parsed.error };
    if (parsed.value !== undefined) bodyExtra[field] = parsed.value;
  }

  return { body: { loops: loopBody, accesses: accessBody, ...bodyExtra }, error: '' };
}

function orderLabel(schedule: PolyhedralSchedule): string {
  return schedule.loopOrder.join(' → ');
}

function tileLabel(schedule: PolyhedralSchedule): string {
  return schedule.loopOrder.map((name) => `${name}=${schedule.tileFactors[name] ?? 1}`).join(', ');
}

export default function PolyhedralPanel() {
  const [loops, setLoops] = useState<LoopRow[]>(INITIAL_LOOPS);
  const [accesses, setAccesses] = useState<AccessRow[]>(INITIAL_ACCESSES);
  const [advanced, setAdvanced] = useState<AdvancedForm>(DEFAULT_ADVANCED);
  const [result, setResult] = useState<PolyhedralResponse | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const updateLoop = (index: number, patch: Partial<LoopRow>) => {
    setLoops((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)));
    setResult(null);
    setSelectedId('');
  };

  const updateAccess = (index: number, patch: Partial<AccessRow>) => {
    setAccesses((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)));
    setResult(null);
    setSelectedId('');
  };

  const updateTerm = (accessIndex: number, termIndex: number, patch: Partial<TermRow>) => {
    setAccesses((current) =>
      current.map((row, position) =>
        position === accessIndex
          ? { ...row, terms: row.terms.map((term, termPosition) => (termPosition === termIndex ? { ...term, ...patch } : term)) }
          : row,
      ),
    );
    setResult(null);
    setSelectedId('');
  };

  const run = async () => {
    const { body, error: invalid } = buildBody(loops, accesses, advanced);
    if (!body) {
      setError(invalid || 'Fix the loop-nest input before analyzing.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await apiPost<PolyhedralResponse>('/api/accelerator/polyhedral', body);
      setResult(response);
      setSelectedId(response.pareto[0] ?? response.schedules[0]?.id ?? '');
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : 'Polyhedral analysis failed');
    } finally {
      setBusy(false);
    }
  };

  const selected = result?.schedules.find((schedule) => schedule.id === selectedId) ?? null;

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Describe an affine loop nest with bounded integer loops and its array accesses. The explorer
        enumerates legal tilings and loop orders, computes distance-vector dependences over the exact
        bounded iteration space, and ranks schedules on a documented two-level memory model. Model
        estimates only — validate the chosen schedule on the target memory system.
      </Typography>

      <Box>
        <Stack direction="row" gap={1} alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" fontWeight={700}>
            Loops (1–{MAX_LOOPS})
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            disabled={loops.length >= MAX_LOOPS}
            onClick={() => setLoops((current) => [...current, { name: '', lower: '0', upper: '64', step: '1' }])}
          >
            Add loop
          </Button>
        </Stack>
        <Stack gap={1} sx={{ mt: 1 }}>
          {loops.map((loop, index) => (
            <Stack key={index} direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
              <TextField
                size="small"
                label={`loop ${index + 1} name`}
                value={loop.name}
                onChange={(event) => updateLoop(index, { name: event.target.value })}
                sx={{ width: { xs: '100%', sm: 160 } }}
              />
              <TextField
                size="small"
                type="number"
                label="lower"
                value={loop.lower}
                onChange={(event) => updateLoop(index, { lower: event.target.value })}
                sx={{ width: { xs: '100%', sm: 120 } }}
              />
              <TextField
                size="small"
                type="number"
                label="upper"
                value={loop.upper}
                onChange={(event) => updateLoop(index, { upper: event.target.value })}
                sx={{ width: { xs: '100%', sm: 120 } }}
              />
              <TextField
                size="small"
                type="number"
                label="step"
                value={loop.step}
                onChange={(event) => updateLoop(index, { step: event.target.value })}
                sx={{ width: { xs: '100%', sm: 120 } }}
                helperText="optional, 1–64"
              />
              <Tooltip title="Remove loop">
                <span>
                  <IconButton
                    size="small"
                    aria-label={`Remove loop ${index + 1}`}
                    disabled={loops.length <= 1}
                    onClick={() => setLoops((current) => current.filter((_, position) => position !== index))}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          ))}
        </Stack>
      </Box>

      <Box>
        <Stack direction="row" gap={1} alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" fontWeight={700}>
            Array accesses (1–{MAX_ACCESSES}, each with 1–{MAX_INDEX_DIMS} index dimensions)
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            disabled={accesses.length >= MAX_ACCESSES}
            onClick={() => setAccesses((current) => [...current, { array: '', kind: 'read', terms: [loopTerm(loops[0]?.name ?? 'i')] }])}
          >
            Add access
          </Button>
        </Stack>
        <Stack gap={1.5} sx={{ mt: 1 }}>
          {accesses.map((access, accessIndex) => (
            <Paper key={accessIndex} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
                <TextField
                  size="small"
                  label={`access ${accessIndex + 1} array`}
                  value={access.array}
                  onChange={(event) => updateAccess(accessIndex, { array: event.target.value })}
                  sx={{ width: { xs: '100%', sm: 180 } }}
                />
                <TextField
                  select
                  size="small"
                  label="kind"
                  value={access.kind}
                  onChange={(event) => updateAccess(accessIndex, { kind: event.target.value as 'read' | 'write' })}
                  sx={{ width: { xs: '100%', sm: 120 } }}
                >
                  <MenuItem value="read">read</MenuItem>
                  <MenuItem value="write">write</MenuItem>
                </TextField>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  disabled={access.terms.length >= MAX_INDEX_DIMS}
                  onClick={() =>
                    updateAccess(accessIndex, { terms: [...access.terms, loopTerm(loops[0]?.name ?? 'i')] })
                  }
                >
                  Add index
                </Button>
                <Tooltip title="Remove access">
                  <span>
                    <IconButton
                      size="small"
                      aria-label={`Remove access ${accessIndex + 1}`}
                      disabled={accesses.length <= 1}
                      onClick={() => setAccesses((current) => current.filter((_, position) => position !== accessIndex))}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
              <Stack gap={1} sx={{ mt: 1 }}>
                {access.terms.map((term, termIndex) => (
                  <Stack key={termIndex} direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
                    <TextField
                      select
                      size="small"
                      label={`index ${termIndex + 1}`}
                      value={term.kind}
                      onChange={(event) =>
                        updateTerm(accessIndex, termIndex, { kind: event.target.value as 'constant' | 'loop' })
                      }
                      sx={{ width: { xs: '100%', sm: 140 } }}
                    >
                      <MenuItem value="loop">loop term</MenuItem>
                      <MenuItem value="constant">constant</MenuItem>
                    </TextField>
                    {term.kind === 'constant' ? (
                      <TextField
                        size="small"
                        type="number"
                        label="constant"
                        value={term.constant}
                        onChange={(event) => updateTerm(accessIndex, termIndex, { constant: event.target.value })}
                        sx={{ width: { xs: '100%', sm: 140 } }}
                      />
                    ) : (
                      <>
                        <TextField
                          select
                          size="small"
                          label="loop"
                          value={term.loop}
                          onChange={(event) => updateTerm(accessIndex, termIndex, { loop: event.target.value })}
                          sx={{ width: { xs: '100%', sm: 140 } }}
                        >
                          {loops.map((loop) => (
                            <MenuItem key={loop.name} value={loop.name}>
                              {loop.name}
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          size="small"
                          type="number"
                          label="coeff"
                          value={term.coeff}
                          onChange={(event) => updateTerm(accessIndex, termIndex, { coeff: event.target.value })}
                          sx={{ width: { xs: '100%', sm: 120 } }}
                          helperText="optional"
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="offset"
                          value={term.offset}
                          onChange={(event) => updateTerm(accessIndex, termIndex, { offset: event.target.value })}
                          sx={{ width: { xs: '100%', sm: 120 } }}
                          helperText="optional"
                        />
                      </>
                    )}
                    <Tooltip title="Remove index">
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`Remove index ${termIndex + 1} from access ${accessIndex + 1}`}
                          disabled={access.terms.length <= 1}
                          onClick={() =>
                            updateAccess(accessIndex, {
                              terms: access.terms.filter((_, position) => position !== termIndex),
                            })
                          }
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Box>

      <Box>
        <Typography variant="subtitle1" fontWeight={700}>
          Memory model (optional overrides)
        </Typography>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          {(
            [
              ['elementBytes', 'elementBytes', '1–16'],
              ['lineBytes', 'lineBytes', '4–512'],
              ['fastMemoryBytes', 'fastMemoryBytes', '64–64Mi'],
              ['opsPerIteration', 'opsPerIteration', '1–1000000'],
              ['maxCandidates', 'maxCandidates', '1–512'],
            ] as Array<[keyof AdvancedForm, string, string]>
          ).map(([field, label, hint]) => (
            <Grid key={field} size={{ xs: 6, sm: 4, md: 2 }}>
              <TextField
                size="small"
                fullWidth
                type="number"
                label={label}
                value={advanced[field]}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setAdvanced((current) => ({ ...current, [field]: event.target.value }))
                }
                helperText={hint}
              />
            </Grid>
          ))}
        </Grid>
      </Box>

      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
        <Button variant="contained" startIcon={<GridOnIcon />} disabled={busy} onClick={() => void run()}>
          Analyze loop nest
        </Button>
        {busy && <CircularProgress size={20} />}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {!result && !busy && (
        <EmptyNotice>
          No analysis yet. The button runs POST /api/accelerator/polyhedral and renders exactly what
          the API returns.
        </EmptyNotice>
      )}

      {result && (
        <Stack gap={2}>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip size="small" variant="outlined" label={`loops: ${result.loops.map((loop) => `${loop.name}[${loop.lower},${loop.upper})`).join(', ')}`} />
            <Chip size="small" variant="outlined" label={`candidates: ${result.candidateCount.toLocaleString()}`} />
            <Chip size="small" variant="outlined" label={`evaluated: ${result.evaluatedCount.toLocaleString()}`} />
            <Chip size="small" variant="outlined" label={`dependence vectors: ${result.dependenceVectorCount.toLocaleString()}`} />
            <Chip size="small" variant="outlined" label={`legal orders: ${result.legalOrders.length}`} />
            <Chip
              size="small"
              color={result.truncated ? 'warning' : 'success'}
              label={result.truncated ? 'candidate list truncated' : 'no truncation'}
            />
          </Stack>

          <NotesAlerts title="Model assumptions and boundary behaviour" notes={result.notes} />

          {result.pareto.length > 0 && (
            <Stack gap={0.5}>
              <Typography variant="subtitle1" fontWeight={700}>
                Pareto front ({result.pareto.length} of {result.schedules.length} evaluated schedules)
              </Typography>
              <Stack direction="row" gap={0.5} flexWrap="wrap">
                {result.pareto.map((id) => (
                  <Chip
                    key={id}
                    size="small"
                    color="success"
                    label={id}
                    onClick={() => {
                      const schedule = result.schedules.find((entry) => entry.id === id);
                      if (schedule) setSelectedId(schedule.id);
                    }}
                  />
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Pareto ranking covers the evaluated candidates only and reflects the documented
                memory model, not hardware measurements.
              </Typography>
            </Stack>
          )}

          <Box>
            <Typography variant="h6">Schedules</Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
              <Table size="small" sx={{ minWidth: 1180 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Sched</TableCell>
                    <TableCell>Rank</TableCell>
                    <TableCell>Loop order</TableCell>
                    <TableCell>Tile factors</TableCell>
                    <TableCell align="right">Tiles</TableCell>
                    <TableCell align="right">L2 traffic</TableCell>
                    <TableCell align="right">Requested</TableCell>
                    <TableCell align="right">Lines from L2</TableCell>
                    <TableCell align="right">Lines touched</TableCell>
                    <TableCell align="right">Accesses/line</TableCell>
                    <TableCell align="right">Max working set</TableCell>
                    <TableCell>Fast memory</TableCell>
                    <TableCell align="right">Spill passes</TableCell>
                    <TableCell align="right">Ops/byte</TableCell>
                    <TableCell align="right">Loop listing</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.schedules.map((schedule) => (
                    <TableRow
                      key={schedule.id}
                      selected={schedule.id === selectedId}
                      sx={schedule.paretoRank !== null ? { backgroundColor: 'success.light' } : undefined}
                    >
                      <TableCell sx={{ fontFamily: 'monospace' }}>{schedule.id}</TableCell>
                      <TableCell>{schedule.paretoRank ?? '—'}</TableCell>
                      <TableCell>{orderLabel(schedule)}</TableCell>
                      <TableCell>{tileLabel(schedule)}</TableCell>
                      <TableCell align="right">{schedule.tileCount.toLocaleString()}</TableCell>
                      <TableCell align="right">{formatBytes(schedule.l2TrafficBytes)}</TableCell>
                      <TableCell align="right">{formatBytes(schedule.requestedBytes)}</TableCell>
                      <TableCell align="right">{schedule.linesFromL2.toLocaleString()}</TableCell>
                      <TableCell align="right">{schedule.linesTouched.toLocaleString()}</TableCell>
                      <TableCell align="right">{formatNumber(schedule.accessesPerLine, 2)}</TableCell>
                      <TableCell align="right">{formatBytes(schedule.maxWorkingSetBytes)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={schedule.fitsFastMemory ? 'success' : 'warning'}
                          variant="outlined"
                          label={schedule.fitsFastMemory ? 'fits' : 'spills'}
                        />
                      </TableCell>
                      <TableCell align="right">{schedule.spillPasses.toLocaleString()}</TableCell>
                      <TableCell align="right">{formatNumber(schedule.arithmeticIntensityOpsPerByte, 3)}</TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => setSelectedId(schedule.id)}>
                          Show
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {selected && (
            <CodeBlock
              title={`Transformed loop nest — ${selected.id}`}
              code={selected.transformedListing}
              maxHeight={420}
            />
          )}

          <Box>
            <Typography variant="h6">Dependence distance vectors</Typography>
            {result.dependenceVectors.length === 0 ? (
              <EmptyNotice>
                No non-zero distance vectors were found in the bounded iteration space; every loop
                order is legal for this nest.
              </EmptyNotice>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Distance vector ({result.loops.map((loop) => loop.name).join(', ')})</TableCell>
                      <TableCell>Arrays</TableCell>
                      <TableCell align="right">Occurrences</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.dependenceVectors.map((vector, index) => (
                      <TableRow key={`${vector.arrays.join('-')}-${index}`}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>[{vector.delta.join(', ')}]</TableCell>
                        <TableCell>{vector.arrays.join(', ') || '—'}</TableCell>
                        <TableCell align="right">{vector.occurrences.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            {result.dependenceVectorCount > result.dependenceVectors.length && (
              <Typography variant="caption" color="text.secondary">
                Showing the first {result.dependenceVectors.length} of {result.dependenceVectorCount} vectors.
              </Typography>
            )}
          </Box>

          <ChipList title="Legal loop orders" items={result.legalOrders.map((order) => order.join(' → '))} />

          <Box>
            <Typography variant="h6">Inferred array shapes</Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Array</TableCell>
                    <TableCell>Shape</TableCell>
                    <TableCell>Strides</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(result.arrayShapes).map(([array, shape]) => (
                    <TableRow key={array}>
                      <TableCell>{array}</TableCell>
                      <TableCell>[{shape.shape.join(', ')}]</TableCell>
                      <TableCell>[{shape.strides.join(', ')}]</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Stack>
      )}
    </Stack>
  );
}
