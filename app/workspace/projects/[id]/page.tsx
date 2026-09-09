import ProjectJourney from '@/components/journey/ProjectJourney';

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  return <ProjectJourney projectId={id} initialView={view === 'engineer' ? 'engineer' : 'learn'} />;
}
