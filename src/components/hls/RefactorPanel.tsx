'use client';

/**
 * Refactor tab: deterministic synthesizability scan plus a governed LLM draft.
 *
 * The scan is a Server Action that runs the same textual heuristics as the
 * backend scanner. The draft comes from POST /api/hls/refactor, which requires
 * an admin/editor workspace identity; a 401 renders a sign-in path instead of a
 * generic failure. Neither step compiles, simulates, or synthesizes anything,
 * and the UI says so wherever a draft is shown.
 */
import { useState } from 'react';
import Link from 'next/link';
import {
  Alert,
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
import SearchIcon from '@mui/icons-material/Search';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import type { RefactorAnalysis, RefactorDraftResponse } from './types';
import { isForbidden, isUnauthorized, apiPost } from './api';
import { CodeBlock, NotesAlerts, SeverityChip } from './ui';
import { scanSource } from '../../../app/hls/actions';

function CaveatList({ caveats }: { caveats: string[] }) {
  if (caveats.length === 0) return null;
  return (
    <Stack gap={0.5}>
      <Typography variant="subtitle1" fontWeight={700}>
        Draft caveats (as stated by the model)
      </Typography>
      {caveats.map((caveat, index) => (
        <Alert key={`${index}-${caveat.slice(0, 24)}`} severity="warning" sx={{ py: 0.25 }}>
          <Typography variant="body2">{caveat}</Typography>
        </Alert>
      ))}
    </Stack>
  );
}

export default function RefactorPanel() {
  const [source, setSource] = useState('');
  const [filename, setFilename] = useState('');
  const [targetTool, setTargetTool] = useState('');
  const [maxFindings, setMaxFindings] = useState('');
  const [scanned, setScanned] = useState<RefactorAnalysis | null>(null);
  const [draftResult, setDraftResult] = useState<RefactorDraftResponse | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [scanError, setScanError] = useState('');
  const [draftError, setDraftError] = useState('');
  const [draftUnauthorized, setDraftUnauthorized] = useState(false);
  const [draftForbidden, setDraftForbidden] = useState(false);

  const runScan = async () => {
    if (source.trim().length === 0) {
      setScanError('Paste a source file before scanning.');
      return;
    }
    setScanBusy(true);
    setScanError('');
    try {
      const result = await scanSource(source, filename);
      setScanned(result);
    } catch (reason) {
      setScanError(reason instanceof Error ? reason.message : 'Scan failed');
    } finally {
      setScanBusy(false);
    }
  };

  const runDraft = async () => {
    if (source.trim().length < 20) {
      setDraftError('The draft endpoint requires at least 20 characters of source.');
      return;
    }
    const trimmedFindings = maxFindings.trim();
    if (trimmedFindings) {
      const value = Number(trimmedFindings);
      if (!Number.isInteger(value) || value < 1 || value > 100) {
        setDraftError('maxFindings must be an integer between 1 and 100.');
        return;
      }
    }
    setDraftBusy(true);
    setDraftError('');
    setDraftUnauthorized(false);
    setDraftForbidden(false);
    try {
      const response = await apiPost<RefactorDraftResponse>('/api/hls/refactor', {
        source,
        ...(filename.trim() ? { filename: filename.trim() } : {}),
        ...(targetTool.trim() ? { targetTool: targetTool.trim() } : {}),
        ...(trimmedFindings ? { maxFindings: Number(trimmedFindings) } : {}),
      });
      setDraftResult(response);
      setScanned(response.analysis);
    } catch (reason) {
      if (isUnauthorized(reason)) {
        setDraftUnauthorized(true);
      } else if (isForbidden(reason)) {
        setDraftForbidden(true);
      } else {
        setDraftError(reason instanceof Error ? reason.message : 'Draft request failed');
      }
    } finally {
      setDraftBusy(false);
    }
  };

  const analysis = scanned ?? draftResult?.analysis ?? null;
  const baseName = (filename.trim() || 'kernel').replace(/[^A-Za-z0-9_.-]/g, '_');
  const rewrittenFilename = `refactored_${baseName.includes('.') ? baseName : `${baseName}.c`}`;
  const testbenchFilename = `tb_${baseName.includes('.') ? baseName : `${baseName}.c`}`;

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        First run the deterministic heuristic scan (textual, no AST, no macro expansion) to list
        constructs that block common HLS flows. Then, if signed in as an editor or admin, ask for an
        LLM refactoring draft. The draft is never compiled, simulated, or synthesized here.
      </Typography>

      <TextField
        label="Source"
        value={source}
        onChange={(event) => setSource(event.target.value)}
        multiline
        minRows={10}
        maxRows={26}
        fullWidth
        placeholder="Paste a C/C++ kernel here"
        helperText={`${source.length.toLocaleString()} characters; the draft endpoint accepts 20–24000`}
        inputProps={{ 'aria-label': 'Refactor source', spellCheck: false, style: { fontFamily: 'monospace', fontSize: 13 } }}
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
        <TextField
          size="small"
          label="Filename (optional)"
          value={filename}
          onChange={(event) => setFilename(event.target.value)}
          sx={{ flex: 1 }}
          helperText="shown in scan notes and used for download names"
        />
        <TextField
          size="small"
          label="Target tool hint (optional)"
          value={targetTool}
          onChange={(event) => setTargetTool(event.target.value)}
          sx={{ flex: 2 }}
          placeholder="e.g. AMBA AXI-Stream kernel"
        />
        <TextField
          size="small"
          type="number"
          label="maxFindings (optional)"
          value={maxFindings}
          onChange={(event) => setMaxFindings(event.target.value)}
          sx={{ flex: 1 }}
          helperText="1–100, sent to the model"
        />
      </Stack>

      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
        <Button variant="contained" startIcon={<SearchIcon />} disabled={scanBusy || draftBusy} onClick={() => void runScan()}>
          Scan source
        </Button>
        <Button
          variant="outlined"
          startIcon={<AutoFixHighIcon />}
          disabled={scanBusy || draftBusy}
          onClick={() => void runDraft()}
        >
          Draft refactor (governed)
        </Button>
        {(scanBusy || draftBusy) && <CircularProgress size={20} />}
      </Stack>

      {scanError && <Alert severity="error">{scanError}</Alert>}
      {draftUnauthorized && (
        <Alert severity="warning">
          Refactor drafts are governed and require a signed-in editor or admin.{' '}
          <Button component={Link} href={`/login?redirect=${encodeURIComponent('/hls')}`} size="small">
            Sign in
          </Button>
        </Alert>
      )}
      {draftForbidden && (
        <Alert severity="warning">
          Your workspace identity does not have the editor or admin role this governed operation
          requires.
        </Alert>
      )}
      {draftError && <Alert severity="error">{draftError}</Alert>}

      {analysis && (
        <Stack gap={1.5}>
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <Typography variant="h6">Deterministic scan</Typography>
            <Chip size="small" color="info" label={analysis.label} />
            <Chip size="small" color={analysis.heuristicVerdict === 'blocking constructs detected' ? 'error' : 'success'} label={analysis.heuristicVerdict} />
            <Chip size="small" variant="outlined" label={`${analysis.counts.errors} error(s)`} color={analysis.counts.errors ? 'error' : 'default'} />
            <Chip size="small" variant="outlined" label={`${analysis.counts.warnings} warning(s)`} color={analysis.counts.warnings ? 'warning' : 'default'} />
            <Chip size="small" variant="outlined" label={`${analysis.counts.infos} info(s)`} />
            <Chip size="small" variant="outlined" label={`${analysis.source.lines} line(s) · hash ${analysis.source.hash.slice(0, 12)}`} />
          </Stack>

          {analysis.findings.length === 0 ? (
            <Alert severity="success">
              No heuristic findings. This is not proof of synthesizability: the target tool&apos;s
              compiler and synthesis run remain mandatory.
            </Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Severity</TableCell>
                    <TableCell>Class</TableCell>
                    <TableCell>Line</TableCell>
                    <TableCell>Message</TableCell>
                    <TableCell>Suggestion</TableCell>
                    <TableCell>Evidence</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analysis.findings.map((finding, index) => (
                    <TableRow key={`${finding.code}-${finding.line}-${finding.column}-${index}`}>
                      <TableCell>
                        <SeverityChip severity={finding.severity} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {finding.code}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {finding.line}:{finding.column}
                      </TableCell>
                      <TableCell>{finding.message}</TableCell>
                      <TableCell>{finding.suggestion}</TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {finding.evidence || '—'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <NotesAlerts title="Scan notes" notes={analysis.notes} />
        </Stack>
      )}

      {draftResult && (
        <Stack gap={2}>
          <Alert severity="info" icon={false}>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <Chip size="small" color="warning" label={draftResult.label} />
              <Typography variant="body2" component="span">
                model: {draftResult.model}
              </Typography>
            </Stack>
          </Alert>

          <Alert severity="warning">
            {draftResult.verification.note}
          </Alert>

          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip size="small" variant="outlined" label={`draft scan: ${draftResult.draftScan.counts.errors} error(s), ${draftResult.draftScan.counts.warnings} warning(s), ${draftResult.draftScan.counts.infos} info(s)`} />
            <Chip
              size="small"
              color={draftResult.draftScan.heuristicVerdict === 'blocking constructs detected' ? 'error' : 'success'}
              label={`draft scan verdict: ${draftResult.draftScan.heuristicVerdict}`}
            />
          </Stack>

          <CodeBlock title={`Rewritten source (draft) — ${rewrittenFilename}`} code={draftResult.draft.rewrittenSource} filename={rewrittenFilename} maxHeight={520} />
          <CodeBlock title={`Test scaffold (draft) — ${testbenchFilename}`} code={draftResult.draft.testbench} filename={testbenchFilename} maxHeight={520} />

          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Rationale (as stated by the model)
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {draftResult.draft.rationale}
            </Typography>
          </Paper>

          <CaveatList caveats={draftResult.draft.caveats} />

          {draftResult.draft.retainedBehavior && draftResult.draft.retainedBehavior.length > 0 && (
            <Stack gap={0.5}>
              <Typography variant="subtitle1" fontWeight={700}>
                Behaviour the model believes is retained
              </Typography>
              {draftResult.draft.retainedBehavior.map((item) => (
                <Alert key={item} severity="info" sx={{ py: 0.25 }}>
                  <Typography variant="body2">{item}</Typography>
                </Alert>
              ))}
            </Stack>
          )}

          <NotesAlerts title="Draft notes" notes={draftResult.notes} />
        </Stack>
      )}
    </Stack>
  );
}
