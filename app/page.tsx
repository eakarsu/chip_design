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

      {/* AI Features Highlight */}
      <Box
        sx={{
          py: { xs: 8, md: 12 },
          background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.05) 0%, rgba(129, 140, 248, 0.05) 100%)',
          borderTop: '1px solid',
          borderBottom: '1px solid',
          borderColor: 'divider',
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '400px',
            background:
              'radial-gradient(ellipse at top, rgba(79, 70, 229, 0.15), transparent 50%)',
            pointerEvents: 'none',
          },
        }}
      >
        <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                mb: 2,
                animation: 'fadeInDown 0.8s ease-out',
                '@keyframes fadeInDown': {
                  '0%': {
                    opacity: 0,
                    transform: 'translateY(-20px)',
                  },
                  '100%': {
                    opacity: 1,
                    transform: 'translateY(0)',
                  },
                },
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 40,
                  color: 'var(--mui-palette-primary-main)',
                  filter: 'drop-shadow(0 4px 6px rgba(79, 70, 229, 0.3))',
                }}
              >
                auto_awesome
              </span>
              <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
                AI-Powered Design Tools
              </Typography>
            </Box>
            <Typography
              variant="h6"
              color="text.secondary"
              sx={{
                mb: 4,
                maxWidth: '700px',
                mx: 'auto',
                animation: 'fadeIn 1s ease-out 0.2s both',
                '@keyframes fadeIn': {
                  '0%': { opacity: 0 },
                  '100%': { opacity: 1 },
                },
              }}
            >
              15 cutting-edge AI features powered by Claude 3.5 Sonnet to accelerate your chip
              design workflow
            </Typography>
          </Box>

          <Grid container spacing={3}>
            {[
              {
                icon: 'smart_toy',
                title: 'AI Copilot',
                description:
                  'Conversational AI assistant that understands chip design. Get instant help with algorithms, parameters, and optimization strategies.',
                delay: 0,
              },
              {
                icon: 'account_tree',
                title: 'Design Flow Generator',
                description:
                  'Describe your requirements in natural language and get complete multi-step design flows with optimal algorithms and parameters.',
                delay: 0.1,
              },
              {
                icon: 'psychology',
                title: 'Multi-Objective Optimization',
                description:
                  'AI-driven exploration of design space to balance power, performance, and area. Generate Pareto-optimal solutions automatically.',
                delay: 0.2,
              },
            ].map((feature, index) => (
              <Grid item xs={12} md={4} key={feature.title}>
                <Card
                  sx={{
                    height: '100%',
                    border: '1px solid',
                    borderColor: 'divider',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    animation: `fadeInUp 0.6s ease-out ${feature.delay}s both`,
                    '@keyframes fadeInUp': {
                      '0%': {
                        opacity: 0,
                        transform: 'translateY(30px)',
                      },
                      '100%': {
                        opacity: 1,
                        transform: 'translateY(0)',
                      },
                    },
                    '&:hover': {
                      transform: 'translateY(-8px)',
                      boxShadow: '0 20px 40px rgba(79, 70, 229, 0.15)',
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Box
                      sx={{
                        width: 64,
                        height: 64,
                        borderRadius: 2,
                        background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.1), rgba(129, 140, 248, 0.1))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mb: 2,
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 32, color: 'var(--mui-palette-primary-main)' }}
                      >
                        {feature.icon}
                      </span>
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 1.5 }}>
                      {feature.title}
                    </Typography>
                    <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>
                      {feature.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Box
            sx={{
              textAlign: 'center',
              mt: 5,
              animation: 'fadeIn 1s ease-out 0.4s both',
            }}
          >
            <Button
              component={Link}
              href="/ai-features"
              variant="contained"
              size="large"
              startIcon={<span className="material-symbols-outlined">auto_awesome</span>}
              sx={{
                px: 5,
                py: 1.8,
                fontSize: '1.1rem',
                fontWeight: 700,
                borderRadius: 2,
                boxShadow: '0 8px 24px rgba(79, 70, 229, 0.3)',
                background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 12px 32px rgba(79, 70, 229, 0.4)',
                  background: 'linear-gradient(135deg, #4338CA 0%, #6D28D9 100%)',
                },
              }}
            >
              Explore All 15 AI Features
            </Button>
          </Box>
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
