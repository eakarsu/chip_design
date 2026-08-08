import type { Metadata } from 'next';
import { Box, Button, Card, CardContent, Chip, Container, Divider, Paper, Stack, Typography } from '@mui/material';
import Grid from '@mui/material/Grid2';
import { ArrowBack, FactCheck, Launch, MenuBook, WarningAmber } from '@mui/icons-material';
import { knowledgeTopics, referenceCollections } from '@/lib/knowledge/catalog';

export const metadata: Metadata = {
  title: 'Chip Design Reference Library',
  description: 'Authoritative chip-design specifications, open EDA documentation, format guidance, equations and release checklists.',
};

const formats = [
  ['SystemVerilog / Verilog', 'RTL, testbench, assertion and netlist source', 'Front-end tools'], ['SDC', 'Clocks, IO delays and timing exceptions', 'Synthesis and STA'],
  ['Liberty', 'Cell function, timing, constraints and power', 'Synthesis, STA and power'], ['LEF', 'Technology and cell/macro physical abstracts', 'Place and route'],
  ['DEF', 'Placed and routed design exchange', 'Physical implementation'], ['SPEF', 'Extracted resistance and capacitance', 'Post-route timing and power'],
  ['SDF', 'Delay annotation for timing simulation', 'Gate-level simulation'], ['GDSII / OASIS', 'Final hierarchical mask geometry', 'Physical verification and tapeout'],
  ['UPF', 'Power domains, states, isolation and retention intent', 'Low-power design'], ['SAIF / VCD', 'Switching activity and waveform data', 'Power and debug'],
];

const equations = [
  ['Dynamic power', 'P ≈ α · C · V² · f', 'Activity, switched capacitance, supply voltage and frequency determine first-order switching power.'],
  ['RC time constant', 'τ = R · C', 'A first-order model for charge and discharge behavior.'],
  ['Setup slack', 'Slack = required arrival − actual arrival', 'Negative setup slack means the data arrives too late.'],
  ['Yield sensitivity', 'Good die cost ∝ wafer cost ÷ good die', 'Die area, defect density and process maturity influence economic yield.'],
  ['Target impedance', 'Ztarget ≈ allowed ripple ÷ current step', 'A first-order PDN design target across frequency.'],
  ['Energy efficiency', 'Efficiency = useful operations ÷ joules', 'Always state the workload, precision and boundary of measurement.'],
];

