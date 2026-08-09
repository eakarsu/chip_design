import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AcademyLabWorkspace from '@/components/academy/AcademyLabWorkspace';
import { academyLabs, getAcademyLab } from '@/lib/academy/catalog';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return academyLabs.map(lab => ({ slug: lab.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lab = getAcademyLab((await params).slug);
  return lab ? { title: lab.title, description: lab.objective } : { title: 'Academy lab not found' };
}

export default async function AcademyLabPage({ params }: Props) {
  const lab = getAcademyLab((await params).slug);
  if (!lab) notFound();
  return <AcademyLabWorkspace lab={lab} />;
}
