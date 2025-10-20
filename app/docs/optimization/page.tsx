import { Container, Box, Typography, Paper, Grid, Card, CardContent, Chip, List, ListItem, ListItemText } from '@mui/material';
import Hero from '@/components/Hero';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Model Optimization - Documentation',
  description: 'Learn how to optimize chip designs for maximum performance and efficiency.',
};

const optimizationTechniques = [
  {
    title: 'Algorithm Selection',
    description: 'Choose the right algorithm based on your design constraints',
    techniques: [
      'Simulated Annealing for general-purpose optimization',
      'Genetic Algorithms for complex constraint satisfaction',
      'Analytical methods (RePlAce, DREAMPlace) for large-scale designs',
      'Force-Directed for quick iterations during early design stages',
    ],
    complexity: 'Medium',
  },
  {
    title: 'Parameter Tuning',
    description: 'Optimize algorithm parameters for better results',
    techniques: [
      'Adjust iteration count vs. runtime tradeoffs',
      'Tune temperature and cooling rates for Simulated Annealing',
      'Configure population size and mutation rates for Genetic Algorithms',
      'Set appropriate grid sizes for routing algorithms',
    ],
    complexity: 'High',
  },
  {
    title: 'Multi-Objective Optimization',
    description: 'Balance competing objectives in chip design',
    techniques: [
      'Minimize wirelength while reducing congestion',
      'Optimize power consumption alongside performance',
      'Balance area utilization with thermal constraints',
      'Trade-off between timing closure and routing complexity',
    ],
    complexity: 'High',
  },
  {
    title: 'Hierarchical Design',
    description: 'Break complex designs into manageable blocks',
    techniques: [
      'Use floorplanning to partition large designs',
      'Apply divide-and-conquer strategies',
      'Leverage clustering for better locality',
      'Implement incremental optimization workflows',
    ],
    complexity: 'Medium',
  },
  {
    title: 'Timing Optimization',
    description: 'Meet timing constraints and improve clock speeds',
    techniques: [
      'Run Static Timing Analysis early and often',
      'Use buffer insertion to reduce signal delays',
      'Apply clock tree synthesis for minimal skew',
      'Implement retiming for critical path reduction',
    ],
    complexity: 'High',
  },
  {
    title: 'Power Optimization',
    description: 'Reduce power consumption without sacrificing performance',
    techniques: [
      'Enable clock gating for idle logic',
      'Implement voltage scaling (DVFS)',
      'Use power gating for unused blocks',
      'Optimize for leakage reduction',
    ],
    complexity: 'Medium',
  },
];

const bestPractices = [
  'Start with fast algorithms during exploration, use slower but higher-quality algorithms for final optimization',
  'Always validate results with DRC/LVS verification',
  'Use visualization tools to identify problem areas',
  'Leverage AI-powered auto-tuning for parameter optimization',
  'Run comparative analysis to find the best algorithm for your design',
  'Monitor convergence data to detect when to stop iterations',
];

export default function OptimizationPage() {
  return (
    <>
      <Hero
        title="Model Optimization"
        subtitle="Learn how to optimize chip designs for maximum performance and efficiency"
        backgroundGradient={false}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Box sx={{ mb: 6 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
            Optimization Techniques
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Our platform provides 70+ algorithms across 17 categories. Here's how to optimize your designs effectively.
          </Typography>
        </Box>

        <Grid container spacing={3} sx={{ mb: 8 }}>
          {optimizationTechniques.map((technique, index) => (
            <Grid item xs={12} md={6} key={index}>
              <Card elevation={0} sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {technique.title}
                    </Typography>
                    <Chip
                      label={technique.complexity}
                      size="small"
                      color={technique.complexity === 'High' ? 'error' : technique.complexity === 'Medium' ? 'warning' : 'success'}
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    {technique.description}
                  </Typography>
                  <List dense>
                    {technique.techniques.map((item, idx) => (
                      <ListItem key={idx} sx={{ px: 0 }}>
                        <ListItemText
                          primary={item}
                          primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Paper elevation={0} sx={{ p: 4, border: '1px solid', borderColor: 'divider', mb: 8 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
            Best Practices
          </Typography>
          <List>
            {bestPractices.map((practice, index) => (
              <ListItem key={index}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    mr: 2,
                    flexShrink: 0,
                  }}
                />
                <ListItemText
                  primary={practice}
                  primaryTypographyProps={{ variant: 'body1' }}
                />
              </ListItem>
            ))}
          </List>
        </Paper>

        <Box sx={{ mb: 6 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
            Real-World Examples
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  Small Design (&lt;1K cells)
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Use fast algorithms for quick turnaround:
                </Typography>
                <Typography variant="body2" component="pre" sx={{ bgcolor: 'grey.100', p: 2, borderRadius: 1, fontSize: '0.75rem' }}>
{`Placement: Force-Directed (500 iter)
Routing: Global Routing
Runtime: ~2 seconds
Quality: Good`}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  Medium Design (1K-10K cells)
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Balance quality and speed:
                </Typography>
                <Typography variant="body2" component="pre" sx={{ bgcolor: 'grey.100', p: 2, borderRadius: 1, fontSize: '0.75rem' }}>
{`Placement: Simulated Annealing (2K iter)
Routing: A* with FLUTE
Runtime: ~30 seconds
Quality: High`}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  Large Design (&gt;10K cells)
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Use advanced analytical methods:
                </Typography>
                <Typography variant="body2" component="pre" sx={{ bgcolor: 'grey.100', p: 2, borderRadius: 1, fontSize: '0.75rem' }}>
{`Placement: RePlAce/DREAMPlace
Routing: Multi-level hierarchical
Runtime: ~5 minutes
Quality: Optimal`}
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </Box>

        <Box sx={{ p: 4, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Need Help Optimizing Your Design?
          </Typography>
          <Typography variant="body2" paragraph>
            Our AI-powered auto-tuning feature can automatically find the best algorithm and parameters for your specific design.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Link href="/analytics" style={{ color: 'inherit', textDecoration: 'underline' }}>
              Try Auto-Tuning →
            </Link>
            <Link href="/docs/tutorials" style={{ color: 'inherit', textDecoration: 'underline' }}>
              View Tutorials →
            </Link>
          </Box>
        </Box>
      </Container>
    </>
  );
}