export default function ReferencesPage() {
  const uniqueReferences = [...new Map(knowledgeTopics.flatMap(topic => topic.references).map(item => [item.href, item])).values()];
  return (
    <Box>
      <Box sx={{ color: 'white', background: 'linear-gradient(135deg,#071426,#312e81)', py: { xs: 6, md: 8 } }}><Container maxWidth="xl"><Button component="a" href="/learn" startIcon={<ArrowBack />} sx={{ color: 'rgba(255,255,255,.7)' }}>Chip Design Academy</Button><Stack direction="row" gap={1} alignItems="center" sx={{ mt: 3 }}><FactCheck /><Typography variant="overline" fontWeight={800}>SPECS, FORMATS AND ENGINEERING CHECKS</Typography></Stack><Typography component="h1" sx={{ fontSize: { xs: '2.7rem', md: '4.3rem' }, fontWeight: 900, letterSpacing: '-.04em', mt: 1 }}>Reference Library</Typography><Typography sx={{ mt: 1.5, maxWidth: 800, color: 'rgba(255,255,255,.72)', fontSize: '1.15rem' }}>A curated starting point for authoritative documentation and fast engineering recall. Project requirements, licensed standards and foundry collateral always take precedence.</Typography></Container></Box>
      <Container maxWidth="xl" sx={{ py: { xs: 5, md: 8 } }}>
        <Stack direction="row" gap={1} alignItems="center"><WarningAmber color="warning" /><Typography fontWeight={800}>Reference discipline</Typography></Stack><Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 900 }}>Record the exact specification, PDK, library, rule-deck and tool version used by a project. A web page labeled “latest” is not a release baseline.</Typography>

        <Typography variant="overline" color="primary" fontWeight={800} sx={{ display: 'block', mt: 6 }}>PRIMARY DOCUMENTATION</Typography><Typography variant="h3" fontWeight={900}>Authoritative starting points</Typography>
        <Grid container spacing={2} sx={{ mt: 1 }}>{uniqueReferences.map(reference => <Grid key={reference.href} size={{ xs: 12, md: 6 }}><Card component="a" href={reference.href} target="_blank" rel="noreferrer" variant="outlined" sx={{ height: '100%', borderRadius: 3, textDecoration: 'none', color: 'inherit', '&:hover': { borderColor: 'primary.main', boxShadow: 3 } }}><CardContent sx={{ p: 3 }}><Stack direction="row" justifyContent="space-between"><Chip label={reference.publisher} size="small" /><Launch color="action" /></Stack><Typography variant="h5" fontWeight={850} sx={{ mt: 2 }}>{reference.label}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>{reference.note}</Typography></CardContent></Card></Grid>)}</Grid>

        <Typography variant="overline" color="primary" fontWeight={800} sx={{ display: 'block', mt: 7 }}>DESIGN DATA</Typography><Typography variant="h3" fontWeight={900}>Formats by purpose</Typography>
        <Paper variant="outlined" sx={{ mt: 2, borderRadius: 3, overflow: 'hidden' }}>{formats.map(([format, purpose, consumer], index) => <Box key={format}><Grid container spacing={2} sx={{ p: 2.5 }}><Grid size={{ xs: 12, md: 3 }}><Typography fontWeight={850}>{format}</Typography></Grid><Grid size={{ xs: 12, md: 5 }}><Typography>{purpose}</Typography></Grid><Grid size={{ xs: 12, md: 4 }}><Typography color="text.secondary">Used by: {consumer}</Typography></Grid></Grid>{index < formats.length - 1 && <Divider />}</Box>)}</Paper>

        <Typography variant="overline" color="primary" fontWeight={800} sx={{ display: 'block', mt: 7 }}>QUICK RECALL</Typography><Typography variant="h3" fontWeight={900}>Useful first-order relationships</Typography>
        <Grid container spacing={2} sx={{ mt: 1 }}>{equations.map(([title, equation, detail]) => <Grid key={title} size={{ xs: 12, md: 6, xl: 4 }}><Paper variant="outlined" sx={{ p: 3, height: '100%', borderRadius: 3 }}><Typography variant="overline" color="text.secondary" fontWeight={800}>{title}</Typography><Typography variant="h5" fontFamily="monospace" color="primary.main" fontWeight={850} sx={{ my: 1.5 }}>{equation}</Typography><Typography color="text.secondary">{detail}</Typography></Paper></Grid>)}</Grid>

        <Typography variant="overline" color="primary" fontWeight={800} sx={{ display: 'block', mt: 7 }}>COLLECTIONS</Typography><Typography variant="h3" fontWeight={900}>Follow the source</Typography>
        <Grid container spacing={2} sx={{ mt: 1 }}>{referenceCollections.map(collection => <Grid key={collection.title} size={{ xs: 12, md: 6 }}><Card variant="outlined" sx={{ height: '100%', borderRadius: 3 }}><CardContent sx={{ p: 3 }}><Stack direction="row" gap={1}><MenuBook color="primary" /><Typography variant="h5" fontWeight={850}>{collection.title}</Typography></Stack><Typography color="text.secondary" sx={{ mt: 1 }}>{collection.description}</Typography><Stack gap={1} sx={{ mt: 2 }}>{collection.links.map(link => <Button key={link.href} component="a" href={link.href} target="_blank" rel="noreferrer" endIcon={<Launch />} sx={{ justifyContent: 'space-between' }}>{link.label}</Button>)}</Stack></CardContent></Card></Grid>)}</Grid>
      </Container>
    </Box>
  );
}
