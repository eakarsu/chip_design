import type { Metadata } from 'next';
import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { ArrowBack, MenuBook } from '@mui/icons-material';
import GlossaryExplorer from '@/components/knowledge/GlossaryExplorer';
import { glossaryTerms } from '@/lib/knowledge/catalog';

export const metadata: Metadata = {
  title: 'Chip Design Glossary',
  description: 'Searchable definitions for semiconductor architecture, RTL, verification, physical design, signoff, packaging, manufacturing and test.',
};

export default async function GlossaryPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const query = (await searchParams).q;
  const initialQuery = typeof query === 'string' ? query : '';
  return (
    <Box>
      <Box sx={{ bgcolor: '#071426', color: 'white', py: { xs: 6, md: 8 } }}><Container maxWidth="xl"><Button component="a" href="/learn" startIcon={<ArrowBack />} sx={{ color: 'rgba(255,255,255,.7)' }}>Chip Design Academy</Button><Stack direction="row" gap={1} alignItems="center" sx={{ mt: 3 }}><MenuBook /><Typography variant="overline" fontWeight={800}>TECHNICAL LANGUAGE, EXPLAINED</Typography></Stack><Typography component="h1" sx={{ fontSize: { xs: '2.7rem', md: '4.3rem' }, fontWeight: 900, letterSpacing: '-.04em', mt: 1 }}>Chip Design Glossary</Typography><Typography sx={{ mt: 1.5, maxWidth: 760, color: 'rgba(255,255,255,.72)', fontSize: '1.15rem' }}>Clear definitions across architecture, RTL, verification, physical design, signoff, packaging, manufacturing and silicon validation.</Typography></Container></Box>
      <Container maxWidth="xl" sx={{ py: { xs: 5, md: 7 } }}><GlossaryExplorer terms={glossaryTerms} initialQuery={initialQuery} /></Container>
    </Box>
  );
}
