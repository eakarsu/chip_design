import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Box, Button, Card, CardContent, Chip, Container, Paper, Stack, Typography } from '@mui/material';
import Grid from '@mui/material/Grid2';
import { ArrowBack, ArrowForward, CheckCircle, Route, School } from '@mui/icons-material';
import { getKnowledgeTopic, learningPaths } from '@/lib/knowledge/catalog';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return learningPaths.map(path => ({ slug: path.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const path = learningPaths.find(item => item.slug === slug);
  return path ? { title: path.title, description: path.description } : { title: 'Learning path not found' };
}

export default async function LearningPathPage({ params }: Props) {
  const { slug } = await params;
  const path = learningPaths.find(item => item.slug === slug);
  if (!path) notFound();
  const topics = path.topicSlugs.map(getKnowledgeTopic).filter(item => item !== undefined);
  const minutes = topics.reduce((total, topic) => total + topic.estimatedMinutes, 0);

  return (
    <Box>
      <Box sx={{ color: 'white', background: `linear-gradient(135deg,#071426 0%,${path.accent} 160%)`, py: { xs: 7, md: 9 } }}>
        <Container maxWidth="lg"><Button component="a" href="/learn" startIcon={<ArrowBack />} sx={{ color: 'rgba(255,255,255,.75)' }}>All learning paths</Button><Stack direction="row" gap={1} sx={{ mt: 3 }}><Chip icon={<Route />} label={`${topics.length} modules`} sx={{ bgcolor: 'rgba(255,255,255,.14)', color: 'white' }} /><Chip label={`${Math.round(minutes / 60)} hours`} variant="outlined" sx={{ borderColor: 'rgba(255,255,255,.4)', color: 'white' }} /></Stack><Typography component="h1" sx={{ fontSize: { xs: '2.7rem', md: '4.5rem' }, fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.04, mt: 2 }}>{path.title}</Typography><Typography sx={{ mt: 1, color: 'rgba(255,255,255,.65)', fontWeight: 700 }}>{path.audience}</Typography><Typography sx={{ mt: 2, maxWidth: 800, fontSize: '1.2rem', color: 'rgba(255,255,255,.78)', lineHeight: 1.6 }}>{path.description}</Typography></Container>
      </Box>
      <Container maxWidth="lg" sx={{ py: { xs: 5, md: 8 } }}>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 5 }}><Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ sm: 'center' }}><Box sx={{ width: 54, height: 54, borderRadius: 2, bgcolor: `${path.accent}18`, color: path.accent, display: 'grid', placeItems: 'center' }}><School /></Box><Box><Typography variant="overline" color="text.secondary" fontWeight={800}>PROFESSIONAL OUTCOME</Typography><Typography variant="h6" fontWeight={800}>{path.outcome}</Typography></Box></Stack></Paper>
        <Typography variant="overline" color="primary" fontWeight={800}>RECOMMENDED SEQUENCE</Typography><Typography variant="h3" fontWeight={900}>Your curriculum</Typography>
        <Stack gap={2} sx={{ mt: 3 }}>{topics.map((topic, index) => <Card key={topic.slug} variant="outlined" sx={{ borderRadius: 3, borderLeft: `5px solid ${path.accent}` }}><CardContent sx={{ p: 3 }}><Grid container spacing={2} alignItems="center"><Grid size={{ xs: 12, sm: 1 }}><Box sx={{ width: 42, height: 42, borderRadius: '50%', bgcolor: path.accent, color: 'white', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{index + 1}</Box></Grid><Grid size={{ xs: 12, sm: 8 }}><Stack direction="row" gap={1} flexWrap="wrap"><Chip size="small" label={topic.phase} /><Chip size="small" variant="outlined" label={`${topic.estimatedMinutes} min`} /></Stack><Typography variant="h5" fontWeight={850} sx={{ mt: 1 }}>{topic.title}</Typography><Typography color="text.secondary" sx={{ mt: 0.5 }}>{topic.description}</Typography></Grid><Grid size={{ xs: 12, sm: 3 }}><Button component="a" href={`/learn/${topic.slug}`} variant={index === 0 ? 'contained' : 'outlined'} endIcon={<ArrowForward />} fullWidth>{index === 0 ? 'Start here' : 'Study module'}</Button></Grid></Grid></CardContent></Card>)}</Stack>
        <Paper sx={{ mt: 5, p: 3, borderRadius: 3, bgcolor: 'success.50' }}><Stack direction="row" gap={1.5} alignItems="center"><CheckCircle color="success" /><Box><Typography fontWeight={850}>How to use this path</Typography><Typography color="text.secondary">Complete each practical exercise, save evidence from the linked platform tools, and use every module’s checklist for a peer review before advancing.</Typography></Box></Stack></Paper>
      </Container>
    </Box>
  );
}
