'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container,
  Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { AdminPanelSettings, Assignment, CheckCircle, Groups, WarningAmber } from '@mui/icons-material';

type InstructorData = {
  learners: Array<{ userId: string; pathSlug: string; status: string; diagnosticScore: number | null; completedModules: number; averageScore: number; startedAt: string }>;
  capstones: Array<{ id: string; userId: string; title: string; status: string; score: number; feedback: string; updatedAt: string }>;
  atRisk: Array<{ topicSlug: string; attempts: number; averageScore: number }>;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || 'Instructor request failed');
  return body as T;
}

export default function InstructorAcademyPage() {
  const [data, setData] = useState<InstructorData | null>(null);
  const [error, setError] = useState('');
  const [review, setReview] = useState<{ id: string; status: 'approved' | 'revision-required'; feedback: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError('');
    try { setData((await request<{ instructor: InstructorData }>('/api/academy/instructor')).instructor); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Instructor dashboard unavailable'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function decide() {
    if (!review) return;
    setBusy(true); setError('');
    try {
      const result = await request<{ instructor: InstructorData }>('/api/academy/instructor', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(review) });
      setData(result.instructor); setReview(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Review could not be saved'); }
    setBusy(false);
  }

  if (!data && !error) return <Container sx={{ py: 8 }}><CircularProgress /></Container>;
  return <Container maxWidth="xl" sx={{ py: 5 }}>
    <Stack direction="row" gap={1} alignItems="center"><AdminPanelSettings color="primary" /><Typography variant="overline" color="primary" fontWeight={850}>INSTRUCTOR OPERATIONS</Typography></Stack><Typography component="h1" variant="h3" fontWeight={900}>Academy oversight</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Monitor mastery evidence, identify struggling modules and make accountable capstone decisions.</Typography>
    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    {data && <>
      <Grid container spacing={2} sx={{ mt: 2 }}>{[[data.learners.length, 'active learners', <Groups key="g" />], [data.capstones.filter(item => item.status === 'submitted').length, 'capstones pending', <Assignment key="a" />], [data.atRisk.length, 'modules requiring attention', <WarningAmber key="w" />]].map(([value, label, icon]) => <Grid key={String(label)} size={{ xs: 12, md: 4 }}><Card variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between" color="primary.main">{icon}<Typography variant="h3" fontWeight={900}>{value}</Typography></Stack><Typography color="text.secondary">{label}</Typography></CardContent></Card></Grid>)}</Grid>
      <Grid container spacing={3} sx={{ mt: 1 }}><Grid size={{ xs: 12, lg: 8 }}><Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}><Typography variant="h5" fontWeight={850}>Learner mastery</Typography><Stack gap={1.5} sx={{ mt: 2 }}>{data.learners.map(item => <Stack key={item.userId} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}><Box><Typography fontWeight={850}>{item.userId}</Typography><Typography variant="body2" color="text.secondary">{item.pathSlug} · joined {new Date(item.startedAt).toLocaleDateString()}</Typography></Box><Stack direction="row" gap={1}><Chip label={`${item.completedModules}/21 passed`} color={item.completedModules === 21 ? 'success' : 'primary'} /><Chip label={`${item.averageScore}% avg`} variant="outlined" /><Chip label={item.diagnosticScore === null ? 'No diagnostic' : `${item.diagnosticScore}% diagnostic`} variant="outlined" /></Stack></Stack>)}{!data.learners.length && <Alert severity="info">No Academy learners are enrolled for this tenant.</Alert>}</Stack></Paper>
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mt: 3 }}><Typography variant="h5" fontWeight={850}>Capstone review queue</Typography><Stack gap={1.5} sx={{ mt: 2 }}>{data.capstones.map(item => <Stack key={item.id} direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}><Box><Typography fontWeight={850}>{item.title}</Typography><Typography variant="body2" color="text.secondary">Learner {item.userId} · {item.score}/100 · {item.status}</Typography><Typography variant="body2" sx={{ mt: 0.5 }}>{item.feedback}</Typography></Box><Stack direction="row" gap={1}><Button color="warning" variant="outlined" onClick={() => setReview({ id: item.id, status: 'revision-required', feedback: 'Revision required: provide specific instructor feedback and cite the evidence gap before resubmission.' })}>Request revision</Button><Button color="success" variant="contained" startIcon={<CheckCircle />} disabled={item.status !== 'submitted'} onClick={() => setReview({ id: item.id, status: 'approved', feedback: 'Approved after instructor review of the retained requirements, RTL, verification, PPA and signoff evidence.' })}>Approve</Button></Stack></Stack>)}{!data.capstones.length && <Alert severity="info">No capstone packages have been saved.</Alert>}</Stack></Paper></Grid>
      <Grid size={{ xs: 12, lg: 4 }}><Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}><Typography variant="h5" fontWeight={850}>Learning-risk signals</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Modules with repeated unsuccessful submissions.</Typography><Stack gap={1.5} sx={{ mt: 2 }}>{data.atRisk.map(item => <Box key={item.topicSlug} sx={{ p: 2, bgcolor: 'warning.50', borderRadius: 2 }}><Typography fontWeight={850}>{item.topicSlug.replace(/-/g, ' ')}</Typography><Typography variant="body2">{item.attempts} revision attempts · {item.averageScore}% average</Typography></Box>)}{!data.atRisk.length && <Alert severity="success">No repeated unsuccessful submissions.</Alert>}</Stack></Paper></Grid></Grid>
    </>}
    <Dialog open={Boolean(review)} onClose={() => !busy && setReview(null)} fullWidth maxWidth="sm"><DialogTitle>Accountable capstone decision</DialogTitle><DialogContent><Alert severity={review?.status === 'approved' ? 'success' : 'warning'} sx={{ mb: 2 }}>This decision is retained in the tenant audit trail.</Alert><TextField fullWidth multiline minRows={5} label="Evidence-based instructor feedback" value={review?.feedback ?? ''} onChange={event => setReview(current => current ? { ...current, feedback: event.target.value } : current)} /></DialogContent><DialogActions><Button onClick={() => setReview(null)} disabled={busy}>Cancel</Button><Button variant="contained" disabled={busy || (review?.feedback.length ?? 0) < 20} onClick={() => void decide()}>{busy ? 'Saving…' : 'Record decision'}</Button></DialogActions></Dialog>
  </Container>;
}
