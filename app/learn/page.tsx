import type { Metadata } from 'next';
import {
  Box, Button, Card, CardContent, Chip, Container, Divider, Paper, Stack, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { ArrowForward, AutoStories, FactCheck, MenuBook, Route, Search, WorkspacePremium } from '@mui/icons-material';
import KnowledgeExplorer from '@/components/knowledge/KnowledgeExplorer';
import { glossaryTerms, knowledgeTopics, learningPaths } from '@/lib/knowledge/catalog';

export const metadata: Metadata = {
  title: 'Chip Design Academy',
  description: 'A comprehensive, professional curriculum covering semiconductor fundamentals, architecture, RTL, verification, physical design, signoff, manufacturing and post-silicon validation.',
};

const lifecycle = ['Requirements', 'Architecture', 'RTL', 'Verification', 'Synthesis & DFT', 'Floorplan', 'Place & Route', 'Signoff', 'Tapeout', 'Manufacturing', 'Post-silicon'];

export default function LearnPage() {
  const totalMinutes = knowledgeTopics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0);
  return (
    <Box>
      <Box sx={{ position: 'relative', overflow: 'hidden', color: 'white', background: 'linear-gradient(135deg, #071426 0%, #102a56 52%, #4338ca 140%)', py: { xs: 7, md: 10 } }}>
        <Box aria-hidden sx={{ position: 'absolute', inset: 0, opacity: 0.16, backgroundImage: 'linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px)', backgroundSize: '34px 34px', maskImage: 'linear-gradient(to right, black, transparent)' }} />
        <Container maxWidth="xl" sx={{ position: 'relative' }}>
          <Chip label="CHIP DESIGN ACADEMY" sx={{ bgcolor: 'rgba(255,255,255,.12)', color: 'white', fontWeight: 800, letterSpacing: '.1em' }} />
          <Typography component="h1" sx={{ fontSize: { xs: '2.7rem', md: '4.8rem' }, maxWidth: 900, lineHeight: 1.02, fontWeight: 900, letterSpacing: '-.045em', mt: 2 }}>
            Understand the complete journey from idea to silicon.
          </Typography>
          <Typography sx={{ fontSize: { xs: '1.05rem', md: '1.35rem' }, maxWidth: 820, color: 'rgba(255,255,255,.78)', mt: 2.5, lineHeight: 1.6 }}>
            A rigorous learning system for digital, analog, physical-design, test, packaging and product engineers—with concepts, workflows, signoff checks, practical exercises and direct links to working tools.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} sx={{ mt: 4 }}>
            <Button component="a" href="/academy" variant="contained" size="large" endIcon={<ArrowForward />} sx={{ bgcolor: 'white', color: '#111827', '&:hover': { bgcolor: '#e0e7ff' } }}>Start graded learning</Button>
            <Button component="a" href="#curriculum" variant="outlined" size="large" sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>Explore curriculum</Button>
            <Button component="a" href="/glossary" variant="outlined" size="large" startIcon={<Search />} sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>Search glossary</Button>
          </Stack>
          <Grid container spacing={2} sx={{ mt: 6, maxWidth: 850 }}>
            {[[knowledgeTopics.length, 'Deep modules'], [glossaryTerms.length, 'Engineering terms'], [learningPaths.length, 'Role-based paths'], [Math.round(totalMinutes / 60), 'Hours of curriculum']].map(([value, label]) => <Grid key={String(label)} size={{ xs: 6, md: 3 }}><Box><Typography variant="h4" fontWeight={900}>{value}</Typography><Typography color="rgba(255,255,255,.65)">{label}</Typography></Box></Grid>)}
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ py: { xs: 6, md: 9 } }}>
        <Box component="section" aria-labelledby="lifecycle-heading">
          <Typography variant="overline" color="primary" fontWeight={800}>THE LIFECYCLE AT A GLANCE</Typography>
          <Typography id="lifecycle-heading" variant="h3" fontWeight={900} sx={{ mt: 0.5 }}>One connected engineering system</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 780, fontSize: '1.08rem' }}>Every phase consumes controlled inputs, produces evidence and changes downstream risk. Study the handoffs—not isolated acronyms.</Typography>
          <Paper variant="outlined" sx={{ mt: 3, p: 3, borderRadius: 3, overflowX: 'auto' }}>
            <Stack direction="row" alignItems="center" divider={<ArrowForward color="disabled" />} sx={{ minWidth: 1100 }}>
              {lifecycle.map((item, index) => <Stack key={item} alignItems="center" sx={{ flex: 1, minWidth: 88 }}><Box sx={{ width: 34, height: 34, borderRadius: '50%', bgcolor: index < 5 ? 'primary.main' : index < 9 ? 'secondary.main' : 'success.main', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{index + 1}</Box><Typography variant="caption" fontWeight={700} textAlign="center" sx={{ mt: 1 }}>{item}</Typography></Stack>)}
            </Stack>
          </Paper>
        </Box>

        <Box component="section" sx={{ mt: 9 }}>
          <Typography variant="overline" color="primary" fontWeight={800}>CHOOSE YOUR ROLE</Typography>
          <Typography variant="h3" fontWeight={900} sx={{ mt: 0.5 }}>Learning paths with a professional outcome</Typography>
          <Grid container spacing={2.5} sx={{ mt: 2 }}>
            {learningPaths.map(path => <Grid key={path.slug} size={{ xs: 12, md: 6, xl: 4 }}><Card variant="outlined" sx={{ height: '100%', borderRadius: 3, borderTop: `5px solid ${path.accent}` }}><CardContent sx={{ p: 3 }}><Chip icon={<Route />} label={`${path.topicSlugs.length} modules`} size="small" /><Typography variant="h5" fontWeight={850} sx={{ mt: 2 }}>{path.title}</Typography><Typography variant="body2" color="text.secondary" fontWeight={700}>{path.audience}</Typography><Typography sx={{ mt: 1.5 }}>{path.description}</Typography><Divider sx={{ my: 2 }} /><Typography variant="caption" color="text.secondary" fontWeight={800}>YOU WILL BE ABLE TO</Typography><Typography sx={{ mt: 0.5 }}>{path.outcome}</Typography><Button component="a" href={`/learn/paths/${path.slug}`} endIcon={<ArrowForward />} sx={{ mt: 2 }}>View path</Button></CardContent></Card></Grid>)}
          </Grid>
        </Box>

        <Box id="curriculum" component="section" sx={{ mt: 9, scrollMarginTop: 24 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} alignItems={{ md: 'flex-end' }} sx={{ mb: 3 }}>
            <Box><Typography variant="overline" color="primary" fontWeight={800}>COMPLETE CURRICULUM</Typography><Typography variant="h3" fontWeight={900} sx={{ mt: 0.5 }}>Learn by lifecycle phase</Typography></Box>
            <Stack direction="row" gap={1}><Button component="a" href="/glossary" startIcon={<MenuBook />}>Glossary</Button><Button component="a" href="/references" startIcon={<FactCheck />}>Reference library</Button></Stack>
          </Stack>
          <KnowledgeExplorer topics={knowledgeTopics} />
        </Box>

        <Paper component="section" sx={{ mt: 9, p: { xs: 3, md: 5 }, borderRadius: 4, color: 'white', background: 'linear-gradient(135deg,#312e81,#0f766e)' }}>
          <Grid container spacing={4} alignItems="center"><Grid size={{ xs: 12, md: 8 }}><Stack direction="row" gap={1} alignItems="center"><WorkspacePremium /><Typography variant="overline" fontWeight={800}>FROM KNOWLEDGE TO EVIDENCE</Typography></Stack><Typography variant="h3" fontWeight={900} sx={{ mt: 1 }}>Practice inside the same platform.</Typography><Typography sx={{ mt: 1.5, color: 'rgba(255,255,255,.78)', maxWidth: 760 }}>Each module links to calculators, analyzers, implementation flows and the governed workspace. Educational examples teach concepts; measured project artifacts support engineering decisions.</Typography></Grid><Grid size={{ xs: 12, md: 4 }}><Stack gap={1.5}><Button component="a" href="/workspace" variant="contained" size="large" startIcon={<AutoStories />} sx={{ bgcolor: 'white', color: '#1e1b4b' }}>Open design workspace</Button><Button component="a" href="/flow" variant="outlined" size="large" sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>Explore RTL-to-GDSII flow</Button></Stack></Grid></Grid>
        </Paper>
      </Container>
    </Box>
  );
}
