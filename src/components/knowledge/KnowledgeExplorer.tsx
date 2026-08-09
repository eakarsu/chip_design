'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Box, Button, Card, CardActionArea, CardContent, Chip, InputAdornment, MenuItem,
  Stack, TextField, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { AccessTime, ArrowForward, Search, School } from '@mui/icons-material';
import type { KnowledgeTopic } from '@/lib/knowledge/types';
import { phaseColors } from '@/lib/knowledge/catalog';

export default function KnowledgeExplorer({ topics }: { topics: KnowledgeTopic[] }) {
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState('All phases');
  const phases = useMemo(() => ['All phases', ...new Set(topics.map(topic => topic.phase))], [topics]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return topics.filter(topic => {
      if (phase !== 'All phases' && topic.phase !== phase) return false;
      if (!normalized) return true;
      const haystack = [topic.title, topic.description, topic.phase, ...topic.keywords, ...topic.concepts.map(item => item.term)].join(' ').toLowerCase();
      return haystack.includes(normalized);
    });
  }, [phase, query, topics]);

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} sx={{ mb: 3 }}>
        <TextField
          fullWidth
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search timing, RTL, packaging, DFT, analog, tapeout…"
          aria-label="Search the chip design curriculum"
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
        />
        <TextField select value={phase} onChange={event => setPhase(event.target.value)} sx={{ minWidth: 220 }} label="Lifecycle phase">
          {phases.map(item => <MenuItem key={item} value={item}>{item}</MenuItem>)}
        </TextField>
      </Stack>

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={800}>{filtered.length} curriculum modules</Typography>
        {(query || phase !== 'All phases') && <Button onClick={() => { setQuery(''); setPhase('All phases'); }}>Clear filters</Button>}
      </Stack>

      <Grid container spacing={2.5}>
        {filtered.map(topic => (
          <Grid key={topic.slug} size={{ xs: 12, md: 6, xl: 4 }}>
            <Card variant="outlined" sx={{ height: '100%', borderRadius: 3, overflow: 'hidden', transition: 'transform .2s, box-shadow .2s', '&:hover': { transform: 'translateY(-3px)', boxShadow: 6 } }}>
              <CardActionArea component={Link} href={`/learn/${topic.slug}`} sx={{ height: '100%', alignItems: 'stretch' }}>
                <Box sx={{ height: 5, bgcolor: phaseColors[topic.phase] ?? 'primary.main' }} />
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" justifyContent="space-between" gap={2} alignItems="flex-start">
                    <Chip size="small" label={`${String(topic.order).padStart(2, '0')} · ${topic.phase}`} sx={{ bgcolor: `${phaseColors[topic.phase] ?? '#4f46e5'}18`, color: phaseColors[topic.phase] ?? 'primary.main', fontWeight: 700 }} />
                    <Chip size="small" variant="outlined" label={topic.level} />
                  </Stack>
                  <Typography variant="h6" fontWeight={800} sx={{ mt: 2, lineHeight: 1.25 }}>{topic.title}</Typography>
                  <Typography color="text.secondary" sx={{ mt: 1, minHeight: 72 }}>{topic.description}</Typography>
                  <Stack direction="row" gap={2} alignItems="center" sx={{ mt: 2 }} color="text.secondary">
                    <Stack direction="row" gap={0.5} alignItems="center"><AccessTime fontSize="small" /><Typography variant="body2">{topic.estimatedMinutes} min</Typography></Stack>
                    <Stack direction="row" gap={0.5} alignItems="center"><School fontSize="small" /><Typography variant="body2">{topic.learningObjectives.length} objectives</Typography></Stack>
                  </Stack>
                  <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 2, color: 'primary.main' }}><Typography fontWeight={700}>Study module</Typography><ArrowForward fontSize="small" /></Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
      {!filtered.length && <Box sx={{ textAlign: 'center', py: 8 }}><Typography variant="h6">No modules match that search.</Typography><Typography color="text.secondary">Try a broader term such as timing, power, RTL or manufacturing.</Typography></Box>}
    </Box>
  );
}
