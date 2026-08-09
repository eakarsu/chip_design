'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container,
  Divider, LinearProgress, List, ListItem, ListItemIcon, ListItemText, Paper,
  Stack, TextField, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import {
  ArrowBack, AutoAwesome, CheckCircle, FactCheck, Lightbulb, OpenInNew,
  PlayArrow, Refresh, Science, WarningAmber,
} from '@mui/icons-material';
import ProfessionalAIResult from '@/components/ai/ProfessionalAIResult';
import type { AcademyLabDefinition, AcademySubmission, AcademyTutorBrief } from '@/lib/academy/types';

async function api<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || 'Academy request failed');
  return body as T;
}

export default function AcademyLabWorkspace({ lab }: { lab: AcademyLabDefinition }) {
  const [response, setResponse] = useState(lab.starterContent);
  const [evidenceText, setEvidenceText] = useState('');
  const [submission, setSubmission] = useState<AcademySubmission | null>(null);
  const [question, setQuestion] = useState('Review my current draft and identify the most important missing evidence without giving me the complete solution.');
  const [hintLevel, setHintLevel] = useState<1 | 2 | 3>(1);
  const [tutor, setTutor] = useState<(AcademyTutorBrief & { provider: string; model: string }) | null>(null);
  const [busy, setBusy] = useState<'grade' | 'tutor' | ''>('');
  const [error, setError] = useState('');

  const evidence = evidenceText.split('\n').map(item => item.trim()).filter(Boolean);

  function loadEvidenceTemplate() {
    setEvidenceText([
      'Source artifact: git/<commit>/design-source with SHA-256 recorded',
      'Primary report: runs/<run-id>/measured-results.rpt with tool and version provenance',
      'Review record: reviews/<review-id> documenting thresholds, gaps and accountable owner',
    ].join('\n'));
  }

  async function submit() {
    setBusy('grade'); setError('');
    try {
      const result = await api<{ submission: AcademySubmission }>('/api/academy/submissions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labSlug: lab.slug, response, evidence }),
      });
      setSubmission(result.submission);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Lab grading failed'); }
    setBusy('');
  }

  async function coach(level: 1 | 2 | 3) {
    setHintLevel(level); setBusy('tutor'); setError('');
    try {
      const result = await api<{ brief: AcademyTutorBrief; provider: string; model: string }>('/api/academy/tutor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topicSlug: lab.topicSlug, labSlug: lab.slug, question, currentDraft: response, hintLevel: level }),
      });
      setTutor({ ...result.brief, provider: result.provider, model: result.model });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'AI coach request failed'); }
    setBusy('');
  }

  return <Box>
    <Box sx={{ color: 'white', background: 'linear-gradient(135deg,#071426,#0f766e 145%)', py: { xs: 4, md: 6 } }}>
      <Container maxWidth="xl"><Button component={Link} href="/academy" startIcon={<ArrowBack />} sx={{ color: 'rgba(255,255,255,.75)' }}>Academy dashboard</Button><Stack direction="row" gap={1} sx={{ mt: 2 }}><Chip label={lab.level} sx={{ bgcolor: 'rgba(255,255,255,.14)', color: 'white' }} /><Chip label={`${lab.estimatedMinutes} minutes`} variant="outlined" sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }} /><Chip label="Evidence graded" variant="outlined" sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }} /></Stack><Typography component="h1" sx={{ fontSize: { xs: '2.35rem', md: '3.8rem' }, fontWeight: 900, letterSpacing: '-.04em', mt: 1.5 }}>{lab.title}</Typography><Typography sx={{ mt: 1, maxWidth: 900, color: 'rgba(255,255,255,.75)', fontSize: '1.12rem' }}>{lab.objective}</Typography></Container>
    </Box>

    <Container maxWidth="xl" sx={{ py: 4 }}>
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, xl: 8 }}><Stack gap={3}>
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}><Typography variant="h5" fontWeight={850}>Lab procedure</Typography><List>{lab.instructions.map((item, index) => <ListItem key={item} disableGutters><ListItemIcon sx={{ minWidth: 42 }}><Chip size="small" label={index + 1} color="primary" /></ListItemIcon><ListItemText primary={item} /></ListItem>)}</List><Divider sx={{ my: 2 }} /><Typography variant="subtitle1" fontWeight={850}>Required evidence</Typography><List dense>{lab.evidenceRequirements.map(item => <ListItem key={item} disableGutters><ListItemIcon sx={{ minWidth: 30 }}><FactCheck color="primary" fontSize="small" /></ListItemIcon><ListItemText primary={item} /></ListItem>)}</List></Paper>

          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}><Box><Typography variant="overline" color="primary" fontWeight={800}>{lab.editorLanguage.toUpperCase()} LAB ARTIFACT</Typography><Typography variant="h5" fontWeight={850}>Build the reviewable submission</Typography></Box><Button startIcon={<Refresh />} onClick={() => setResponse(lab.starterContent)}>Restore starter</Button></Stack><TextField fullWidth multiline minRows={lab.editorLanguage === 'markdown' ? 20 : 24} value={response} onChange={event => setResponse(event.target.value)} sx={{ mt: 2, '& textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13.5, lineHeight: 1.55 } }} inputProps={{ 'aria-label': 'Lab artifact editor', spellCheck: false }} /><TextField fullWidth multiline minRows={5} label="Evidence references · one per line" value={evidenceText} onChange={event => setEvidenceText(event.target.value)} helperText="Reference source files, reports, run IDs, commits, measurements and review records. Do not paste credentials or proprietary PDK content." sx={{ mt: 2 }} /><Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mt: 2 }}><Button variant="outlined" startIcon={<Science />} onClick={loadEvidenceTemplate}>Fill evidence structure</Button><Button variant="contained" startIcon={busy === 'grade' ? <CircularProgress size={18} color="inherit" /> : <PlayArrow />} disabled={Boolean(busy) || response.trim().length < 20} onClick={() => void submit()}>Grade & save evidence</Button></Stack></Paper>

          {submission && <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, borderWidth: 2, borderColor: submission.grade.passed ? 'success.main' : 'warning.main' }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}><Box><Typography variant="overline" color={submission.grade.passed ? 'success.main' : 'warning.main'} fontWeight={850}>DETERMINISTIC RUBRIC RESULT · ATTEMPT {submission.attempt}</Typography><Typography variant="h4" fontWeight={900}>{submission.grade.passed ? 'Lab passed' : 'Revision required'}</Typography></Box><Box sx={{ minWidth: 180 }}><Typography variant="h3" fontWeight={900} textAlign="right">{submission.grade.score}/100</Typography><LinearProgress variant="determinate" value={submission.grade.score} color={submission.grade.passed ? 'success' : 'warning'} sx={{ height: 9, borderRadius: 8 }} /></Box></Stack><Alert severity={submission.grade.passed ? 'success' : 'warning'} sx={{ mt: 2 }}>{submission.grade.summary}</Alert><Grid container spacing={2} sx={{ mt: 0 }}>{submission.grade.criteria.map(item => <Grid key={item.id} size={{ xs: 12, md: 6 }}><Card variant="outlined" sx={{ height: '100%' }}><CardContent><Stack direction="row" justifyContent="space-between"><Typography fontWeight={850}>{item.label}</Typography><Chip size="small" label={`${item.earned}/${item.points}`} color={item.passed ? 'success' : 'warning'} /></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{item.feedback}</Typography></CardContent></Card></Grid>)}</Grid>{submission.grade.improvements.length > 0 && <Box sx={{ mt: 2 }}><Typography fontWeight={850}>Required improvements</Typography><List dense>{submission.grade.improvements.map(item => <ListItem key={item} disableGutters><ListItemIcon sx={{ minWidth: 30 }}><WarningAmber color="warning" fontSize="small" /></ListItemIcon><ListItemText primary={item} /></ListItem>)}</List></Box>}</Paper>}
        </Stack></Grid>

        <Grid size={{ xs: 12, xl: 4 }}><Stack gap={3} sx={{ position: { xl: 'sticky' }, top: 24 }}>
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}><Stack direction="row" gap={1} alignItems="center"><AutoAwesome color="primary" /><Typography variant="h5" fontWeight={850}>AI engineering coach</Typography></Stack><Typography color="text.secondary" sx={{ mt: 1 }}>Ask for progressive guidance grounded in this lesson and rubric. The coach cannot certify a tool run or reveal the complete graded solution.</Typography><TextField fullWidth multiline minRows={4} label="Question for your coach" value={question} onChange={event => setQuestion(event.target.value)} sx={{ mt: 2 }} /><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>Progressive hint level</Typography><Stack direction={{ xs: 'column', sm: 'row', xl: 'column' }} gap={1} sx={{ mt: 1 }}>{([1, 2, 3] as const).map(level => <Button key={level} variant={hintLevel === level ? 'contained' : 'outlined'} startIcon={busy === 'tutor' && hintLevel === level ? <CircularProgress size={17} /> : <Lightbulb />} disabled={Boolean(busy) || question.trim().length < 8} onClick={() => void coach(level)}>Level {level} · {level === 1 ? 'Conceptual' : level === 2 ? 'Targeted' : 'Illustrative'}</Button>)}</Stack></Paper>
          {tutor && <ProfessionalAIResult title="Curriculum-grounded coaching brief" result={tutor} showDisclaimer />}
          <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}><Typography variant="h6" fontWeight={850}>Connected engineering tools</Typography><Stack gap={1} sx={{ mt: 2 }}>{lab.toolLinks.map(tool => <Button key={tool.href} component={Link} href={tool.href} target="_blank" variant="outlined" endIcon={<OpenInNew />} sx={{ justifyContent: 'space-between' }}>{tool.label}</Button>)}</Stack><Alert severity="info" icon={<CheckCircle />} sx={{ mt: 2 }}>Tool output is evidence only when its inputs, versions, units and provenance are retained.</Alert></Paper>
        </Stack></Grid>
      </Grid>
    </Container>
  </Box>;
}
