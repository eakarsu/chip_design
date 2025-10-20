import { Container, Box, Typography, Paper, Stepper, Step, StepLabel, StepContent, Button, Alert } from '@mui/material';
import Hero from '@/components/Hero';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Getting Started - Documentation',
  description: 'Quick start guide to set up your development environment and run your first chip design algorithm.',
};

const steps = [
  {
    label: 'Installation',
    description: `Install the NeuralChip SDK and dependencies. Choose your preferred package manager:`,
    code: `# Using npm
npm install @neuralchip/sdk

# Using pip (Python SDK)
pip install neuralchip

# Using cargo (Rust SDK)
cargo add neuralchip`,
  },
  {
    label: 'Configure Your Environment',
    description: 'Set up your API credentials and configure the SDK:',
    code: `import { NeuralChip } from '@neuralchip/sdk';

const chip = new NeuralChip({
  apiKey: process.env.NEURALCHIP_API_KEY,
  region: 'us-west-2'
});`,
  },
  {
    label: 'Run Your First Algorithm',
    description: 'Execute a placement algorithm to place cells on a chip:',
    code: `const result = await chip.placement.run({
  algorithm: 'simulated_annealing',
  chipWidth: 200,
  chipHeight: 200,
  cells: [
    { id: 'cell1', width: 10, height: 10 },
    { id: 'cell2', width: 15, height: 15 }
  ],
  iterations: 1000
});

console.log('Placement completed:', result);`,
  },
  {
    label: 'Visualize Results',
    description: 'View and analyze your algorithm results:',
    code: `// Use the web interface
// Navigate to http://localhost:3000/visualizations

// Or export results programmatically
await chip.export.toSVG(result, 'output.svg');
await chip.export.toJSON(result, 'output.json');`,
  },
];

export default function GettingStartedPage() {
  return (
    <>
      <Hero
        title="Getting Started"
        subtitle="Quick start guide to set up your development environment and run your first algorithm"
        backgroundGradient={false}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Alert severity="info" sx={{ mb: 4 }}>
          <Typography variant="body2">
            <strong>Prerequisites:</strong> Node.js 18+, Python 3.8+, or Rust 1.70+ depending on your SDK choice.
          </Typography>
        </Alert>

        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <Stepper orientation="vertical" sx={{ p: 3 }}>
            {steps.map((step, index) => (
              <Step key={index} active={true} completed={false}>
                <StepLabel>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {step.label}
                  </Typography>
                </StepLabel>
                <StepContent>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    {step.description}
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      bgcolor: 'grey.900',
                      color: 'grey.100',
                      p: 2,
                      borderRadius: 1,
                      overflow: 'auto',
                      fontSize: '0.875rem',
                      fontFamily: 'monospace',
                    }}
                  >
                    {step.code}
                  </Box>
                </StepContent>
              </Step>
            ))}
          </Stepper>
        </Paper>

        <Box sx={{ mt: 6 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
            What's Next?
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                Explore Algorithm Categories
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Learn about the 70+ algorithms available across 17 categories including placement, routing, floorplanning, and more.
              </Typography>
              <Button component={Link} href="/algorithms" variant="outlined" size="small">
                View Algorithms
              </Button>
            </Paper>

            <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                API Reference
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Complete API documentation for all programming languages and interfaces.
              </Typography>
              <Button component={Link} href="/docs/api" variant="outlined" size="small">
                View API Docs
              </Button>
            </Paper>

            <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                Tutorials & Examples
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Follow step-by-step tutorials covering common use cases and advanced scenarios.
              </Typography>
              <Button component={Link} href="/docs/tutorials" variant="outlined" size="small">
                View Tutorials
              </Button>
            </Paper>
          </Box>
        </Box>

        <Box sx={{ mt: 6, p: 4, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Need Help?
          </Typography>
          <Typography variant="body2" paragraph>
            Join our community or contact support for assistance with setup and development.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button component={Link} href="/contact" variant="outlined" size="small" sx={{ color: 'inherit', borderColor: 'currentColor' }}>
              Contact Support
            </Button>
            <Button component={Link} href="/docs" variant="outlined" size="small" sx={{ color: 'inherit', borderColor: 'currentColor' }}>
              Back to Docs
            </Button>
          </Box>
        </Box>
      </Container>
    </>
  );
}
