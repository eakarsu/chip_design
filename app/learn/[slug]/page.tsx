import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  Alert, Box, Button, Card, CardContent, Chip, Container, Divider, List, ListItem,
  ListItemIcon, ListItemText, Paper, Stack, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import {
  ArrowBack, ArrowForward, CheckCircle, ErrorOutline, FactCheck, Flag, Input,
  Launch, Lightbulb, Output, School, Science,
} from '@mui/icons-material';
import { getKnowledgeTopic, knowledgeTopics, phaseColors } from '@/lib/knowledge/catalog';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return knowledgeTopics.map(topic => ({ slug: topic.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const topic = getKnowledgeTopic(slug);
  if (!topic) return { title: 'Learning module not found' };
  return { title: topic.title, description: topic.description, keywords: topic.keywords };
}

const sectionNav = [
  ['overview', 'Overview'], ['concepts', 'Core concepts'], ['workflow', 'Engineering workflow'],
  ['metrics', 'Metrics'], ['signoff', 'Signoff checklist'], ['practice', 'Practice'], ['references', 'References'],
] as const;

export default async function KnowledgeTopicPage({ params }: Props) {
  const { slug } = await params;
  const topic = getKnowledgeTopic(slug);
  if (!topic) notFound();
  const previous = knowledgeTopics.find(item => item.order === topic.order - 1);
  const next = knowledgeTopics.find(item => item.order === topic.order + 1);
  const related = topic.relatedSlugs.map(getKnowledgeTopic).filter(item => item !== undefined);
  const accent = phaseColors[topic.phase] ?? '#4f46e5';

  return (
    <Box>
      <Box sx={{ color: 'white', background: `linear-gradient(135deg,#071426 0%,${accent} 180%)`, py: { xs: 6, md: 8 } }}>
        <Container maxWidth="xl">
          <Button component="a" href="/learn" startIcon={<ArrowBack />} sx={{ color: 'rgba(255,255,255,.78)', mb: 3 }}>Chip Design Academy</Button>
          <Stack direction="row" gap={1} flexWrap="wrap"><Chip label={`Module ${String(topic.order).padStart(2, '0')}`} sx={{ bgcolor: 'rgba(255,255,255,.14)', color: 'white' }} /><Chip label={topic.phase} sx={{ bgcolor: 'rgba(255,255,255,.14)', color: 'white' }} /><Chip label={topic.level} variant="outlined" sx={{ borderColor: 'rgba(255,255,255,.4)', color: 'white' }} /><Chip label={`${topic.estimatedMinutes} minutes`} variant="outlined" sx={{ borderColor: 'rgba(255,255,255,.4)', color: 'white' }} /></Stack>
          <Typography component="h1" sx={{ fontSize: { xs: '2.55rem', md: '4.5rem' }, maxWidth: 1050, lineHeight: 1.04, fontWeight: 900, letterSpacing: '-.04em', mt: 2 }}>{topic.title}</Typography>
          <Typography sx={{ maxWidth: 850, mt: 2, fontSize: { xs: '1.05rem', md: '1.25rem' }, color: 'rgba(255,255,255,.75)', lineHeight: 1.6 }}>{topic.description}</Typography>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ py: { xs: 5, md: 7 } }}>
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, lg: 3 }}>
            <Box component="aside" sx={{ position: { lg: 'sticky' }, top: 24 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <Typography variant="overline" fontWeight={800} color="text.secondary">IN THIS MODULE</Typography>
                <List dense>{sectionNav.map(([id, label]) => <ListItem key={id} disablePadding><Button component="a" href={`#${id}`} fullWidth sx={{ justifyContent: 'flex-start', color: 'text.primary' }}>{label}</Button></ListItem>)}</List>
              </Paper>
              <Alert severity="info" icon={<School />} sx={{ mt: 2 }}>Educational guidance supports learning and design reviews; project signoff still requires qualified tools, foundry data and accountable engineering approval.</Alert>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, lg: 9 }}>
            <Stack gap={7}>
              <Box component="section" id="overview" sx={{ scrollMarginTop: 24 }}>
                <Typography variant="overline" color="primary" fontWeight={800}>WHY IT MATTERS</Typography>
                <Typography variant="h3" fontWeight={900} sx={{ mt: 0.5 }}>Overview</Typography>
                {topic.overview.map(paragraph => <Typography key={paragraph} sx={{ mt: 2, fontSize: '1.08rem', lineHeight: 1.8, maxWidth: 950 }}>{paragraph}</Typography>)}
                <Paper variant="outlined" sx={{ mt: 3, p: 3, borderRadius: 3, borderLeft: `5px solid ${accent}` }}>
                  <Stack direction="row" gap={1} alignItems="center"><Flag sx={{ color: accent }} /><Typography variant="h6" fontWeight={800}>Learning objectives</Typography></Stack>
                  <Grid container spacing={1.5} sx={{ mt: 1 }}>{topic.learningObjectives.map(item => <Grid key={item} size={{ xs: 12, md: 6 }}><Stack direction="row" gap={1}><CheckCircle color="success" fontSize="small" /><Typography>{item}</Typography></Stack></Grid>)}</Grid>
                </Paper>
              </Box>

              <Box component="section" id="concepts" sx={{ scrollMarginTop: 24 }}>
                <Typography variant="overline" color="primary" fontWeight={800}>TECHNICAL FOUNDATION</Typography><Typography variant="h3" fontWeight={900}>Core concepts</Typography>
                <Grid container spacing={2} sx={{ mt: 1 }}>{topic.concepts.map(item => <Grid key={item.term} size={{ xs: 12, md: 6 }}><Card variant="outlined" sx={{ height: '100%', borderRadius: 3 }}><CardContent sx={{ p: 3 }}><Typography variant="h6" fontWeight={850} color="primary.main">{item.term}</Typography><Typography color="text.secondary" sx={{ mt: 1, lineHeight: 1.7 }}>{item.explanation}</Typography></CardContent></Card></Grid>)}</Grid>
              </Box>

              <Box component="section" id="workflow" sx={{ scrollMarginTop: 24 }}>
                <Typography variant="overline" color="primary" fontWeight={800}>INPUTS → DECISIONS → EVIDENCE</Typography><Typography variant="h3" fontWeight={900}>Engineering workflow</Typography>
                <Stack gap={2} sx={{ mt: 2 }}>{topic.workflow.map((step, index) => <Paper key={step.title} variant="outlined" sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 3 }}><Grid container spacing={2}><Grid size={{ xs: 12, md: 1 }}><Box sx={{ width: 42, height: 42, borderRadius: 2, bgcolor: accent, color: 'white', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{index + 1}</Box></Grid><Grid size={{ xs: 12, md: 5 }}><Typography variant="h6" fontWeight={850}>{step.title}</Typography><Typography color="text.secondary" sx={{ mt: 0.5 }}>{step.detail}</Typography></Grid><Grid size={{ xs: 12, sm: 6, md: 3 }}><Stack direction="row" gap={0.5} alignItems="center"><Input fontSize="small" color="action" /><Typography variant="caption" fontWeight={800}>INPUTS</Typography></Stack>{step.inputs.map(item => <Typography key={item} variant="body2" sx={{ mt: 0.5 }}>• {item}</Typography>)}</Grid><Grid size={{ xs: 12, sm: 6, md: 3 }}><Stack direction="row" gap={0.5} alignItems="center"><Output fontSize="small" color="action" /><Typography variant="caption" fontWeight={800}>OUTPUTS</Typography></Stack>{step.outputs.map(item => <Typography key={item} variant="body2" sx={{ mt: 0.5 }}>• {item}</Typography>)}</Grid></Grid></Paper>)}</Stack>
              </Box>

              <Box component="section" id="metrics" sx={{ scrollMarginTop: 24 }}>
                <Typography variant="overline" color="primary" fontWeight={800}>MEASURE WHAT MATTERS</Typography><Typography variant="h3" fontWeight={900}>Metrics and interpretation</Typography>
                <Grid container spacing={2} sx={{ mt: 1 }}>{topic.metrics.map(metric => <Grid key={metric.term} size={{ xs: 12, sm: 6 }}><Paper variant="outlined" sx={{ p: 2.5, height: '100%', borderRadius: 3 }}><Typography fontWeight={850}>{metric.term}</Typography><Typography color="text.secondary" sx={{ mt: 0.75 }}>{metric.explanation}</Typography></Paper></Grid>)}</Grid>
              </Box>

              <Box component="section" id="signoff" sx={{ scrollMarginTop: 24 }}>
                <Typography variant="overline" color="primary" fontWeight={800}>REVIEW READINESS</Typography><Typography variant="h3" fontWeight={900}>Signoff checklist and pitfalls</Typography>
                <Grid container spacing={2.5} sx={{ mt: 1 }}><Grid size={{ xs: 12, md: 7 }}><Paper variant="outlined" sx={{ p: 3, height: '100%', borderRadius: 3 }}><Stack direction="row" gap={1} alignItems="center"><FactCheck color="success" /><Typography variant="h6" fontWeight={850}>Evidence checklist</Typography></Stack><List>{topic.signoffChecklist.map(item => <ListItem key={item} disableGutters><ListItemIcon sx={{ minWidth: 34 }}><CheckCircle color="success" fontSize="small" /></ListItemIcon><ListItemText primary={item} /></ListItem>)}</List></Paper></Grid><Grid size={{ xs: 12, md: 5 }}><Paper variant="outlined" sx={{ p: 3, height: '100%', borderRadius: 3, bgcolor: 'warning.50' }}><Stack direction="row" gap={1} alignItems="center"><ErrorOutline color="warning" /><Typography variant="h6" fontWeight={850}>Common pitfalls</Typography></Stack><List>{topic.commonPitfalls.map(item => <ListItem key={item} disableGutters><ListItemIcon sx={{ minWidth: 30 }}><Typography color="warning.main">•</Typography></ListItemIcon><ListItemText primary={item} /></ListItem>)}</List></Paper></Grid></Grid>
              </Box>

              <Box component="section" id="practice" sx={{ scrollMarginTop: 24 }}>
                <Typography variant="overline" color="primary" fontWeight={800}>LEARN BY DOING</Typography><Typography variant="h3" fontWeight={900}>Practice and platform tools</Typography>
                <Paper sx={{ p: { xs: 3, md: 4 }, mt: 2, borderRadius: 3, color: 'white', background: `linear-gradient(135deg,${accent},#111827)` }}><Stack direction="row" gap={1} alignItems="center"><Science /><Typography variant="overline" fontWeight={800}>PRACTICAL EXERCISE</Typography></Stack><Typography variant="h5" fontWeight={800} sx={{ mt: 1 }}>{topic.practicalExercise}</Typography></Paper>
                <Grid container spacing={2} sx={{ mt: 1 }}>{topic.tools.map(tool => <Grid key={tool.href} size={{ xs: 12, sm: 6 }}><Card variant="outlined" sx={{ height: '100%', borderRadius: 3 }}><CardContent><Stack direction="row" gap={1} alignItems="center"><Lightbulb color="primary" /><Typography variant="h6" fontWeight={800}>{tool.label}</Typography></Stack><Typography color="text.secondary" sx={{ mt: 1 }}>{tool.purpose}</Typography><Button component="a" href={tool.href} endIcon={<ArrowForward />} sx={{ mt: 1 }}>Open tool</Button></CardContent></Card></Grid>)}</Grid>
              </Box>

              <Box component="section" id="references" sx={{ scrollMarginTop: 24 }}>
                <Typography variant="overline" color="primary" fontWeight={800}>AUTHORITATIVE FOLLOW-UP</Typography><Typography variant="h3" fontWeight={900}>References</Typography>
                {topic.references.length ? <Stack gap={1.5} sx={{ mt: 2 }}>{topic.references.map(reference => <Paper key={reference.href} component="a" href={reference.href} target="_blank" rel="noreferrer" variant="outlined" sx={{ p: 2.5, borderRadius: 3, textDecoration: 'none', color: 'inherit', '&:hover': { borderColor: 'primary.main' } }}><Stack direction="row" justifyContent="space-between" gap={2}><Box><Typography variant="h6" fontWeight={800}>{reference.label}</Typography><Typography variant="caption" color="primary">{reference.publisher}</Typography><Typography color="text.secondary" sx={{ mt: 0.5 }}>{reference.note}</Typography></Box><Launch color="action" /></Stack></Paper>)}</Stack> : <Alert severity="info" sx={{ mt: 2 }}>This module summarizes cross-disciplinary engineering practice. Consult the standards, foundry documentation and qualified tools required by your program.</Alert>}
              </Box>

              <Box><Divider sx={{ mb: 4 }} /><Typography variant="h5" fontWeight={850}>Continue learning</Typography><Grid container spacing={2} sx={{ mt: 1 }}>{related.map(item => <Grid key={item.slug} size={{ xs: 12, md: 4 }}><Card variant="outlined" sx={{ height: '100%', borderRadius: 3 }}><CardContent><Chip size="small" label={item.phase} /><Typography fontWeight={800} sx={{ mt: 1 }}>{item.title}</Typography><Button component="a" href={`/learn/${item.slug}`} endIcon={<ArrowForward />} sx={{ mt: 1 }}>Open module</Button></CardContent></Card></Grid>)}</Grid>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} sx={{ mt: 4 }}>{previous ? <Button component="a" href={`/learn/${previous.slug}`} startIcon={<ArrowBack />}>Previous · {previous.shortTitle}</Button> : <span />}{next && <Button component="a" href={`/learn/${next.slug}`} endIcon={<ArrowForward />}>Next · {next.shortTitle}</Button>}</Stack>
              </Box>
            </Stack>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
