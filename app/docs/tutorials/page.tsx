import { Container, Box, Typography, Paper, Grid, Card, CardContent, CardActionArea, Chip } from '@mui/material';
import Hero from '@/components/Hero';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tutorials - Documentation',
  description: 'Step-by-step tutorials covering common use cases and deployment scenarios.',
};

const tutorials = [
  {
    title: 'Your First Placement Algorithm',
    description: 'Learn how to run a basic placement algorithm and visualize the results',
    difficulty: 'Beginner',
    duration: '15 min',
    category: 'Placement',
    steps: [
      'Set up your environment',
      'Load cell data',
      'Run Simulated Annealing',
      'Visualize placement results',
    ],
  },
  {
    title: 'Complete VLSI Design Flow',
    description: 'End-to-end tutorial from logic synthesis to physical verification',
    difficulty: 'Advanced',
    duration: '60 min',
    category: 'Full Flow',
    steps: [
      'Logic synthesis with ABC',
      'Floorplanning with B*-Tree',
      'Placement optimization',
      'Global and detailed routing',
      'Clock tree synthesis',
      'DRC/LVS verification',
    ],
  },
  {
    title: 'Optimizing for Power',
    description: 'Implement power optimization techniques to reduce energy consumption',
    difficulty: 'Intermediate',
    duration: '30 min',
    category: 'Power',
    steps: [
      'Analyze baseline power consumption',
      'Enable clock gating',
      'Configure voltage scaling',
      'Implement power gating',
      'Measure power reduction',
    ],
  },
  {
    title: 'Using Reinforcement Learning',
    description: 'Train an RL agent to optimize placement for your specific design',
    difficulty: 'Advanced',
    duration: '45 min',
    category: 'AI/ML',
    steps: [
      'Prepare training data',
      'Configure DQN agent',
      'Train the model',
      'Evaluate performance',
      'Deploy to production',
    ],
  },
  {
    title: 'Batch Processing & Automation',
    description: 'Automate design optimization workflows for multiple designs',
    difficulty: 'Intermediate',
    duration: '25 min',
    category: 'Automation',
    steps: [
      'Set up batch configuration',
      'Define parameter sweeps',
      'Execute parallel runs',
      'Analyze comparative results',
      'Export reports',
    ],
  },
  {
    title: 'Custom Algorithm Integration',
    description: 'Integrate your own algorithms into the platform',
    difficulty: 'Advanced',
    duration: '40 min',
    category: 'Advanced',
    steps: [
      'Understand the algorithm interface',
      'Implement your algorithm',
      'Write unit tests',
      'Integrate with the platform',
      'Benchmark performance',
    ],
  },
];

const quickstarts = [
  {
    title: 'Run Your First Algorithm',
    description: 'Execute a placement algorithm in under 5 minutes',
    icon: 'rocket_launch',
    link: '/docs/getting-started',
  },
  {
    title: 'Compare Algorithms',
    description: 'Learn how to compare multiple algorithms side-by-side',
    icon: 'compare_arrows',
    link: '/compare',
  },
  {
    title: 'Use AI Auto-Tuning',
    description: 'Let AI find the best algorithm and parameters for your design',
    icon: 'auto_awesome',
    link: '/analytics',
  },
  {
    title: 'Export & Share Results',
    description: 'Export your designs to various formats for collaboration',
    icon: 'share',
    link: '/docs/api',
  },
];

export default function TutorialsPage() {
  return (
    <>
      <Hero
        title="Tutorials"
        subtitle="Step-by-step tutorials covering common use cases and deployment scenarios"
        backgroundGradient={false}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Box sx={{ mb: 8 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
            Quick Starts
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Get started quickly with these essential guides.
          </Typography>
          <Grid container spacing={3}>
            {quickstarts.map((quickstart, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card elevation={0} sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}>
                  <CardActionArea component={Link} href={quickstart.link} sx={{ height: '100%' }}>
                    <CardContent sx={{ p: 3, height: '100%' }}>
                      <Box
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 48,
                          height: 48,
                          borderRadius: 1.5,
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                          mb: 2,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 28 }}>
                          {quickstart.icon}
                        </span>
                      </Box>
                      <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, fontSize: '1rem' }}>
                        {quickstart.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {quickstart.description}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
            In-Depth Tutorials
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph sx={{ mb: 4 }}>
            Comprehensive step-by-step guides for mastering chip design optimization.
          </Typography>
          <Grid container spacing={3}>
            {tutorials.map((tutorial, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Chip
                      label={tutorial.difficulty}
                      size="small"
                      color={
                        tutorial.difficulty === 'Beginner'
                          ? 'success'
                          : tutorial.difficulty === 'Intermediate'
                          ? 'warning'
                          : 'error'
                      }
                    />
                    <Typography variant="caption" color="text.secondary">
                      {tutorial.duration}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      •
                    </Typography>
                    <Typography variant="caption" color="primary">
                      {tutorial.category}
                    </Typography>
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                    {tutorial.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    {tutorial.description}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    What you'll learn:
                  </Typography>
                  <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                    {tutorial.steps.map((step, idx) => (
                      <Typography component="li" key={idx} variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        {step}
                      </Typography>
                    ))}
                  </Box>
                  <Box sx={{ mt: 2 }}>
                    <Link href="/docs/getting-started" style={{ textDecoration: 'none' }}>
                      <Typography variant="body2" color="primary" sx={{ '&:hover': { textDecoration: 'underline' } }}>
                        Start Tutorial →
                      </Typography>
                    </Link>
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Box sx={{ mt: 8, p: 4, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            Video Tutorials
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Prefer learning by watching? Check out our video tutorial series covering everything from basics to advanced topics.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Link href="https://youtube.com" style={{ textDecoration: 'none' }}>
              <Typography variant="body2" color="primary" sx={{ '&:hover': { textDecoration: 'underline' } }}>
                YouTube Channel →
              </Typography>
            </Link>
            <Link href="/blog" style={{ textDecoration: 'none' }}>
              <Typography variant="body2" color="primary" sx={{ '&:hover': { textDecoration: 'underline' } }}>
                Blog Posts →
              </Typography>
            </Link>
            <Link href="/contact" style={{ textDecoration: 'none' }}>
              <Typography variant="body2" color="primary" sx={{ '&:hover': { textDecoration: 'underline' } }}>
                Request Training →
              </Typography>
            </Link>
          </Box>
        </Box>

        <Box sx={{ mt: 6, p: 4, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Have a Tutorial Request?
          </Typography>
          <Typography variant="body2" paragraph>
            Let us know what topics you'd like to see covered in future tutorials.
          </Typography>
          <Link href="/contact" style={{ color: 'inherit', textDecoration: 'underline' }}>
            Submit Feedback →
          </Link>
        </Box>
      </Container>
    </>
  );
}
