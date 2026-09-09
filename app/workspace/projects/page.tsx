import ProjectStarter from '@/components/journey/ProjectStarter';

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const { template } = await searchParams;
  return <ProjectStarter initialTemplate={template === 'fifo' || template === 'mac' ? template : 'gcd'} />;
}
