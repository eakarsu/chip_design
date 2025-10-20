import { Container, Box, Typography, Paper, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip } from '@mui/material';
import Hero from '@/components/Hero';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hardware Specifications - Documentation',
  description: 'Technical specifications and architecture details for NeuralChip products.',
};

const products = [
  {
    name: 'NeuralChip NC-1000',
    type: 'Entry Level',
    specs: {
      process: '7nm FinFET',
      cores: '16 AI Cores',
      memory: '32GB HBM2',
      bandwidth: '1.2 TB/s',
      power: '150W TDP',
      performance: '100 TOPS',
    },
    useCase: 'Development and small-scale inference',
  },
  {
    name: 'NeuralChip NC-5000',
    type: 'Professional',
    specs: {
      process: '5nm EUV',
      cores: '64 AI Cores',
      memory: '128GB HBM3',
      bandwidth: '4.8 TB/s',
      power: '350W TDP',
      performance: '500 TOPS',
    },
    useCase: 'Production inference and training',
  },
  {
    name: 'NeuralChip NC-10000',
    type: 'Enterprise',
    specs: {
      process: '3nm GAA',
      cores: '256 AI Cores',
      memory: '512GB HBM3E',
      bandwidth: '12.8 TB/s',
      power: '800W TDP',
      performance: '2000 TOPS',
    },
    useCase: 'Large-scale training and data centers',
  },
];

const architectureFeatures = [
  {
    title: 'AI Core Architecture',
    features: [
      'Custom tensor processing units (TPUs)',
      'Mixed-precision FP32/FP16/INT8 support',
      'Hardware-accelerated sparse operations',
      'Optimized matrix multiplication units',
    ],
  },
  {
    title: 'Memory Subsystem',
    features: [
      'High-bandwidth memory (HBM) integration',
      'Multi-level cache hierarchy (L1/L2/L3)',
      'Advanced memory prefetching',
      'On-chip SRAM for ultra-low latency',
    ],
  },
  {
    title: 'Interconnect',
    features: [
      'Proprietary NeuralLink fabric',
      'PCIe Gen 5 host interface',
      'Multi-chip scaling support',
      'Low-latency chip-to-chip communication',
    ],
  },
  {
    title: 'Software Stack',
    features: [
      'CUDA-compatible programming model',
      'PyTorch and TensorFlow native support',
      'Custom compiler optimizations',
      'Automatic kernel fusion',
    ],
  },
];

const supportedFrameworks = [
  { name: 'PyTorch', version: '2.0+', status: 'Full Support' },
  { name: 'TensorFlow', version: '2.12+', status: 'Full Support' },
  { name: 'ONNX', version: '1.14+', status: 'Full Support' },
  { name: 'JAX', version: '0.4+', status: 'Beta' },
  { name: 'MXNet', version: '1.9+', status: 'Community' },
];

export default function HardwarePage() {
  return (
    <>
      <Hero
        title="Hardware Specifications"
        subtitle="Technical specifications and architecture details for NeuralChip products"
        backgroundGradient={false}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Box sx={{ mb: 8 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 4 }}>
            Product Line
          </Typography>
          <Grid container spacing={3}>
            {products.map((product, index) => (
              <Grid item xs={12} key={index}>
                <Paper elevation={0} sx={{ p: 4, border: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                    <Box>
                      <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
                        {product.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {product.useCase}
                      </Typography>
                    </Box>
                    <Chip
                      label={product.type}
                      color={product.type === 'Enterprise' ? 'error' : product.type === 'Professional' ? 'warning' : 'success'}
                    />
                  </Box>
                  <Grid container spacing={3}>
                    {Object.entries(product.specs).map(([key, value]) => (
                      <Grid item xs={6} sm={4} md={2} key={key}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {key.charAt(0).toUpperCase() + key.slice(1)}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {value}
                        </Typography>
                      </Grid>
                    ))}
                  </Grid>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Box sx={{ mb: 8 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 4 }}>
            Architecture Features
          </Typography>
          <Grid container spacing={3}>
            {architectureFeatures.map((feature, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', height: '100%' }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    {feature.title}
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2 }}>
                    {feature.features.map((item, idx) => (
                      <Typography component="li" key={idx} variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {item}
                      </Typography>
                    ))}
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Box sx={{ mb: 8 }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 4 }}>
            Supported Frameworks
          </Typography>
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Framework</TableCell>
                  <TableCell>Version</TableCell>
                  <TableCell>Support Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {supportedFrameworks.map((framework) => (
                  <TableRow key={framework.name}>
                    <TableCell sx={{ fontWeight: 600 }}>{framework.name}</TableCell>
                    <TableCell>{framework.version}</TableCell>
                    <TableCell>
                      <Chip
                        label={framework.status}
                        size="small"
                        color={
                          framework.status === 'Full Support'
                            ? 'success'
                            : framework.status === 'Beta'
                            ? 'warning'
                            : 'default'
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        <Paper elevation={0} sx={{ p: 4, border: '1px solid', borderColor: 'divider', mb: 8 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
            Chip Design Capabilities
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Our hardware is designed to efficiently execute the 70+ chip design algorithms available in our platform:
          </Typography>
          <Grid container spacing={2} sx={{ mt: 2 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 1, textAlign: 'center' }}>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  17
                </Typography>
                <Typography variant="body2">Algorithm Categories</Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Box sx={{ p: 2, bgcolor: 'success.main', color: 'success.contrastText', borderRadius: 1, textAlign: 'center' }}>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  75+
                </Typography>
                <Typography variant="body2">Total Algorithms</Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Box sx={{ p: 2, bgcolor: 'warning.main', color: 'warning.contrastText', borderRadius: 1, textAlign: 'center' }}>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  10x
                </Typography>
                <Typography variant="body2">Faster than CPU</Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Box sx={{ p: 2, bgcolor: 'error.main', color: 'error.contrastText', borderRadius: 1, textAlign: 'center' }}>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  5x
                </Typography>
                <Typography variant="body2">Energy Efficient</Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>

        <Box sx={{ p: 4, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Ready to Get Started?
          </Typography>
          <Typography variant="body2" paragraph>
            Contact our sales team to discuss which NeuralChip product is right for your use case.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Link href="/contact" style={{ color: 'inherit', textDecoration: 'underline' }}>
              Contact Sales →
            </Link>
            <Link href="/benchmarks" style={{ color: 'inherit', textDecoration: 'underline' }}>
              View Benchmarks →
            </Link>
          </Box>
        </Box>
      </Container>
    </>
  );
}
