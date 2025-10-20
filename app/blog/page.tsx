import { Container, Box, Typography, Grid, Card, CardContent, CardMedia, Chip, Stack } from '@mui/material';
import Hero from '@/components/Hero';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Latest insights, technical deep dives, and industry updates from the NeuralChip team.',
};

const blogPosts = [
  {
    title: 'Introducing NeuralChip C7: Our Most Powerful AI Accelerator Yet',
    excerpt: 'Deep dive into the architecture and capabilities of our flagship cloud accelerator, delivering 500 TOPS for large-scale AI workloads.',
    author: 'Dr. Sarah Chen',
    date: '2024-01-15',
    category: 'Product Launch',
    image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&h=400&fit=crop',
    slug: 'introducing-neuralchip-c7',
  },
  {
    title: 'Optimizing Transformer Models for Edge Deployment',
    excerpt: 'Learn how to deploy large language models on edge devices using quantization, pruning, and NeuralChip-specific optimizations.',
    author: 'Michael Rodriguez',
    date: '2024-01-10',
    category: 'Tutorial',
    image: 'https://images.unsplash.com/photo-1555255707-c07966088b7b?w=800&h=400&fit=crop',
    slug: 'optimizing-transformers-edge',
  },
  {
    title: 'Achieving 4x Speedup with Hardware Sparsity',
    excerpt: 'Technical exploration of our hardware sparsity engine and how to leverage it for maximum performance gains.',
    author: 'Dr. James Park',
    date: '2024-01-05',
    category: 'Technical',
    image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&h=400&fit=crop',
    slug: 'hardware-sparsity-speedup',
  },
  {
    title: 'MLPerf v3.1 Results: NeuralChip Sets New Records',
    excerpt: 'Our latest MLPerf submissions demonstrate industry-leading performance across inference and training benchmarks.',
    author: 'Emily Watson',
    date: '2023-12-28',
    category: 'Benchmarks',
    image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=400&fit=crop',
    slug: 'mlperf-v3-results',
  },
  {
    title: 'Building Energy-Efficient Data Centers with NeuralChip',
    excerpt: 'Case study on how leading cloud providers are reducing power consumption by 40% using our AI accelerators.',
    author: 'Lisa Zhang',
    date: '2023-12-20',
    category: 'Case Study',
    image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&h=400&fit=crop',
    slug: 'energy-efficient-datacenters',
  },
  {
    title: 'PyTorch 2.2 Support and New SDK Features',
    excerpt: 'Announcing support for PyTorch 2.2 with enhanced compile API integration and new profiling tools.',
    author: 'Alex Thompson',
    date: '2023-12-15',
    category: 'SDK Update',
    image: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=800&h=400&fit=crop',
    slug: 'pytorch-2-2-support',
  },
];

export default function BlogPage() {
  return (
    <>
      <Hero
        title="Insights from NeuralChip"
        subtitle="Technical deep dives, product updates, and industry perspectives from our engineering team"
        backgroundGradient={false}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Grid container spacing={4}>
          {blogPosts.map((post, index) => (
            <Grid item xs={12} md={6} key={index}>
              <Card
                component={Link}
                href={`/blog/${post.slug}`}
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  textDecoration: 'none',
                  transition: 'transform 0.2s ease-in-out',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                  },
                }}
              >
                <CardMedia
                  component="img"
                  height="200"
                  image={post.image}
                  alt={post.title}
                  sx={{ objectFit: 'cover' }}
                />
                <CardContent sx={{ flexGrow: 1, p: 3 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                    <Chip label={post.category} size="small" />
                    <Typography variant="caption" color="text.secondary">
                      {new Date(post.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </Typography>
                  </Stack>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5, color: 'text.primary' }}>
                    {post.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
                    {post.excerpt}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    By {post.author}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </>
  );
}
