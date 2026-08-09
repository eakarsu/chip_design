import { Container, Box, Typography, Grid, Card, CardContent, CardMedia, Chip, Stack } from '@mui/material';
import Hero from '@/components/Hero';
import Link from 'next/link';
import { Metadata } from 'next';
import { blogPosts } from './posts';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Latest insights, technical deep dives, and industry updates from the NeuralChip team.',
};

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
              <Link href={`/blog/${post.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <Card
                component="article"
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
              </Link>
            </Grid>
          ))}
        </Grid>
      </Container>
    </>
  );
}
