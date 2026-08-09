'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { PlayArrow } from '@mui/icons-material';
import type { PlatformCapabilityId } from '@/lib/commercial/capabilities';
import { CAPABILITY_ACTIONS } from '@/lib/commercial/capabilityActionCatalog';
import type { CapabilityExecutionResult, CapabilityVisualization } from '@/lib/commercial/capabilityExecution';

const evidenceLines = (value: string) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

function ExecutionVisualization({ visualization }: { visualization: CapabilityVisualization }) {
  if (visualization.type === 'line' && visualization.points?.length) {
    const points = visualization.points;
    const xValues = points.map((point) => point.x);
    const yValues = points.map((point) => point.y);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const scaleX = (value: number) => 16 + ((value - minX) / Math.max(1, maxX - minX)) * 568;
    const scaleY = (value: number) => 184 - ((value - minY) / Math.max(1, maxY - minY)) * 168;
    return (
      <Box>
        <svg viewBox="0 0 600 200" width="100%" role="img" aria-label={visualization.title}>
          <polyline
            points={points.map((point) => `${scaleX(point.x)},${scaleY(point.y)}`).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          {points.map((point, index) => (
            <circle
              key={`${point.x}-${point.y}-${index}`}
              cx={scaleX(point.x)}
              cy={scaleY(point.y)}
              r="4"
              fill="currentColor"
            />
          ))}
        </svg>
        <Typography variant="caption" color="text.secondary">
          {visualization.xLabel ?? 'x'} → · {visualization.yLabel ?? 'y'} ↑
        </Typography>
      </Box>
    );
  }

  if (visualization.type === 'heatmap' && visualization.grid?.length) {
    const values = visualization.grid.flat();
    const max = Math.max(...values.map((value) => Math.abs(value)), 1);
    return (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${visualization.grid[0]?.length ?? 1}, minmax(24px, 1fr))`,
          gap: 0.5,
        }}
      >
        {visualization.grid.flatMap((row, rowIndex) =>
          row.map((value, columnIndex) => (
            <Box
              key={`${rowIndex}-${columnIndex}`}
              title={`${value}`}
              sx={{
                aspectRatio: '1',
                borderRadius: 0.5,
                bgcolor:
                  value >= 0
                    ? `rgba(239,83,80,${0.15 + (Math.abs(value) / max) * 0.8})`
                    : `rgba(66,165,245,${0.15 + (Math.abs(value) / max) * 0.8})`,
              }}
            />
          ))
        )}
      </Box>
    );
  }

  if (visualization.type === 'wafer' && visualization.cells?.length) {
    const cells = visualization.cells;
    const minX = Math.min(...cells.map((cell) => cell.x));
    const maxX = Math.max(...cells.map((cell) => cell.x));
    const minY = Math.min(...cells.map((cell) => cell.y));
    const maxY = Math.max(...cells.map((cell) => cell.y));
    const maxValue = Math.max(...cells.map((cell) => Math.abs(cell.value)), 1);
    return (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${maxX - minX + 1}, minmax(28px, 1fr))`,
          gap: 0.5,
          maxWidth: 520,
        }}
      >
        {Array.from({ length: (maxY - minY + 1) * (maxX - minX + 1) }, (_, index) => {
          const x = minX + (index % (maxX - minX + 1));
          const y = minY + Math.floor(index / (maxX - minX + 1));
          const cell = cells.find((candidate) => candidate.x === x && candidate.y === y);
          return (
            <Box
              key={`${x}-${y}`}
              title={cell ? `${cell.label}: ${cell.value}` : 'No die'}
              sx={{
                aspectRatio: '1',
                borderRadius: 0.75,
                border: 1,
                borderColor: cell ? 'divider' : 'transparent',
                bgcolor: cell ? `rgba(102,187,106,${0.15 + (Math.abs(cell.value) / maxValue) * 0.8})` : 'transparent',
              }}
            />
          );
        })}
      </Box>
    );
  }

  if (visualization.type === 'bars' && visualization.bars?.length) {
    const max = Math.max(...visualization.bars.map((bar) => Math.abs(bar.value)), 1);
    return (
      <Stack gap={1}>
        {visualization.bars.map((bar) => (
          <Box key={bar.label}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption">{bar.label}</Typography>
              <Typography variant="caption" fontWeight={800}>
                {bar.value}
              </Typography>
            </Stack>
            <Box sx={{ height: 9, bgcolor: 'action.hover', borderRadius: 5 }}>
              <Box
                sx={{
                  height: '100%',
                  width: `${(Math.abs(bar.value) / max) * 100}%`,
                  bgcolor: 'primary.main',
                  borderRadius: 5,
                }}
              />
            </Box>
          </Box>
        ))}
      </Stack>
    );
  }

  return null;
}

