import { Container, Box, Typography, Grid, Paper, Avatar } from '@mui/material';
import Hero from '@/components/Hero';

const team = [
  {
    name: 'Dr. Sarah Chen',
    role: 'CEO & Co-founder',
    avatar: '👩‍💼',
    bio: 'Former VP of Engineering at NVIDIA. PhD in Computer Architecture from Stanford.',
  },
  {
    name: 'Michael Rodriguez',
    role: 'CTO & Co-founder',
    avatar: '👨‍💻',
    bio: '15+ years in chip design. Previously led AI accelerator team at Google.',
  },
  {
    name: 'Dr. Priya Patel',
    role: 'VP of Research',
    avatar: '👩‍🔬',
    bio: 'AI researcher with 50+ publications. Former Principal Scientist at Meta AI.',
  },
  {
    name: 'James Wilson',
    role: 'VP of Product',
    avatar: '👨‍💼',
    bio: 'Product leader with experience at Intel, AMD, and Apple silicon teams.',
  },
];

const milestones = [
  { year: '2021', event: 'Company founded with $50M Series A funding' },
  { year: '2022', event: 'First NeuralChip C7 accelerator released' },
  { year: '2023', event: 'Reached 10,000+ enterprise customers' },
  { year: '2024', event: 'Raised $200M Series B, valued at $2B' },
];

export default function AboutPage() {
  return (
    <>
      <Hero
        title="About NeuralChip"
        subtitle="Building the future of AI acceleration, one chip at a time"
        backgroundGradient={false}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        {/* Mission */}
        <Box sx={{ mb: 10, textAlign: 'center', maxWidth: 800, mx: 'auto' }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 3 }}>
            Our Mission
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ lineHeight: 1.8 }}>
            To democratize AI acceleration by building the most efficient, accessible, and
            sustainable chip architecture for the next generation of artificial intelligence.
          </Typography>
        </Box>

        {/* Story */}
        <Box sx={{ mb: 10 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 3 }}>
            Our Story
          </Typography>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Typography variant="body1" color="text.secondary" paragraph>
                NeuralChip was founded in 2021 by a team of chip architects and AI researchers who
                saw an opportunity to rethink AI acceleration from the ground up. Traditional GPUs
                and TPUs were powerful but not optimized for the emerging workloads of modern AI.
              </Typography>
              <Typography variant="body1" color="text.secondary" paragraph>
                We started with a simple question: What if we could build a chip specifically
                designed for the way AI models actually work today? This led us to develop our
                revolutionary tensor core architecture with native sparsity support and
                hierarchical memory design.
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="body1" color="text.secondary" paragraph>
                Today, NeuralChip accelerators power some of the world's most demanding AI
                workloads, from large language models to computer vision systems, deployed
                everywhere from data centers to edge devices.
              </Typography>
              <Typography variant="body1" color="text.secondary" paragraph>
                Our team of 200+ engineers spans chip design, compiler optimization, and system
                architecture. We're backed by leading venture capital firms and strategic
                partners in the semiconductor industry.
              </Typography>
            </Grid>
          </Grid>
        </Box>

        {/* Milestones */}
        <Box sx={{ mb: 10 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 4 }}>
            Company Milestones
          </Typography>
          <Grid container spacing={3}>
            {milestones.map((milestone) => (
              <Grid item xs={12} sm={6} md={3} key={milestone.year}>
                <Paper
                  sx={{
                    p: 3,
                    border: '1px solid',
                    borderColor: 'divider',
                    textAlign: 'center',
                    height: '100%',
                  }}
                >
                  <Typography variant="h3" color="primary.main" sx={{ fontWeight: 700 }}>
                    {milestone.year}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {milestone.event}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Leadership Team */}
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 4 }}>
            Leadership Team
          </Typography>
          <Grid container spacing={4}>
            {team.map((member) => (
              <Grid item xs={12} sm={6} md={3} key={member.name}>
                <Box sx={{ textAlign: 'center' }}>
                  <Avatar
                    sx={{
                      width: 120,
                      height: 120,
                      fontSize: '3rem',
                      bgcolor: 'primary.light',
                      mx: 'auto',
                      mb: 2,
                    }}
                  >
                    {member.avatar}
                  </Avatar>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {member.name}
                  </Typography>
                  <Typography variant="body2" color="primary.main" sx={{ mb: 1 }}>
                    {member.role}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {member.bio}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Values */}
        <Box sx={{ mt: 10, p: 4, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
            Our Values
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                🚀 Innovation First
              </Typography>
              <Typography variant="body2" color="text.secondary">
                We push the boundaries of what's possible in chip design and AI acceleration.
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                🌍 Sustainability
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Energy efficiency is core to our design philosophy. AI shouldn't cost the Earth.
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                🤝 Open Ecosystem
              </Typography>
              <Typography variant="body2" color="text.secondary">
                We believe in interoperability and support for all major AI frameworks.
              </Typography>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </>
  );
}
