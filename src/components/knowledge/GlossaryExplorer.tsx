'use client';

import { useMemo, useState } from 'react';
import { Box, Chip, InputAdornment, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import Grid from '@mui/material/Grid2';
import { Search } from '@mui/icons-material';
import type { GlossaryTerm } from '@/lib/knowledge/types';

export default function GlossaryExplorer({ terms, initialQuery = '' }: { terms: GlossaryTerm[]; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState('All categories');
  const categories = useMemo(() => ['All categories', ...new Set(terms.map(item => item.category).sort())], [terms]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return terms.filter(item => (category === 'All categories' || item.category === category)
      && (!needle || `${item.term} ${item.definition} ${item.category}`.toLowerCase().includes(needle)));
  }, [category, query, terms]);

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} sx={{ mb: 3 }}>
        <TextField fullWidth value={query} onChange={event => setQuery(event.target.value)} placeholder="Search abbreviations and engineering terms" slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }} />
        <TextField select label="Category" value={category} onChange={event => setCategory(event.target.value)} sx={{ minWidth: 220 }}>{categories.map(item => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{filtered.length} of {terms.length} terms</Typography>
      <Grid container spacing={2}>
        {filtered.map(item => <Grid key={item.term} size={{ xs: 12, md: 6 }}><Paper variant="outlined" sx={{ p: 2.5, height: '100%', borderRadius: 2.5 }}><Stack direction="row" justifyContent="space-between" gap={1}><Typography variant="h6" fontWeight={800}>{item.term}</Typography><Chip size="small" label={item.category} variant="outlined" /></Stack><Typography color="text.secondary" sx={{ mt: 1 }}>{item.definition}</Typography></Paper></Grid>)}
      </Grid>
    </Box>
  );
}
