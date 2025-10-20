import { Container, Grid, Box, Typography, Chip, Stack } from '@mui/material';
import Hero from '@/components/Hero';
import ProductCard, { ProductCardProps } from '@/components/ProductCard';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Products',
  description: 'Explore our full range of AI accelerators and neural processors designed for edge, server, and cloud deployments.',
};

const products: ProductCardProps[] = [
  {
    name: 'NeuralChip X1',
    category: 'Edge AI',
    description: 'Compact AI accelerator for edge devices with ultra-low power consumption and real-time inference capabilities.',
    specs: [
      { label: 'Performance', value: '50 TOPS' },
      { label: 'Power', value: '5W TDP' },
      { label: 'Process', value: '5nm' },
      { label: 'Memory', value: '8GB HBM2e' },
    ],
    tags: ['Edge', 'IoT', 'Vision'],
    href: '/products/x1',
  },
  {
    name: 'NeuralChip S3',
    category: 'Server',
    description: 'High-performance server accelerator for data center AI workloads with PCIe 5.0 and advanced cooling.',
    specs: [
      { label: 'Performance', value: '300 TOPS' },
      { label: 'Power', value: '75W TDP' },
      { label: 'Process', value: '5nm' },
      { label: 'Memory', value: '48GB HBM3' },
    ],
    tags: ['Server', 'Training', 'Inference'],
    href: '/products/s3',
  },
  {
    name: 'NeuralChip C7',
    category: 'Cloud',
    description: 'Flagship cloud accelerator optimized for large-scale transformer models and distributed training.',
    specs: [
      { label: 'Performance', value: '500 TOPS' },
      { label: 'Power', value: '300W TDP' },
      { label: 'Process', value: '5nm' },
      { label: 'Memory', value: '96GB HBM3' },
    ],
    tags: ['Cloud', 'LLM', 'Training'],
    href: '/products/c7',
  },
  {
    name: 'NeuralChip E2',
    category: 'Embedded',
    description: 'Embedded AI processor for automotive and industrial applications with functional safety certification.',
    specs: [
      { label: 'Performance', value: '20 TOPS' },
      { label: 'Power', value: '3W TDP' },
      { label: 'Process', value: '7nm' },
      { label: 'Memory', value: '4GB LPDDR5' },
    ],
    tags: ['Automotive', 'Industrial', 'Safety'],
    href: '/products/e2',
  },
  {
    name: 'NeuralChip M5',
    category: 'Mobile',
    description: 'Mobile AI processor designed for smartphones and tablets with advanced power management.',
    specs: [
      { label: 'Performance', value: '35 TOPS' },
      { label: 'Power', value: '2W TDP' },
      { label: 'Process', value: '4nm' },
      { label: 'Memory', value: '6GB LPDDR5X' },
    ],
    tags: ['Mobile', 'Smartphone', 'NPU'],
    href: '/products/m5',
  },
  {
    name: 'NeuralChip V4',
    category: 'Vision',
    description: 'Specialized vision processor for computer vision tasks with hardware-accelerated image preprocessing.',
    specs: [
      { label: 'Performance', value: '100 TOPS' },
      { label: 'Power', value: '15W TDP' },
      { label: 'Process', value: '5nm' },
      { label: 'Memory', value: '16GB HBM2e' },
    ],
    tags: ['Vision', 'ISP', 'Detection'],
    href: '/products/v4',
  },
];

const categories = ['All', 'Edge AI', 'Server', 'Cloud', 'Embedded', 'Mobile', 'Vision'];

export default function ProductsPage() {
  return (
    <>
      <Hero
        title="AI Accelerators for Every Scale"
        subtitle="From edge devices to cloud infrastructure, our neural processors deliver breakthrough performance and efficiency"
        backgroundGradient={false}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        {/* Filter chips */}
        <Box sx={{ mb: 6 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontWeight: 500 }}>
            Filter by category
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {categories.map((category) => (
              <Chip
                key={category}
                label={category}
                clickable
                variant={category === 'All' ? 'filled' : 'outlined'}
                sx={{ mb: 1 }}
              />
            ))}
          </Stack>
        </Box>

        {/* Product Grid */}
        <Grid container spacing={3}>
          {products.map((product, index) => (
            <Grid item xs={12} sm={6} md={4} key={index}>
              <ProductCard {...product} />
            </Grid>
          ))}
        </Grid>
      </Container>
    </>
  );
}