export default function CapabilityExecutionWorkbench({
  capabilityId,
  capabilityTitle,
  projectId,
  open,
  onClose,
  onComplete,
}: {
  capabilityId: PlatformCapabilityId;
  capabilityTitle: string;
  projectId: string;
  open: boolean;
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const actions = CAPABILITY_ACTIONS[capabilityId];
  const [actionId, setActionId] = useState(actions[0].id);
  const action = useMemo(() => actions.find((item) => item.id === actionId) ?? actions[0], [actionId, actions]);
  const [input, setInput] = useState(JSON.stringify(action.inputTemplate, null, 2));
  const [evidence, setEvidence] = useState('');
  const [execution, setExecution] = useState<CapabilityExecutionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const first = CAPABILITY_ACTIONS[capabilityId][0];
    setActionId(first.id);
    setInput(JSON.stringify(first.inputTemplate, null, 2));
    setEvidence('');
    setExecution(null);
    setError('');
  }, [capabilityId, open]);

  const selectAction = (nextId: string) => {
    const next = actions.find((item) => item.id === nextId) ?? actions[0];
    setActionId(next.id);
    setInput(JSON.stringify(next.inputTemplate, null, 2));
    setExecution(null);
    setError('');
  };

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const parsed = JSON.parse(input) as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
        throw new Error('Input must be a JSON object');
      const response = await fetch('/api/capabilities/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          capabilityId,
          actionId,
          input: parsed,
          evidence: evidenceLines(evidence),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Capability execution failed');
      setExecution(data.execution);
      await onComplete();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Capability execution failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="lg">
      <DialogTitle>{capabilityTitle} execution workbench</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ mt: 1 }}>
          <Alert severity={action.mode === 'adapter' ? 'warning' : 'info'}>
            {action.mode === 'adapter'
              ? 'This action uses a real outbound adapter. The run will report configuration-required until its endpoint and token are configured.'
              : action.mode === 'governed-job'
                ? 'This action submits work through the governed EDA job queue and preserves the resulting job identity.'
                : 'This deterministic analysis runs inside the tenant workspace and stores its inputs and results as governed evidence.'}
          </Alert>
          <FormControl fullWidth>
            <InputLabel>Executable action</InputLabel>
            <Select label="Executable action" value={actionId} onChange={(event) => selectAction(event.target.value)}>
              {actions.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.title} · {item.mode}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography color="text.secondary">{action.description}</Typography>
          <TextField
            label="Structured JSON input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            multiline
            minRows={12}
            maxRows={24}
            slotProps={{ htmlInput: { spellCheck: false } }}
            sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 13 } }}
          />
          <TextField
            label="Primary evidence references (optional, one per line)"
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            multiline
            minRows={2}
            helperText="If omitted, the audit request ID becomes the evidence reference."
          />
          {error && <Alert severity="error">{error}</Alert>}
          {execution && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
                <Typography variant="h6" fontWeight={850}>
                  Execution result
                </Typography>
                <Chip
                  label={execution.status}
                  color={
                    execution.status === 'completed' ? 'success' : execution.status === 'blocked' ? 'error' : 'warning'
                  }
                />
              </Stack>
              <Typography sx={{ mt: 1 }}>{execution.summary}</Typography>
              <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} sx={{ my: 2 }}>
                {Object.entries(execution.metrics).map(([key, value]) => (
                  <Chip key={key} variant="outlined" label={`${key}: ${String(value)}`} />
                ))}
              </Stack>
              {execution.visualization && (
                <Box sx={{ my: 2 }}>
                  <Typography variant="subtitle2" fontWeight={850} sx={{ mb: 1 }}>
                    {execution.visualization.title}
                  </Typography>
                  <ExecutionVisualization visualization={execution.visualization} />
                </Box>
              )}
              {execution.findings.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="subtitle2" fontWeight={850}>
                    Findings
                  </Typography>
                  {execution.findings.map((finding) => (
                    <Typography key={finding} variant="body2">
                      • {finding}
                    </Typography>
                  ))}
                </Box>
              )}
              {execution.recommendations.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="subtitle2" fontWeight={850}>
                    Next actions
                  </Typography>
                  {execution.recommendations.map((recommendation) => (
                    <Typography key={recommendation} variant="body2">
                      • {recommendation}
                    </Typography>
                  ))}
                </Box>
              )}
            </Paper>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>
          Close
        </Button>
        <Button variant="contained" startIcon={<PlayArrow />} disabled={busy} onClick={() => void run()}>
          {busy ? 'Running…' : 'Run and retain evidence'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
