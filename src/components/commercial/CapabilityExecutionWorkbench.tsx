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
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { PlayArrow } from '@mui/icons-material';
import type { PlatformCapabilityId } from '@/lib/commercial/capabilities';
import { CAPABILITY_ACTIONS } from '@/lib/commercial/capabilityActionCatalog';
import type { CapabilityExecutionResult, CapabilityVisualization } from '@/lib/commercial/capabilityExecution';

type EdaProjectOption = { id: string; name: string; pdkRef: string; createdAt: string };

const evidenceLines = (value: string) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

function StructuredInputField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: Record<string, unknown> | unknown[];
  onChange: (value: Record<string, unknown> | unknown[]) => void;
}) {
  const serialized = JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState('');

  useEffect(() => setDraft(serialized), [serialized]);

  const commit = () => {
    try {
      const parsed = JSON.parse(draft) as unknown;
      if (!parsed || typeof parsed !== 'object') throw new Error('Value must be an object or array');
      if (Array.isArray(value) !== Array.isArray(parsed)) {
        throw new Error(Array.isArray(value) ? 'Value must remain an array' : 'Value must remain an object');
      }
      onChange(parsed as Record<string, unknown> | unknown[]);
      setError('');
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Invalid structured value');
    }
  };

  return (
    <TextField
      label={name.replaceAll(/[-_]/g, ' ')}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      multiline
      minRows={Math.min(12, Math.max(4, draft.split('\n').length))}
      error={Boolean(error)}
      helperText={
        error ||
        `${Array.isArray(value) ? value.length : Object.keys(value).length} structured item(s) · validated on blur`
      }
      sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 13 } }}
    />
  );
}

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
  initialActionId,
  open,
  onClose,
  onComplete,
}: {
  capabilityId: PlatformCapabilityId;
  capabilityTitle: string;
  projectId: string;
  initialActionId?: string;
  open: boolean;
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const actions = CAPABILITY_ACTIONS[capabilityId];
  const [actionId, setActionId] = useState(actions[0].id);
  const action = useMemo(() => actions.find((item) => item.id === actionId) ?? actions[0], [actionId, actions]);
  const [input, setInput] = useState(JSON.stringify(action.inputTemplate, null, 2));
  const [editorMode, setEditorMode] = useState<'guided' | 'advanced'>('guided');
  const [evidence, setEvidence] = useState('');
  const [execution, setExecution] = useState<CapabilityExecutionResult | null>(null);
  const [recordId, setRecordId] = useState('');
  const [approvalNotice, setApprovalNotice] = useState('');
  const [manifests, setManifests] = useState<Array<{ id: string; title: string; createdAt: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [edaProjects, setEdaProjects] = useState<EdaProjectOption[]>([]);
  const [edaProjectsLoading, setEdaProjectsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const available = CAPABILITY_ACTIONS[capabilityId];
    const first = available.find((item) => item.id === initialActionId) ?? available[0];
    setActionId(first.id);
    setInput(JSON.stringify(first.inputTemplate, null, 2));
    setEvidence('');
    setEditorMode('guided');
    setExecution(null);
    setRecordId('');
    setApprovalNotice('');
    setError('');
  }, [capabilityId, initialActionId, open]);

  useEffect(() => {
    if (!open || actionId !== 'release-ceremony') return;
    const controller = new AbortController();
    setManifests([]);
    fetch('/api/workspace/bootstrap', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? 'Signed manifests could not be loaded');
        const available = (data.workspace?.featureRecords ?? []).filter((item: { projectId: string; feature: string; recordType: string; status: string }) => item.projectId === projectId && item.feature === 'tapeout-release' && item.recordType === 'signed-manifest' && item.status === 'completed');
        setManifests(available);
        setInput(JSON.stringify({ manifestRecordId: available[0]?.id ?? '' }, null, 2));
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Signed manifests could not be loaded'); });
    return () => controller.abort();
  }, [actionId, open, projectId]);

  useEffect(() => {
    if (!open || actionId !== 'sandbox-rerun') return;
    const controller = new AbortController();
    setEdaProjectsLoading(true);
    fetch('/api/capabilities/eda-projects', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? data.error ?? 'Governed EDA projects could not be loaded');
        const projects = Array.isArray(data.projects) ? data.projects as EdaProjectOption[] : [];
        setEdaProjects(projects);
        if (projects[0]) {
          setInput((current) => {
            try {
              const parsed = JSON.parse(current) as Record<string, unknown>;
              const selected = typeof parsed.edaProjectId === 'string' ? parsed.edaProjectId : '';
              if (projects.some((project) => project.id === selected)) return current;
              return JSON.stringify({ ...parsed, edaProjectId: projects[0].id }, null, 2);
            } catch {
              return current;
            }
          });
        }
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setEdaProjects([]);
        setError(loadError instanceof Error ? loadError.message : 'Governed EDA projects could not be loaded');
      })
      .finally(() => {
        if (!controller.signal.aborted) setEdaProjectsLoading(false);
      });
    return () => controller.abort();
  }, [actionId, open]);

  const selectAction = (nextId: string) => {
    const next = actions.find((item) => item.id === nextId) ?? actions[0];
    setActionId(next.id);
    setInput(JSON.stringify(next.inputTemplate, null, 2));
    setExecution(null);
    setRecordId('');
    setApprovalNotice('');
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
      setRecordId(data.record?.id ?? '');
      setApprovalNotice('');
      await onComplete();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Capability execution failed');
    } finally {
      setBusy(false);
    }
  };

  const requestReleaseApproval = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/workspace/approvals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, targetType: 'signoff', targetId: recordId, rationale: 'Independently review the retained signed manifest and its release evidence before authorizing release.' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Release approval request failed');
      setApprovalNotice(`Release approval is ${data.approval.status}. An independent administrator can review it in Workspace → ECO & approvals.`);
      await onComplete();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Release approval request failed'); }
    finally { setBusy(false); }
  };

  const parsedInput = useMemo(() => {
    try {
      const parsed = JSON.parse(input) as unknown;
      return parsed && !Array.isArray(parsed) && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }, [input]);

  const updateInputField = (name: string, value: unknown) => {
    if (!parsedInput) return;
    setInput(JSON.stringify({ ...parsedInput, [name]: value }, null, 2));
  };

  const sandboxProjectUnavailable = actionId === 'sandbox-rerun' && !edaProjectsLoading && edaProjects.length === 0;

  const importInput = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 100_000) {
      setError('Imported JSON exceeds 100 KB');
      return;
    }
    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
        throw new Error('JSON must contain an object');
      setInput(JSON.stringify(parsed, null, 2));
      setError('');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Input file is not valid JSON');
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
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap" useFlexGap>
            <Tabs value={editorMode} onChange={(_event, value: 'guided' | 'advanced') => setEditorMode(value)}>
              <Tab value="guided" label="Guided fields" />
              <Tab value="advanced" label="Expert JSON" />
            </Tabs>
            <Stack direction="row" gap={1}>
              <Button component="label" variant="outlined" size="small">
                Import JSON
                <input
                  hidden
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => void importInput(event.target.files?.[0])}
                />
              </Button>
              <Button size="small" onClick={() => setInput(JSON.stringify(action.inputTemplate, null, 2))}>
                Reset template
              </Button>
            </Stack>
          </Stack>
          {editorMode === 'guided' ? (
            parsedInput ? (
              <>
                {sandboxProjectUnavailable && (
                  <Alert severity="warning" sx={{ mb: 1.5 }}>
                    No tenant-owned governed EDA project is available. Create one in Governed EDA Runs before submitting
                    this sandbox experiment.
                  </Alert>
                )}
                <Grid container spacing={1.5}>
                {Object.entries(parsedInput).map(([name, value]) => (
                  <Grid key={name} size={{ xs: 12, md: value && typeof value === 'object' ? 12 : 6 }}>
                    {name === 'edaProjectId' && actionId === 'sandbox-rerun' ? (
                      <FormControl fullWidth disabled={edaProjectsLoading || edaProjects.length === 0}>
                        <InputLabel id="governed-eda-project-label">Governed EDA project</InputLabel>
                        <Select
                          labelId="governed-eda-project-label"
                          label="Governed EDA project"
                          value={edaProjects.some((project) => project.id === value) ? String(value) : ''}
                          onChange={(event) => updateInputField(name, event.target.value)}
                        >
                          {edaProjects.map((project) => (
                            <MenuItem key={project.id} value={project.id}>
                              {project.name} · {project.pdkRef}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : name === 'manifestRecordId' && actionId === 'release-ceremony' ? (
                      <FormControl fullWidth disabled={manifests.length === 0}>
                        <InputLabel id="signed-manifest-label">Retained signed manifest</InputLabel>
                        <Select labelId="signed-manifest-label" label="Retained signed manifest" value={manifests.some((item) => item.id === value) ? String(value) : ''} onChange={(event) => updateInputField(name, event.target.value)}>
                          {manifests.map((item) => <MenuItem key={item.id} value={item.id}>{item.title} · {item.createdAt}</MenuItem>)}
                        </Select>
                        {manifests.length === 0 && <Typography variant="body2">Run Signed tapeout manifest first, then request its independent release approval.</Typography>}
                      </FormControl>
                    ) : value && typeof value === 'object' ? (
                      <StructuredInputField
                        name={name}
                        value={value as Record<string, unknown> | unknown[]}
                        onChange={(next) => updateInputField(name, next)}
                      />
                    ) : typeof value === 'boolean' ? (
                      <FormControl fullWidth>
                        <InputLabel>{name.replaceAll(/[-_]/g, ' ')}</InputLabel>
                        <Select
                          label={name.replaceAll(/[-_]/g, ' ')}
                          value={String(value)}
                          onChange={(event) => updateInputField(name, event.target.value === 'true')}
                        >
                          <MenuItem value="true">true</MenuItem>
                          <MenuItem value="false">false</MenuItem>
                        </Select>
                      </FormControl>
                    ) : (
                      <TextField
                        fullWidth
                        type={typeof value === 'number' ? 'number' : 'text'}
                        label={name.replaceAll(/[-_]/g, ' ')}
                        value={String(value ?? '')}
                        multiline={typeof value === 'string' && (value.includes('\n') || value.length > 100)}
                        minRows={
                          typeof value === 'string' && (value.includes('\n') || value.length > 100) ? 3 : undefined
                        }
                        onChange={(event) =>
                          updateInputField(
                            name,
                            typeof value === 'number' ? Number(event.target.value) : event.target.value
                          )
                        }
                      />
                    )}
                  </Grid>
                ))}
                </Grid>
              </>
            ) : (
              <Alert severity="error">The expert JSON is invalid. Correct it before returning to guided fields.</Alert>
            )
          ) : (
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
          )}
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
              {execution.actionId === 'signed-manifest' && execution.status === 'completed' && recordId && (
                <Stack gap={1} sx={{ mt: 2 }}>
                  <Button variant="outlined" disabled={busy} onClick={() => void requestReleaseApproval()}>Request independent release approval</Button>
                  {approvalNotice && <Alert severity="info">{approvalNotice}</Alert>}
                  <Button component="a" href="/workspace">Open workspace approvals</Button>
                </Stack>
              )}
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
        <Button variant="contained" startIcon={<PlayArrow />} disabled={busy || sandboxProjectUnavailable} onClick={() => void run()}>
          {busy ? 'Running…' : 'Run and retain evidence'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
