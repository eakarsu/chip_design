import type { Metadata } from 'next';
import { Box, Button, Card, CardContent, Chip, Container, Stack, Typography } from '@mui/material';
import Grid from '@mui/material/Grid2';
import { ArrowForward, Code, FactCheck, MenuBook, RocketLaunch, School, Search, Settings } from '@mui/icons-material';
import { glossaryTerms, knowledgeTopics, learningPaths } from '@/lib/knowledge/catalog';

export const metadata: Metadata = {
  title: 'Chip Design Knowledge Center',
  description: 'Professional chip-design education, searchable terminology, engineering references, platform documentation and guided tutorials.',
};

const platformDocs = [
  { title: 'Getting Started', description: 'Set up the platform and run your first design exercise.', href: '/docs/getting-started', icon: <RocketLaunch /> },
  { title: 'Tutorials', description: 'Step-by-step exercises for algorithms, flows and analysis.', href: '/docs/tutorials', icon: <School /> },
  { title: 'API Reference', description: 'Integrate platform operations through documented interfaces.', href: '/docs/api', icon: <Code /> },
  { title: 'Optimization Guide', description: 'Explore PPA objectives, tradeoffs and tuning strategies.', href: '/docs/optimization', icon: <Settings /> },
  { title: 'Hardware Guide', description: 'Review architecture and hardware integration material.', href: '/docs/hardware', icon: <FactCheck /> },
  { title: 'SDKs & Tools', description: 'Understand CLI, SDK and development-tool entry points.', href: '/docs/sdks', icon: <MenuBook /> },
];

export default function DocsPage() {
  return (
    <Box>
      <Box sx={{ color: 'white', background: 'linear-gradient(135deg,#071426 0%,#1e3a8a 70%,#4f46e5 150%)', py: { xs: 7, md: 9 } }}>
        <Container maxWidth="xl"><Chip label="KNOWLEDGE CENTER" sx={{ bgcolor: 'rgba(255,255,255,.12)', color: 'white', fontWeight: 800 }} /><Typography component="h1" sx={{ mt: 2, maxWidth: 940, fontSize: { xs: '2.8rem', md: '4.7rem' }, lineHeight: 1.03, letterSpacing: '-.045em', fontWeight: 900 }}>Learn the discipline. Use the tools. Preserve the evidence.</Typography><Typography sx={{ mt: 2, maxWidth: 830, fontSize: '1.2rem', color: 'rgba(255,255,255,.75)', lineHeight: 1.65 }}>Professional education for the complete chip lifecycle, backed by searchable reference material and direct access to implementation and analysis workflows.</Typography><Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} sx={{ mt: 4 }}><Button component="a" href="/learn" variant="contained" size="large" endIcon={<ArrowForward />} sx={{ bgcolor: 'white', color: '#111827' }}>Open Chip Design Academy</Button><Button component="a" href="/glossary" variant="outlined" size="large" startIcon={<Search />} sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>Search terminology</Button></Stack></Container>
      </Box>
      <Container maxWidth="xl" sx={{ py: { xs: 6, md: 9 } }}>
        <Grid container spacing={2.5}>{[[knowledgeTopics.length, 'Curriculum modules', '/learn'], [learningPaths.length, 'Role-based paths', '/learn'], [glossaryTerms.length, 'Technical definitions', '/glossary'], ['Primary', 'Engineering references', '/references']].map(([value, label, href]) => <Grid key={String(label)} size={{ xs: 12, sm: 6, md: 3 }}><Card component="a" href={String(href)} variant="outlined" sx={{ display: 'block', height: '100%', p: 1, textDecoration: 'none', color: 'inherit', borderRadius: 3, '&:hover': { borderColor: 'primary.main', boxShadow: 3 } }}><CardContent><Typography variant="h3" fontWeight={900} color="primary.main">{value}</Typography><Typography fontWeight={750}>{label}</Typography></CardContent></Card></Grid>)}</Grid>

        <Typography variant="overline" color="primary" fontWeight={800} sx={{ display: 'block', mt: 8 }}>PLATFORM DOCUMENTATION</Typography><Typography variant="h3" fontWeight={900}>Build and operate</Typography><Typography color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>Use these guides for the software platform itself. For semiconductor theory and professional workflows, use the Academy.</Typography>
        <Grid container spacing={2.5} sx={{ mt: 1 }}>{platformDocs.map(item => <Grid key={item.href} size={{ xs: 12, md: 6, xl: 4 }}><Card variant="outlined" sx={{ height: '100%', borderRadius: 3 }}><CardContent sx={{ p: 3 }}><Box sx={{ width: 46, height: 46, display: 'grid', placeItems: 'center', borderRadius: 2, bgcolor: 'primary.50', color: 'primary.main' }}>{item.icon}</Box><Typography variant="h5" fontWeight={850} sx={{ mt: 2 }}>{item.title}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>{item.description}</Typography><Button component="a" href={item.href} endIcon={<ArrowForward />} sx={{ mt: 1.5 }}>Open guide</Button></CardContent></Card></Grid>)}</Grid>
      </Container>
    </Box>
  );
}
