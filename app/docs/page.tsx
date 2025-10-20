import { Container, Box, Typography, Grid, Card, CardContent, CardActionArea } from '@mui/material';
import Hero from '@/components/Hero';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation',
  description: 'Complete documentation for NeuralChip SDK, APIs, and hardware integration.',
};

const docSections = [
  {
    title: 'Getting Started',
    icon: 'rocket_launch',
    description: 'Quick start guide to set up your development environment and run your first model',
    href: '/docs/getting-started',
  },
  {
    title: 'API Reference',
    icon: 'api',
    description: 'Complete API documentation for Python, C++, and REST interfaces',
    href: '/docs/api',
  },
  {
    title: 'Model Optimization',
    icon: 'tune',
    description: 'Learn how to optimize models for maximum performance on NeuralChip hardware',
    href: '/docs/optimization',
  },
  {
    title: 'Hardware Specs',
    icon: 'developer_board',
    description: 'Technical specifications and architecture details for all NeuralChip products',
    href: '/docs/hardware',
  },
  {
    title: 'SDKs & Tools',
    icon: 'construction',
    description: 'Download SDKs, command-line tools, and IDE integrations',
    href: '/docs/sdks',
  },
  {
    title: 'Tutorials',
    icon: 'school',
    description: 'Step-by-step tutorials covering common use cases and deployment scenarios',
    href: '/docs/tutorials',
  },
];

export default function DocsPage() {
  return (
    <>
      <Hero
        title="Documentation"
        subtitle="Everything you need to build, optimize, and deploy AI models on NeuralChip hardware"
        primaryCta={{ label: 'Get Started', href: '/docs/getting-started' }}
        secondaryCta={{ label: 'API Reference', href: '/docs/api' }}
        backgroundGradient={false}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Grid container spacing={3}>
          {docSections.map((section, index) => (
            <Grid item xs={12} sm={6} md={4} key={index}>
              <Card elevation={0} sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}>
                <CardActionArea component={Link} href={section.href} sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 3, height: '100%' }}>
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 56,
                        height: 56,
                        borderRadius: 2,
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        mb: 2,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 32 }}>
                        {section.icon}
                      </span>
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                      {section.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {section.description}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Box sx={{ mt: 10, p: 4, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            Need Help?
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Can't find what you're looking for? Our support team is here to help.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Link href="/contact" style={{ textDecoration: 'none' }}>
              <Typography variant="body2" color="primary" sx={{ '&:hover': { textDecoration: 'underline' } }}>
                Contact Support →
              </Typography>
            </Link>
            <Link href="https://github.com" style={{ textDecoration: 'none' }}>
              <Typography variant="body2" color="primary" sx={{ '&:hover': { textDecoration: 'underline' } }}>
                GitHub Issues →
              </Typography>
            </Link>
            <Link href="https://discord.com" style={{ textDecoration: 'none' }}>
              <Typography variant="body2" color="primary" sx={{ '&:hover': { textDecoration: 'underline' } }}>
                Community Discord →
              </Typography>
            </Link>
          </Box>
        </Box>
      </Container>
    </>
  );
}
