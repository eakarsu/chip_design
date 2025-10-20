import { Box, Container, Typography, Button, Grid, Card, CardContent } from '@mui/material';
import Hero from '@/components/Hero';
import FeatureGrid, { Feature } from '@/components/FeatureGrid';
import Link from 'next/link';

const features: Feature[] = [
  {
    icon: 'bolt',
    title: 'Unprecedented Performance',
    description: 'Achieve up to 500 TOPS with our latest neural processing architecture, optimized for transformer models and large-scale AI workloads.',
  },
  {
    icon: 'energy_savings_leaf',
    title: 'Power Efficient',
    description: 'Industry-leading 15 TOPS/W power efficiency enables deployment from edge devices to data centers without compromise.',
  },
  {
    icon: 'hub',
    title: 'Flexible Architecture',
    description: 'Programmable tensor cores and heterogeneous compute units adapt to diverse AI workloads from vision to language models.',
  },
  {
    icon: 'psychology',
    title: 'Design Algorithms',
    description: 'Comprehensive suite of chip design automation algorithms including placement, routing, floorplanning, synthesis, timing analysis, and power optimization.',
  },
  {
    icon: 'code',
    title: 'Developer Friendly',
    description: 'Comprehensive SDKs, PyTorch/TensorFlow integration, and ONNX support for seamless model deployment and optimization.',
  },
  {
    icon: 'security',
    title: 'Secure Execution',
    description: 'Hardware-level security features including secure boot, encrypted model storage, and isolated inference environments.',
  },
];

const stats = [
  { value: '500', unit: 'TOPS', label: 'Peak Performance' },
  { value: '15', unit: 'TOPS/W', label: 'Power Efficiency' },
  { value: '<1', unit: 'ms', label: 'Latency' },
  { value: '5', unit: 'nm', label: 'Process Node' },
];

export default function HomePage() {
  return (
    <>
      <Hero
        title="Next-Generation AI Chip Architecture"
        subtitle="Pioneering breakthrough performance and efficiency for AI workloads from edge to cloud. Built for the era of foundation models."
        primaryCta={{ label: 'Get Started', href: '/docs' }}
        secondaryCta={{ label: 'View Products', href: '/products' }}
      />

      {/* Stats Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.paper' }}>
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            {stats.map((stat, index) => (
              <Grid item xs={6} md={3} key={index}>
                <Card elevation={0} sx={{ textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
                  <CardContent>
                    <Typography variant="h2" sx={{ fontWeight: 700, color: 'primary.main', mb: 0.5 }}>
                      {stat.value}
                      <Typography component="span" variant="h4" sx={{ ml: 1 }}>
                        {stat.unit}
                      </Typography>
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {stat.label}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Features */}
      <FeatureGrid
        title="Built for the AI Era"
        subtitle="Advanced hardware architecture designed from the ground up for modern deep learning workloads"
        features={features}
      />

      {/* CTA Section */}
      <Box
        sx={{
          py: { xs: 8, md: 12 },
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Container maxWidth="md">
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h3" sx={{ fontWeight: 700, mb: 2 }}>
              Ready to Accelerate Your AI?
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
              Join leading AI companies deploying NeuralChip in production
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button component={Link} href="/algorithms" variant="contained" size="large" sx={{ px: 4 }}>
                Try Algorithms
              </Button>
              <Button component={Link} href="/visualizations" variant="outlined" size="large" sx={{ px: 4 }}>
                View Visualizations
              </Button>
              <Button component={Link} href="/benchmarks" variant="outlined" size="large" sx={{ px: 4 }}>
                View Benchmarks
              </Button>
            </Box>
          </Box>
        </Container>
      </Box>
    </>
  );
}
