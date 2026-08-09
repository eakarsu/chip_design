import type { MetadataRoute } from 'next';
import { knowledgeTopics, learningPaths } from '@/lib/knowledge/catalog';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://neuralchip.ai';
  const updated = new Date();
  return [
    { url: `${base}/learn`, lastModified: updated, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/glossary`, lastModified: updated, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/references`, lastModified: updated, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/docs`, lastModified: updated, changeFrequency: 'monthly', priority: 0.8 },
    ...knowledgeTopics.map(topic => ({ url: `${base}/learn/${topic.slug}`, lastModified: updated, changeFrequency: 'monthly' as const, priority: 0.85 })),
    ...learningPaths.map(path => ({ url: `${base}/learn/paths/${path.slug}`, lastModified: updated, changeFrequency: 'monthly' as const, priority: 0.75 })),
  ];
}
