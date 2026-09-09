'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container,
  Divider, FormControl, InputLabel, LinearProgress, MenuItem, Paper, Select,
  Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import {
  ArrowForward, AssignmentTurnedIn, AutoStories, EmojiEvents, FactCheck,
  PlayArrow, Psychology, Route, Save, School, Science,
} from '@mui/icons-material';
import type { AcademyCapstone, AcademyDashboard as Dashboard } from '@/lib/academy/types';

const capstoneDefinition = {
  title: 'Pipelined Vector MAC Accelerator',
  brief: 'Specify, implement, verify and analyze a parameterized vector multiply-accumulate block. Produce traceable evidence from requirements through RTL, verification, synthesis, timing and PPA review.',
  requiredEvidence: [
    'Versioned requirements and architecture decision record',
    'RTL and interface specification',
    'Verification plan, assertions and test results',
    'Synthesis, timing, area and power evidence',
    'Known limitations, risk register and accountable signoff decision',
  ],
};

type DiagnosticQuestion = { id: string; domain: string; question: string; options: string[] };
type DiagnosticResult = { score: number; correctCount: number; recommendedLevel: string; domains: Array<{ id: string; domain: string; correct: boolean; explanation: string }> };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || 'Academy request failed');
  return body as T;
}

export default function AcademyDashboardPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [questions, setQuestions] = useState<DiagnosticQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [capstoneForm, setCapstoneForm] = useState({ title: capstoneDefinition.title, specification: '', architecture: '', verificationPlan: '', evidence: '' });

  const load = useCallback(async () => {
    setError('');
    try {
      const [{ dashboard: loaded }, { questions: diagnostic }] = await Promise.all([
        api<{ dashboard: Dashboard }>('/api/academy/dashboard'),
        api<{ questions: DiagnosticQuestion[] }>('/api/academy/diagnostic'),
      ]);
      setDashboard(loaded);
      setQuestions(diagnostic);
      if (loaded.capstone) setCapstoneForm({
        title: loaded.capstone.title,
        specification: loaded.capstone.specification,
        architecture: loaded.capstone.architecture,
        verificationPlan: loaded.capstone.verificationPlan,
        evidence: loaded.capstone.evidence.join('\n'),
      });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Academy could not be loaded'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const progressByTopic = useMemo(() => new Map(dashboard?.progress.map(item => [item.topicSlug, item]) ?? []), [dashboard]);

  async function choosePath(pathSlug: string) {
    setBusy(true); setError('');
    try {
      const result = await api<{ dashboard: Dashboard }>('/api/academy/dashboard', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pathSlug }) });
      setDashboard(result.dashboard); setNotice('Learning path updated.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Path update failed'); }
    setBusy(false);
  }

  async function submitDiagnostic() {
    setBusy(true); setError('');
    try {
      const result = await api<{ result: DiagnosticResult }>('/api/academy/diagnostic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) });
      setDiagnosticResult(result.result); setNotice(`Diagnostic completed: ${result.result.score}%.`); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Diagnostic submission failed'); }
    setBusy(false);
  }

  async function saveCapstone(submit: boolean) {
    setBusy(true); setError('');
    try {
      const payload = { ...capstoneForm, evidence: capstoneForm.evidence.split('\n').map(item => item.trim()).filter(Boolean), submit };
      const result = await api<{ capstone: AcademyCapstone }>('/api/academy/capstone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setDashboard(current => current ? { ...current, capstone: result.capstone } : current);
      setNotice(submit ? 'Capstone submitted for instructor review.' : 'Capstone draft saved.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Capstone save failed'); }
    setBusy(false);
  }

  if (!dashboard && !error) return <Container sx={{ py: 8 }}><Stack alignItems="center" gap={2}><CircularProgress /><Typography>Loading your engineering curriculum…</Typography></Stack></Container>;
  if (!dashboard) return <Container sx={{ py: 8 }}><Alert severity="error">{error}</Alert></Container>;

  const stats = [
    [dashboard.summary.completionPct, '% complete', <School key="s" />],
    [dashboard.summary.completedModules, 'modules passed', <AssignmentTurnedIn key="a" />],
    [dashboard.summary.averageScore, 'average score', <FactCheck key="f" />],
    [dashboard.enrollment.diagnosticScore ?? '—', 'diagnostic', <Psychology key="p" />],
  ] as const;

  return <Box>
    <Box sx={{ color: 'white', background: 'linear-gradient(135deg,#071426,#312e81 120%)', py: { xs: 5, md: 7 } }}>
      <Container maxWidth="xl">
        <Stack direction="row" gap={1} flexWrap="wrap"><Chip label="MASTERY WORKSPACE" sx={{ bgcolor: 'rgba(255,255,255,.14)', color: 'white' }} /><Chip label={dashboard.enrollment.status} variant="outlined" sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }} /></Stack>
        <Button component={Link} href="/workspace/projects" variant="contained" sx={{ mt: 2 }}>Build an executable design project</Button>
        <Typography component="h1" sx={{ fontSize: { xs: '2.5rem', md: '4rem' }, fontWeight: 900, letterSpacing: '-.04em', mt: 2 }}>Chip Design Academy</Typography>
        <Typography sx={{ mt: 1.5, maxWidth: 850, color: 'rgba(255,255,255,.75)', fontSize: '1.15rem' }}>Learn, execute, submit evidence, receive deterministic grading and advance through accountable engineering review.</Typography>
        <LinearProgress variant="determinate" value={dashboard.summary.completionPct} sx={{ mt: 3, maxWidth: 800, height: 10, borderRadius: 8, bgcolor: 'rgba(255,255,255,.15)' }} />
      </Container>
    </Box>

    <Container maxWidth="xl" sx={{ py: 4 }}>
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
      <Grid container spacing={2}>{stats.map(([value, label, icon]) => <Grid key={label} size={{ xs: 6, md: 3 }}><Card variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between" color="primary.main">{icon}<Typography variant="h4" fontWeight={900}>{value}</Typography></Stack><Typography color="text.secondary">{label}</Typography></CardContent></Card></Grid>)}</Grid>

      <Paper variant="outlined" sx={{ mt: 3 }}><Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto"><Tab label="Overview" /><Tab label="Curriculum & labs" /><Tab label="Diagnostic" /><Tab label="Capstone" /></Tabs></Paper>

      {tab === 0 && <Grid container spacing={3} sx={{ mt: 1 }}>
        <Grid size={{ xs: 12, lg: 7 }}><Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}><Typography variant="overline" color="primary" fontWeight={800}>ACTIVE LEARNING PATH</Typography><Typography variant="h4" fontWeight={900}>Choose your professional outcome</Typography><FormControl fullWidth sx={{ mt: 2 }}><InputLabel>Learning path</InputLabel><Select value={dashboard.enrollment.pathSlug} label="Learning path" disabled={busy} onChange={event => void choosePath(event.target.value)}>{dashboard.paths.map(path => <MenuItem key={path.slug} value={path.slug}>{path.title} · {path.modules} modules</MenuItem>)}</Select></FormControl>{dashboard.paths.filter(path => path.slug === dashboard.enrollment.pathSlug).map(path => <Alert key={path.slug} severity="info" icon={<Route />} sx={{ mt: 2 }}>{path.description}</Alert>)}</Paper></Grid>
        <Grid size={{ xs: 12, lg: 5 }}><Paper variant="outlined" sx={{ p: 3, borderRadius: 3, height: '100%' }}><Typography variant="overline" color="primary" fontWeight={800}>NEXT ACTION</Typography><Typography variant="h5" fontWeight={850}>Continue with evidence</Typography>{dashboard.labs.find(lab => progressByTopic.get(lab.topicSlug)?.status !== 'passed') ? (() => { const lab = dashboard.labs.find(item => progressByTopic.get(item.topicSlug)?.status !== 'passed')!; return <Box sx={{ mt: 2 }}><Chip label={lab.level} /><Typography variant="h6" fontWeight={800} sx={{ mt: 1 }}>{lab.title}</Typography><Typography color="text.secondary">{lab.objective}</Typography><Button component={Link} href={`/academy/labs/${lab.slug}`} variant="contained" endIcon={<ArrowForward />} sx={{ mt: 2 }}>Open lab</Button></Box>; })() : <Alert severity="success" sx={{ mt: 2 }}>All curriculum labs passed. Submit the capstone for final review.</Alert>}</Paper></Grid>
        <Grid size={{ xs: 12 }}><Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}><Typography variant="h5" fontWeight={850}>Recent evidence</Typography><Stack gap={1.5} sx={{ mt: 2 }}>{dashboard.submissions.slice(0, 5).map(item => <Stack key={item.id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}><Box><Typography fontWeight={800}>{dashboard.labs.find(lab => lab.slug === item.labSlug)?.title ?? item.labSlug}</Typography><Typography variant="body2" color="text.secondary">Attempt {item.attempt} · {new Date(item.createdAt).toLocaleString()}</Typography></Box><Chip label={`${item.grade.score}/100 · ${item.grade.passed ? 'passed' : 'revision'}`} color={item.grade.passed ? 'success' : 'warning'} /></Stack>)}{!dashboard.submissions.length && <Alert severity="info">No lab submissions yet. Open the first evidence lab to begin.</Alert>}</Stack></Paper></Grid>
      </Grid>}

      {tab === 1 && <Grid container spacing={2.5} sx={{ mt: 1 }}>{dashboard.labs.map((lab, index) => { const item = progressByTopic.get(lab.topicSlug); return <Grid key={lab.slug} size={{ xs: 12, md: 6, xl: 4 }}><Card variant="outlined" sx={{ height: '100%', borderRadius: 3, borderTop: 4, borderTopColor: item?.status === 'passed' ? 'success.main' : item ? 'warning.main' : 'primary.main' }}><CardContent><Stack direction="row" justifyContent="space-between" gap={1}><Chip label={`Module ${index + 1}`} size="small" /><Chip label={item?.status ?? 'not started'} size="small" color={item?.status === 'passed' ? 'success' : item ? 'warning' : 'default'} /></Stack><Typography variant="h6" fontWeight={850} sx={{ mt: 2 }}>{lab.title}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>{lab.objective}</Typography><Stack direction="row" gap={1} sx={{ mt: 2 }}><Chip size="small" label={lab.level} /><Chip size="small" variant="outlined" label={`${lab.estimatedMinutes} min`} />{item && <Chip size="small" variant="outlined" label={`Best ${item.bestScore}`} />}</Stack><Button component={Link} href={`/academy/labs/${lab.slug}`} endIcon={<ArrowForward />} sx={{ mt: 2 }}>{item ? 'Continue lab' : 'Start lab'}</Button></CardContent></Card></Grid>; })}</Grid>}

      {tab === 2 && <Box sx={{ mt: 3, maxWidth: 980 }}><Stack direction="row" gap={1} alignItems="center"><Psychology color="primary" /><Typography variant="h4" fontWeight={900}>Readiness diagnostic</Typography></Stack><Typography color="text.secondary" sx={{ mt: 1 }}>This assessment identifies your starting level. It does not replace lab evidence or instructor review.</Typography><Stack gap={2} sx={{ mt: 3 }}>{questions.map((question, index) => <Paper key={question.id} variant="outlined" sx={{ p: 3, borderRadius: 3 }}><Chip size="small" label={question.domain} /><Typography fontWeight={800} sx={{ mt: 1.5 }}>{index + 1}. {question.question}</Typography><FormControl fullWidth sx={{ mt: 2 }}><InputLabel>Answer</InputLabel><Select value={answers[question.id] ?? ''} label="Answer" onChange={event => setAnswers(current => ({ ...current, [question.id]: Number(event.target.value) }))}>{question.options.map((option, optionIndex) => <MenuItem key={option} value={optionIndex}>{option}</MenuItem>)}</Select></FormControl></Paper>)}<Button variant="contained" startIcon={busy ? <CircularProgress size={18} /> : <FactCheck />} disabled={busy || Object.keys(answers).length !== questions.length} onClick={() => void submitDiagnostic()}>Grade diagnostic</Button>{diagnosticResult && <Paper sx={{ p: 3, borderRadius: 3, bgcolor: 'success.50' }}><Typography variant="h4" fontWeight={900}>{diagnosticResult.score}% · {diagnosticResult.recommendedLevel}</Typography><Typography>{diagnosticResult.correctCount} of {questions.length} answers correct.</Typography><Divider sx={{ my: 2 }} />{diagnosticResult.domains.map(item => <Alert key={item.id} severity={item.correct ? 'success' : 'warning'} sx={{ mb: 1 }}>{item.domain}: {item.explanation}</Alert>)}</Paper>}</Stack></Box>}

      {tab === 3 && <Box sx={{ mt: 3 }}><Stack direction="row" gap={1} alignItems="center"><EmojiEvents color="primary" /><Typography variant="h4" fontWeight={900}>Capstone review package</Typography></Stack><Alert severity="info" sx={{ mt: 2 }}>{capstoneDefinition.brief}</Alert><Grid container spacing={3} sx={{ mt: 0 }}><Grid size={{ xs: 12, lg: 8 }}><Stack gap={2}><TextField label="Capstone title" value={capstoneForm.title} onChange={event => setCapstoneForm(current => ({ ...current, title: event.target.value }))} /><TextField label="Measurable specification" multiline minRows={7} value={capstoneForm.specification} onChange={event => setCapstoneForm(current => ({ ...current, specification: event.target.value }))} /><TextField label="Architecture and tradeoffs" multiline minRows={7} value={capstoneForm.architecture} onChange={event => setCapstoneForm(current => ({ ...current, architecture: event.target.value }))} /><TextField label="Verification and signoff plan" multiline minRows={7} value={capstoneForm.verificationPlan} onChange={event => setCapstoneForm(current => ({ ...current, verificationPlan: event.target.value }))} /><TextField label="Evidence references · one per line" multiline minRows={6} value={capstoneForm.evidence} onChange={event => setCapstoneForm(current => ({ ...current, evidence: event.target.value }))} /><Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Button variant="outlined" startIcon={<Save />} disabled={busy} onClick={() => void saveCapstone(false)}>Save draft</Button><Button variant="contained" startIcon={<PlayArrow />} disabled={busy} onClick={() => void saveCapstone(true)}>Submit for review</Button></Stack></Stack></Grid><Grid size={{ xs: 12, lg: 4 }}><Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}><Typography variant="h6" fontWeight={850}>Required evidence</Typography><Stack gap={1} sx={{ mt: 2 }}>{capstoneDefinition.requiredEvidence.map(item => <Stack key={item} direction="row" gap={1}><Science color="primary" fontSize="small" /><Typography variant="body2">{item}</Typography></Stack>)}</Stack>{dashboard.capstone && <><Divider sx={{ my: 2 }} /><Chip label={dashboard.capstone.status} color={dashboard.capstone.status === 'approved' ? 'success' : dashboard.capstone.status === 'revision-required' ? 'warning' : 'primary'} /><Typography variant="h4" fontWeight={900} sx={{ mt: 1 }}>{dashboard.capstone.score}/100</Typography><Typography color="text.secondary">{dashboard.capstone.feedback}</Typography></>}</Paper></Grid></Grid></Box>}
    </Container>
  </Box>;
}
