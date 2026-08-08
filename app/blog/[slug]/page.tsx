import { Box, Button, Chip, Container, Divider, Stack, Typography } from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { blogPosts, getBlogPost } from '../posts';

export function generateStaticParams() {
  return blogPosts.map(post => ({ slug: post.slug }));
}

type BlogPostPageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  return post ? { title: post.title, description: post.excerpt } : {};
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  return <Box component="article" sx={{ pb: 10 }}>
    <Box sx={{ minHeight: 360, display: 'flex', alignItems: 'end', color: 'white', background: `linear-gradient(180deg,rgba(5,12,28,.2),rgba(5,12,28,.94)),url(${post.image}) center/cover` }}>
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Chip label={post.category} sx={{ bgcolor: 'primary.main', color: 'white' }} />
        <Typography component="h1" sx={{ mt: 2, fontSize: { xs: '2.2rem', md: '3.7rem' }, lineHeight: 1.05, fontWeight: 900 }}>{post.title}</Typography>
        <Typography sx={{ mt: 2, color: 'rgba(255,255,255,.78)' }}>By {post.author} · {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</Typography>
      </Container>
    </Box>
    <Container maxWidth="md" sx={{ pt: 5 }}>
      <Typography variant="h6" color="text.secondary" sx={{ lineHeight: 1.7 }}>{post.excerpt}</Typography>
      <Divider sx={{ my: 4 }} />
      <Stack gap={4}>{post.sections.map(section => <section key={section.heading}><Typography variant="h4" fontWeight={850}>{section.heading}</Typography><Typography sx={{ mt: 1.5, lineHeight: 1.85 }}>{section.body}</Typography></section>)}</Stack>
      <Link href="/blog" style={{ textDecoration: 'none' }}><Button startIcon={<ArrowBack />} sx={{ mt: 5 }}>All engineering articles</Button></Link>
    </Container>
  </Box>;
}
