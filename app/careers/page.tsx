import { Container, Box, Typography, Grid, Card, CardContent, Button, Chip, Stack } from '@mui/material';
import Hero from '@/components/Hero';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Careers',
  description: 'Join our team building the next generation of AI chip architecture. Open positions in engineering, research, and more.',
};

const openPositions = [
  {
    title: 'Senior ASIC Design Engineer',
    department: 'Hardware',
    location: 'San Francisco, CA',
    type: 'Full-time',
    description: 'Design and verify next-generation tensor processing units using advanced RTL methodologies.',
    requirements: ['10+ years ASIC design', 'Verilog/SystemVerilog', 'Low-power design'],
  },
  {
    title: 'ML Compiler Engineer',
    department: 'Software',
    location: 'Remote',
    type: 'Full-time',
    description: 'Build optimizing compilers for deep learning models targeting custom AI accelerator architectures.',
    requirements: ['LLVM/MLIR experience', 'Graph optimization', 'C++17'],
  },
  {
    title: 'AI Research Scientist',
    department: 'Research',
    location: 'San Francisco, CA',
    type: 'Full-time',
    description: 'Research novel neural network architectures and training techniques optimized for NeuralChip hardware.',
    requirements: ['PhD in ML/AI', 'PyTorch/JAX', 'Published research'],
  },
  {
    title: 'Physical Design Engineer',
    department: 'Hardware',
    location: 'Austin, TX',
    type: 'Full-time',
    description: 'Lead physical implementation from floorplanning through signoff for high-performance AI chips.',
    requirements: ['P&R tools expertise', 'Timing closure', '5nm experience'],
  },
  {
    title: 'Developer Relations Engineer',
    department: 'DevRel',
    location: 'Remote',
    type: 'Full-time',
    description: 'Build relationships with ML community, create technical content, and support external developers.',
    requirements: ['ML framework knowledge', 'Technical writing', 'Public speaking'],
  },
  {
    title: 'Product Marketing Manager',
    department: 'Marketing',
    location: 'San Francisco, CA',
    type: 'Full-time',
    description: 'Define go-to-market strategy and positioning for AI accelerator products in cloud and edge markets.',
    requirements: ['5+ years PMM', 'Technical background', 'B2B experience'],
  },
];

const benefits = [
  {
    icon: 'health_and_safety',
    title: 'Health & Wellness',
    description: 'Comprehensive medical, dental, and vision coverage for you and your family',
  },
  {
    icon: 'savings',
    title: 'Equity & Bonuses',
    description: 'Competitive equity grants and performance-based bonuses',
  },
  {
    icon: 'calendar_today',
    title: 'Flexible PTO',
    description: 'Unlimited paid time off and company holidays',
  },
  {
    icon: 'school',
    title: 'Learning Budget',
    description: '$3,000 annual budget for conferences, courses, and professional development',
  },
  {
    icon: 'home',
    title: 'Remote Flexibility',
    description: 'Hybrid and remote options depending on role',
  },
  {
    icon: 'restaurant',
    title: 'Meals & Snacks',
    description: 'Catered lunches, snacks, and beverages at all offices',
  },
];

export default function CareersPage() {
  return (
    <>
      <Hero
        title="Build the Future of AI Hardware"
        subtitle="Join a world-class team pushing the boundaries of chip architecture and ML infrastructure"
        primaryCta={{ label: 'View Open Roles', href: '#positions' }}
        backgroundGradient={false}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        {/* Values */}
        <Box sx={{ mb: 10, textAlign: 'center' }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
            Why NeuralChip?
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 700, mx: 'auto', mb: 6 }}>
            We're a team of chip architects, ML researchers, and systems engineers united by a shared mission:
            accelerating the AI revolution through groundbreaking hardware innovation.
          </Typography>
        </Box>

        {/* Benefits */}
        <Box sx={{ mb: 10 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 4 }}>
            Benefits & Perks
          </Typography>
          <Grid container spacing={3}>
            {benefits.map((benefit, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card elevation={0} sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}>
                  <CardContent sx={{ textAlign: 'center', p: 3 }}>
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        mb: 2,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 28 }}>
                        {benefit.icon}
                      </span>
                    </Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                      {benefit.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {benefit.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Open Positions */}
        <Box id="positions">
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 4 }}>
            Open Positions
          </Typography>
          <Stack spacing={3}>
            {openPositions.map((position, index) => (
              <Card key={index} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                        {position.title}
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip label={position.department} size="small" />
                        <Chip label={position.location} size="small" variant="outlined" />
                        <Chip label={position.type} size="small" variant="outlined" />
                      </Stack>
                    </Box>
                    <Button
                      component={Link}
                      href={`/careers/${position.title.toLowerCase().replace(/\s+/g, '-')}`}
                      variant="outlined"
                      size="small"
                    >
                      Apply
                    </Button>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {position.description}
                  </Typography>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                      Key requirements:
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                      {position.requirements.map((req, idx) => (
                        <Chip key={idx} label={req} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Box>
      </Container>
    </>
  );
}
