'use client';

/**
 * Per-loop pragma editor shared by the Estimate and RTL panels.
 *
 * Values map 1:1 onto the API's `loopPragmaSchema`. Tiling is only offered for
 * loops that contain nested loops (the design-space enumerator uses the same
 * rule); the field stays visible but disabled otherwise so the limitation is
 * explicit.
 */
import {
  Alert,
  Box,
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
import type { LoopInfo, LoopPragma, LoopPragmaEditing } from './types';

export const IDENTITY_PRAGMA: Omit<LoopPragmaEditing, 'loopId'> = {
  parallelFactor: 1,
  pipelineII: 1,
  unrollFactor: 1,
  tileFactor: 1,
};

export function defaultLoopPragmas(loops: LoopInfo[]): LoopPragmaEditing[] {
  return loops.map((loop) => ({ loopId: loop.id, ...IDENTITY_PRAGMA }));
}

export function loopPragmasFromRanked(pragmas: LoopPragma[]): LoopPragmaEditing[] {
  return pragmas.map((pragma) => ({
    loopId: pragma.loopId,
    parallelFactor: pragma.parallelFactor,
    pipelineII: pragma.pipelineII,
    unrollFactor: pragma.unrollFactor,
    tileFactor: pragma.tileFactor,
  }));
}

export function serializePragmas(pragmas: LoopPragmaEditing[]): Array<Record<string, number | string>> {
  return pragmas.map((pragma) => ({
    loopId: pragma.loopId,
    parallelFactor: pragma.parallelFactor,
    pipelineII: pragma.pipelineII,
    unrollFactor: pragma.unrollFactor,
    tileFactor: pragma.tileFactor,
  }));
}

export interface DesignPointEditorProps {
  loops: LoopInfo[] | null;
  value: LoopPragmaEditing[];
  onChange: (value: LoopPragmaEditing[]) => void;
  disabled?: boolean;
}

function clampFactor(text: string): number {
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(64, Math.max(1, Math.round(parsed)));
}

export default function DesignPointEditor({ loops, value, onChange, disabled }: DesignPointEditorProps) {
  if (loops === null) {
    return (
      <Alert severity="info">
        Analyze a kernel first: the design point is expressed as per-loop pragmas (parallel factor,
        pipeline II, unroll factor, tile factor) for each loop in the parsed kernel.
      </Alert>
    );
  }
  if (loops.length === 0) {
    return (
      <Alert severity="info">
        The parsed kernel has no loops. It is estimated and generated as a single straight-line
        design point with no per-loop pragmas.
      </Alert>
    );
  }

  const pragmaFor = (loopId: string): LoopPragmaEditing =>
    value.find((pragma) => pragma.loopId === loopId) ?? { loopId, ...IDENTITY_PRAGMA };

  const update = (loopId: string, patch: Partial<Omit<LoopPragmaEditing, 'loopId'>>) => {
    const next = loops.map((loop) => ({ ...pragmaFor(loop.id), ...(loop.id === loopId ? patch : {}) }));
    onChange(next);
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        Design point (per-loop pragmas)
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Loop</TableCell>
              <TableCell>Depth</TableCell>
              <TableCell>Trip count</TableCell>
              <TableCell>Parallel (1–64)</TableCell>
              <TableCell>Pipeline II (1–64)</TableCell>
              <TableCell>Unroll (1–64)</TableCell>
              <TableCell>Tile (1–64)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loops.map((loop) => {
              const pragma = pragmaFor(loop.id);
              const tileable = loop.childLoopIds.length > 0;
              return (
                <TableRow key={loop.id}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {loop.id}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {loop.varName} = {loop.start}; {loop.varName} {loop.comparison} {loop.boundText}
                    </Typography>
                  </TableCell>
                  <TableCell>{loop.depth}</TableCell>
                  <TableCell>{loop.tripCount.toLocaleString()}</TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      value={pragma.parallelFactor}
                      disabled={disabled}
                      inputProps={{ min: 1, max: 64, 'aria-label': `${loop.id} parallel factor` }}
                      onChange={(event) => update(loop.id, { parallelFactor: clampFactor(event.target.value) })}
                      sx={{ width: 96 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      value={pragma.pipelineII}
                      disabled={disabled}
                      inputProps={{ min: 1, max: 64, 'aria-label': `${loop.id} pipeline II` }}
                      onChange={(event) => update(loop.id, { pipelineII: clampFactor(event.target.value) })}
                      sx={{ width: 96 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      value={pragma.unrollFactor}
                      disabled={disabled}
                      inputProps={{ min: 1, max: 64, 'aria-label': `${loop.id} unroll factor` }}
                      onChange={(event) => update(loop.id, { unrollFactor: clampFactor(event.target.value) })}
                      sx={{ width: 96 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      value={pragma.tileFactor}
                      disabled={disabled || !tileable}
                      inputProps={{ min: 1, max: 64, 'aria-label': `${loop.id} tile factor` }}
                      onChange={(event) => update(loop.id, { tileFactor: clampFactor(event.target.value) })}
                      helperText={tileable ? undefined : 'no nested loop'}
                      sx={{ width: 110 }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Identity (1/1/1/1) means no directive for that loop. The estimate is analytical: dependence
          legality is never checked against the requested pragmas.
        </Typography>
      </Stack>
    </Box>
  );
}
