'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, LinearProgress, Stack, Typography } from '@mui/material';
import type { MasteryLevel, MasterySummary } from '@/lib/academy/mastery';

const barColor: Record<MasteryLevel, 'primary' | 'warning' | 'info' | 'success'> = {
  'not-started': 'primary',
  developing: 'warning',
  proficient: 'info',
  mastered: 'success',
};

const chipColor: Record<MasteryLevel, 'default' | 'warning' | 'info' | 'success'> = {
  'not-started': 'default',
  developing: 'warning',
  proficient: 'info',
  mastered: 'success',
};

async function api<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || 'Mastery request failed');
  return body as T;
}

export default function MasteryPanel() {
  const [summary, setSummary] = useState<MasterySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSummary(await api<MasterySummary>('/api/academy/mastery'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Mastery could not be loaded');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <Card variant="outlined" sx={{ mt: 3, borderRadius: 3 }}>
    <CardContent>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} gap={1.5}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>MASTERY</Typography>
          <Typography variant="h5" fontWeight={850}>Evidence-backed progress</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 640 }}>Read-only summary aggregated from graded labs, executed challenge fixes and approved capstones.</Typography>
        </Box>
        {summary && <Box sx={{ minWidth: 220, width: { xs: '100%', sm: 220 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline"><Typography variant="h4" fontWeight={900}>{summary.overallPct}%</Typography><Typography variant="caption" color="text.secondary">overall</Typography></Stack>
          <LinearProgress variant="determinate" value={summary.overallPct} sx={{ height: 9, borderRadius: 8 }} />
        </Box>}
      </Stack>

      {loading && <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={28} /><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Aggregating mastery evidence…</Typography></Stack>}

      {!loading && error && <Alert severity="error" sx={{ mt: 2 }} action={<Button size="small" onClick={() => void load()}>Retry</Button>}>{error}</Alert>}

      {!loading && !error && summary && (summary.topics.length === 0
        ? <Alert severity="info" sx={{ mt: 2 }}>No curriculum topics are available yet.</Alert>
        : <Box sx={{ mt: 2, maxHeight: 340, overflowY: 'auto', pr: 0.5 }}>
            <Stack gap={1.5}>
              {summary.topics.map(topic => <Box key={topic.id}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                  <Typography variant="body2" fontWeight={750} noWrap title={topic.title}>{topic.title}</Typography>
                  <Stack direction="row" gap={0.75} alignItems="center" flexShrink={0}>
                    <Chip size="small" label={topic.level} color={chipColor[topic.level]} variant={topic.level === 'not-started' ? 'outlined' : 'filled'} />
                    <Typography variant="body2" fontWeight={800} sx={{ minWidth: 36, textAlign: 'right' }}>{topic.pct}%</Typography>
                  </Stack>
                </Stack>
                <LinearProgress variant="determinate" value={topic.pct} color={barColor[topic.level]} sx={{ mt: 0.5, height: 6, borderRadius: 8 }} />
                <Typography variant="caption" color="text.secondary">{topic.evidence.gradedLabs} graded · {topic.evidence.passedLabs} passed · {topic.evidence.challengeFixes} challenge fixes · {topic.evidence.capstones} capstones</Typography>
              </Box>)}
            </Stack>
          </Box>)}
    </CardContent>
  </Card>;
}
