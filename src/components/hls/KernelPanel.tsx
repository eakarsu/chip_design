'use client';

/**
 * Kernel tab: restricted-C source, parameter bindings and the parsed IR
 * summary returned by POST /api/hls/analyze.
 *
 * The response is a parse result only; the UI never presents it as estimation,
 * synthesis, or verification evidence.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import type { AnalyzeResponse, ParameterRow } from './types';
import { buildParameterRecord, default as ParameterEditor } from './ParameterEditor';
import { ChipList, EmptyNotice, KeyValueGrid, LabelAlert, NotesAlerts } from './ui';

export interface KernelPanelProps {
  kernel: string;
  onKernelChange: (value: string) => void;
  parameters: ParameterRow[];
  onParametersChange: (rows: ParameterRow[]) => void;
  analysis: AnalyzeResponse | null;
  analyzing: boolean;
  error: string;
  parameterError: string;
  onAnalyze: (parameters: Record<string, number> | undefined) => void;
}

export default function KernelPanel({
  kernel,
  onKernelChange,
  parameters,
  onParametersChange,
  analysis,
  analyzing,
  error,
  parameterError,
  onAnalyze,
}: KernelPanelProps) {
  const [localParameterError, setLocalParameterError] = useState('');

  const runAnalyze = () => {
    const { record, error: invalid } = buildParameterRecord(parameters);
    setLocalParameterError(invalid);
    if (invalid) return;
    onAnalyze(Object.keys(record).length > 0 ? record : undefined);
  };

  const parameterIssue = localParameterError || parameterError;

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        The parser accepts a restricted C-like subset: constant-bound <code>for</code> loops, integer
        scalars and fixed-size arrays, no recursion or dynamic allocation. Parsing performs no
        estimation, synthesis, simulation, or verification.
      </Typography>

      <TextField
        label="Kernel source"
        value={kernel}
        onChange={(event) => onKernelChange(event.target.value)}
        multiline
        minRows={10}
        maxRows={26}
        fullWidth
        placeholder="Paste a restricted-C kernel here"
        helperText={`${kernel.length.toLocaleString()} / 200000 characters`}
        inputProps={{ 'aria-label': 'Kernel source', spellCheck: false, style: { fontFamily: 'monospace', fontSize: 13 } }}
      />

      <ParameterEditor rows={parameters} onChange={onParametersChange} disabled={analyzing} />

      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          disabled={analyzing || kernel.trim().length === 0}
          onClick={runAnalyze}
        >
          Analyze kernel
        </Button>
        {analyzing && <CircularProgress size={20} />}
      </Stack>

      {parameterIssue && <Alert severity="warning">{parameterIssue}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      {!analysis && !analyzing && !error && (
        <EmptyNotice>No parse result yet. Analyze a kernel to see its IR summary here.</EmptyNotice>
      )}

      {analysis && (
        <Stack gap={2}>
          <LabelAlert label={analysis.label} note={analysis.note} />

          <KeyValueGrid
            rows={[
              ['Kernel', analysis.name],
              ['IR version', String(analysis.irVersion)],
              ['Source lines', analysis.source.lines.toLocaleString()],
              ['Source characters', analysis.source.characters.toLocaleString()],
              ['Source hash', analysis.source.hash.slice(0, 16)],
              ['Max loop depth', String(analysis.maxLoopDepth)],
              ['Primitive ops', analysis.operations.length.toLocaleString()],
              ['Arrays', analysis.arrays.length.toLocaleString()],
              ['Scalars', analysis.scalars.length.toLocaleString()],
            ]}
          />

          <ChipList title="Parser subset" items={analysis.subset} />

          <Typography variant="h6">
            Loops ({analysis.loops.length})
          </Typography>
          {analysis.loops.length === 0 ? (
            <EmptyNotice>The parser found no loops; this is straight-line code.</EmptyNotice>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Loop</TableCell>
                    <TableCell>Bounds</TableCell>
                    <TableCell align="right">Trip count</TableCell>
                    <TableCell align="right">Depth</TableCell>
                    <TableCell>Parent</TableCell>
                    <TableCell align="right">Ops (own / total)</TableCell>
                    <TableCell align="right">Array accesses</TableCell>
                    <TableCell>Children</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analysis.loops.map((loop) => (
                    <TableRow key={loop.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {loop.id}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          line {loop.line}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {loop.varName} = {loop.start}; {loop.varName} {loop.comparison} {loop.boundText}; step {loop.step}
                      </TableCell>
                      <TableCell align="right">{loop.tripCount.toLocaleString()}</TableCell>
                      <TableCell align="right">{loop.depth}</TableCell>
                      <TableCell>{loop.parentId ?? '—'}</TableCell>
                      <TableCell align="right">
                        {loop.ownOpCount} / {loop.opCount}
                      </TableCell>
                      <TableCell align="right">{loop.arrayAccessCount}</TableCell>
                      <TableCell>{loop.childLoopIds.length ? loop.childLoopIds.join(', ') : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Typography variant="h6">Arrays ({analysis.arrays.length})</Typography>
          {analysis.arrays.length === 0 ? (
            <EmptyNotice>The parser found no arrays.</EmptyNotice>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Dimensions</TableCell>
                    <TableCell align="right">Elements</TableCell>
                    <TableCell align="right">Element bytes</TableCell>
                    <TableCell>Interface</TableCell>
                    <TableCell align="right">Line</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analysis.arrays.map((array) => (
                    <TableRow key={array.name}>
                      <TableCell>{array.name}</TableCell>
                      <TableCell>{array.type}</TableCell>
                      <TableCell>{array.dimensions.join(' × ')}</TableCell>
                      <TableCell align="right">{array.size.toLocaleString()}</TableCell>
                      <TableCell align="right">{array.elementBytes}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          color={array.argument ? 'primary' : 'default'}
                          label={array.argument ? 'signature argument' : 'local'}
                        />
                      </TableCell>
                      <TableCell align="right">{array.line}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Typography variant="h6">Scalars and dependence flags ({analysis.scalars.length})</Typography>
          {analysis.scalars.length === 0 ? (
            <EmptyNotice>The parser found no scalar variables.</EmptyNotice>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Reads</TableCell>
                    <TableCell align="right">Writes</TableCell>
                    <TableCell>Initial value</TableCell>
                    <TableCell>Loops</TableCell>
                    <TableCell>Flags</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analysis.scalars.map((scalar) => (
                    <TableRow key={scalar.name}>
                      <TableCell>{scalar.name}</TableCell>
                      <TableCell align="right">{scalar.reads}</TableCell>
                      <TableCell align="right">{scalar.writes}</TableCell>
                      <TableCell>{scalar.initialValue ?? '—'}</TableCell>
                      <TableCell>{scalar.loopIds.length ? scalar.loopIds.join(', ') : '—'}</TableCell>
                      <TableCell>
                        <Stack direction="row" gap={0.5} flexWrap="wrap">
                          {scalar.loopCarried ? (
                            <Chip size="small" color="warning" label="loop-carried (conservative)" />
                          ) : (
                            <Chip size="small" variant="outlined" label="no loop-carried flow" />
                          )}
                          {scalar.reduction && <Chip size="small" color="success" label="reduction candidate" />}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Typography variant="h6">Primitive operations ({analysis.operations.length})</Typography>
          {analysis.operations.length === 0 ? (
            <EmptyNotice>The parser found no primitive operations.</EmptyNotice>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Op</TableCell>
                    <TableCell>Line</TableCell>
                    <TableCell>Loop path</TableCell>
                    <TableCell>Arithmetic</TableCell>
                    <TableCell>Reads</TableCell>
                    <TableCell>Writes</TableCell>
                    <TableCell>Array reads</TableCell>
                    <TableCell>Array writes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analysis.operations.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell>
                        {op.id} <Chip size="small" variant="outlined" label={op.op} />
                      </TableCell>
                      <TableCell>{op.line}</TableCell>
                      <TableCell>{op.loopPath.length ? op.loopPath.join(' → ') : 'straight-line'}</TableCell>
                      <TableCell>{op.arithmetic.join(' ') || '—'}</TableCell>
                      <TableCell>{op.reads.join(', ') || '—'}</TableCell>
                      <TableCell>{op.writes.join(', ') || '—'}</TableCell>
                      <TableCell>{op.arrayReads.join(', ') || '—'}</TableCell>
                      <TableCell>{op.arrayWrites.join(', ') || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <ChipList
            title="Operation mix"
            items={Object.entries(analysis.opMix)
              .filter(([, count]) => count > 0)
              .map(([op, count]) => `${op} × ${count}`)}
          />

          <NotesAlerts title="Parser notes" notes={analysis.notes} />
        </Stack>
      )}
    </Stack>
  );
}
